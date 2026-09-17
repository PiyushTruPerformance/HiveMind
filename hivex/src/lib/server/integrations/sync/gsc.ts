import 'server-only'

import { withGoogleToken } from '@/lib/server/integrations/google-tokens'

import { addDays, diffDays, minDate, pyRound, toFloat } from './py'
import { GSC_TIMEZONE, getRealToday } from './real-time'
import { deleteWhere, insertChunked, lastSyncedDate } from './store'

/**
 * Search Console fetch + store — port of `app/connectors/google_sync/gsc.py`.
 * Each day is pulled per dimension job and written to `gsc_metrics`,
 * replacing that (client, property, search type, job, date) slice.
 */

const GSC_SEARCH_ANALYTICS_URL = 'https://searchconsole.googleapis.com/webmasters/v3/sites/{site_url}/searchAnalytics/query'

const FINALISATION_LAG_DAYS = 3
const ROW_LIMIT = 25000
/** discover/googleNews don't support the query dimension. */
const SEARCH_TYPES = ['web']

const DIMENSION_JOBS: { name: string; dimensions: string[] }[] = [
  { name: 'totals', dimensions: ['date'] },
  { name: 'queries', dimensions: ['date', 'query'] },
  { name: 'pages', dimensions: ['date', 'page'] },
  { name: 'countries', dimensions: ['date', 'country'] },
  { name: 'devices', dimensions: ['date', 'device'] },
  // searchAppearance cannot be combined with ANY other dimension (GSC API constraint)
  { name: 'search_appearance', dimensions: ['searchAppearance'] },
  { name: 'query_page', dimensions: ['date', 'query', 'page'] },
]

const DIMENSION_TO_FIELD: Record<string, string> = {
  date: 'metric_date',
  query: 'query',
  page: 'page',
  country: 'country',
  device: 'device',
  searchAppearance: 'search_appearance',
}

interface GscRow {
  keys?: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

/** `requests.utils.quote(value, safe="")`: encodeURIComponent also escapes !'()*. */
function quoteAll(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** Rows for one job/day across all pages; a non-200 page silently ends the fetch, as in Python. */
async function fetchAllGscRows(
  integrationId: string,
  siteUrl: string,
  dimensions: string[],
  searchType: string,
  dateStr: string,
): Promise<GscRow[]> {
  const url = GSC_SEARCH_ANALYTICS_URL.replace('{site_url}', quoteAll(siteUrl))
  const rows: GscRow[] = []
  let startRow = 0

  for (;;) {
    const payload = {
      startDate: dateStr,
      endDate: dateStr,
      dimensions,
      type: searchType,
      rowLimit: ROW_LIMIT,
      startRow,
    }
    const response = await withGoogleToken(integrationId, 'searchconsole', (token) =>
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60_000),
        cache: 'no-store',
      }),
    )
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined)
      break
    }

    const batch = ((await response.json()) as { rows?: GscRow[] }).rows ?? []
    rows.push(...batch)
    if (batch.length < ROW_LIMIT) break
    startRow += ROW_LIMIT
  }
  return rows
}

function rowsToGscRecords(
  rows: GscRow[],
  dimensions: string[],
  jobName: string,
  propertyUrl: string,
  searchType: string,
  clientId: string,
  clientName: string,
  isFinal: boolean,
  dateStr: string,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const keys = row.keys ?? []
    const record: Record<string, unknown> = {
      client_id: clientId,
      client_name: clientName,
      property_url: propertyUrl,
      search_type: searchType,
      dimension_group: jobName,
      metric_date: dateStr,
      is_final: isFinal,
      clicks: Math.trunc(row.clicks ?? 0),
      impressions: Math.trunc(row.impressions ?? 0),
      ctr: pyRound(toFloat(row.ctr ?? 0), 6),
      position: pyRound(toFloat(row.position ?? 0), 4),
    }
    dimensions.forEach((dim, i) => {
      const field = DIMENSION_TO_FIELD[dim]
      if (field && i < keys.length) record[field] = keys[i]
    })
    return record
  })
}

async function fetchGscMetricsAllJobs(
  integrationId: string,
  siteUrl: string,
  clientId: string,
  clientName: string,
  dateStr: string,
): Promise<number> {
  const isFinal = diffDays(await getRealToday(GSC_TIMEZONE), dateStr) > FINALISATION_LAG_DAYS
  let total = 0

  for (const job of DIMENSION_JOBS) {
    for (const searchType of SEARCH_TYPES) {
      const rows = await fetchAllGscRows(integrationId, siteUrl, job.dimensions, searchType, dateStr)
      if (!rows.length) continue
      const records = rowsToGscRecords(rows, job.dimensions, job.name, siteUrl, searchType, clientId, clientName, isFinal, dateStr)
      await deleteWhere(
        'gsc_metrics',
        { client_id: clientId, property_url: siteUrl, search_type: searchType, dimension_group: job.name, metric_date: dateStr },
        'gsc_metrics clear',
      )
      await insertChunked('gsc_metrics', records, 'gsc_metrics insert')
      total += records.length
    }
  }
  return total
}

export async function runGscSync(
  integrationId: string,
  siteUrl: string,
  clientId: string,
  clientName: string,
  days = 3,
): Promise<number> {
  const endDate = addDays(await getRealToday(GSC_TIMEZONE), -1)

  const lastSynced = await lastSyncedDate('gsc_metrics', { client_id: clientId, property_url: siteUrl })
  // Incremental: resume just before the finalisation-lag window, since GSC data finalises 2-3 days late.
  const startDate = lastSynced
    ? minDate(addDays(lastSynced, -(FINALISATION_LAG_DAYS - 1)), endDate)
    : addDays(endDate, -(days - 1))

  let total = 0
  for (let current = startDate; current <= endDate; current = addDays(current, 1)) {
    total += await fetchGscMetricsAllJobs(integrationId, siteUrl, clientId, clientName, current)
  }
  return total
}
