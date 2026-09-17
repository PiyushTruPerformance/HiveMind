import 'server-only'

import { withGoogleToken } from '@/lib/server/integrations/google-tokens'
import { ensureOk } from '@/lib/server/integrations/http'

import { addDays, errorMessage, isValidIsoDate, isoYearWeek, minDate, pyRound, safeFloat, safeInt } from './py'
import { getRealToday } from './real-time'
import { deleteWhere, insertChunked, lastSyncedDate } from './store'

/**
 * GA4 fetch + store — port of `app/connectors/google_sync/ga4.py`.
 *
 * Each synced day is fetched once per request group (overview, traffic, …)
 * and written to `ga4_metrics` by replacing that client's rows for the day.
 * Period totals and breakdowns are live dimensionless GA4 queries so GA4
 * dedupes users and weights rates over the whole range itself.
 */

const GOOGLE_ANALYTICS_DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const GOOGLE_ANALYTICS_ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'

const FULL_METRICS = [
  'sessions', 'engagedSessions', 'screenPageViews', 'newUsers', 'totalUsers',
  'conversions', 'eventCount', 'averageSessionDuration', 'engagementRate',
]

interface RequestGroup {
  name: string
  dimensions: string[]
  metrics: string[]
}

const REQUEST_GROUPS: RequestGroup[] = [
  { name: 'overview', dimensions: ['date'], metrics: FULL_METRICS },
  {
    name: 'traffic',
    dimensions: ['date', 'sessionDefaultChannelGroup', 'sessionSourceMedium', 'sessionSource', 'sessionMedium', 'hostName'],
    metrics: FULL_METRICS,
  },
  {
    name: 'pages',
    dimensions: ['date', 'landingPagePlusQueryString', 'pagePath', 'pageTitle', 'contentGroup'],
    metrics: FULL_METRICS,
  },
  { name: 'geo', dimensions: ['date', 'country', 'region', 'city'], metrics: FULL_METRICS },
  { name: 'devices', dimensions: ['date', 'deviceCategory', 'browser', 'operatingSystem'], metrics: FULL_METRICS },
  {
    name: 'events',
    dimensions: ['date', 'eventName'],
    metrics: ['eventCount', 'sessions', 'engagedSessions', 'screenPageViews', 'newUsers', 'totalUsers', 'conversions'],
  },
  {
    name: 'acquisition',
    dimensions: ['date', 'firstUserSource', 'firstUserMedium', 'firstUserCampaignName'],
    metrics: FULL_METRICS,
  },
  { name: 'campaigns', dimensions: ['date', 'sessionCampaignName'], metrics: FULL_METRICS },
]

const DIMENSION_FIELD_MAP: Record<string, string> = {
  date: 'metric_date',
  sessionDefaultChannelGroup: 'session_default_channel_group',
  sessionSourceMedium: 'session_source_medium',
  sessionSource: 'session_source',
  sessionMedium: 'session_medium',
  hostName: 'hostname',
  landingPagePlusQueryString: 'landing_page_plus_query_string',
  pagePath: 'page_path',
  pageTitle: 'page_title',
  contentGroup: 'content_group',
  deviceCategory: 'device_category',
  browser: 'browser',
  operatingSystem: 'operating_system',
  country: 'country',
  region: 'region',
  city: 'city',
  eventName: 'event_name',
  firstUserSource: 'first_user_source',
  firstUserMedium: 'first_user_medium',
  firstUserCampaignName: 'first_user_campaign',
  sessionCampaignName: 'session_campaign',
}

const METRIC_FIELD_MAP: Record<string, string> = {
  sessions: 'sessions',
  engagedSessions: 'engaged_sessions',
  screenPageViews: 'screen_page_views',
  newUsers: 'new_users',
  totalUsers: 'total_users',
  conversions: 'conversions',
  eventCount: 'event_count',
  averageSessionDuration: 'average_session_duration',
  engagementRate: 'engagement_rate',
}

type Row = Record<string, unknown>

interface Ga4ReportJson {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[]
}

/** GA4 dates are YYYYMMDD; anything unparseable passes through unchanged. */
export function normalizeGa4Date(value: string): string {
  if (!value) return new Date().toISOString().slice(0, 10)
  if (/^\d{8}$/.test(value)) {
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    if (isValidIsoDate(iso)) return iso
  }
  if (isValidIsoDate(value)) return value
  return value
}

function engagementPct(value: unknown): number {
  const raw = safeFloat(value)
  return pyRound(raw <= 1 ? raw * 100 : raw, 2)
}

function applyDimension(record: Row, dimName: string, rawValue: string): void {
  const field = DIMENSION_FIELD_MAP[dimName]
  if (!field) return
  record[field] = field === 'metric_date' ? normalizeGa4Date(rawValue) : rawValue || null
  if ((field === 'first_user_campaign' || field === 'session_campaign') && !record.campaign) {
    record.campaign = rawValue || null
  }
}

function applyMetric(record: Row, metricName: string, rawValue: unknown): void {
  const field = METRIC_FIELD_MAP[metricName]
  if (!field) return
  if (field === 'engagement_rate') record[field] = engagementPct(rawValue)
  else if (field === 'average_session_duration' || field === 'conversions') record[field] = pyRound(safeFloat(rawValue), 2)
  else record[field] = safeInt(rawValue)
}

async function runReport(
  integrationId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  metrics: string[],
  orderByMetric?: string,
  limit?: number,
): Promise<Ga4ReportJson> {
  const propertyRef = propertyId.replace('properties/', '')
  const payload: Record<string, unknown> = {
    dateRanges: [{ startDate, endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
  }
  if (orderByMetric) payload.orderBys = [{ metric: { metricName: orderByMetric }, desc: true }]
  if (limit) payload.limit = limit

  const response = await withGoogleToken(integrationId, 'analytics', (token) =>
    fetch(`${GOOGLE_ANALYTICS_DATA_API}/properties/${propertyRef}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
      cache: 'no-store',
    }),
  )
  await ensureOk(response, `GA4 runReport (${propertyRef}, ${startDate}..${endDate})`)
  return (await response.json()) as Ga4ReportJson
}

/**
 * Reads the property's configured reporting timezone from the Admin API.
 * A non-200 response is logged and yields null; token/network errors throw.
 */
export async function fetchGa4PropertyTimezone(integrationId: string, propertyId: string): Promise<string | null> {
  const propertyRef = propertyId.replace('properties/', '')
  const response = await withGoogleToken(integrationId, 'analytics', (token) =>
    fetch(`${GOOGLE_ANALYTICS_ADMIN_API}/properties/${propertyRef}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    }),
  )
  if (response.status !== 200) {
    const body = await response.text().catch(() => '')
    console.warn(`GA4 sync: couldn't fetch property timezone for ${propertyId}: ${response.status} ${body}`)
    return null
  }
  const data = (await response.json()) as { timeZone?: string }
  return data.timeZone || null
}

function rowsFromReportJson(report: Ga4ReportJson, dimNames: string[], metricNames: string[]): Record<string, string>[] {
  return (report.rows ?? []).map((row) => {
    const dimValues = row.dimensionValues ?? []
    const metricValues = row.metricValues ?? []
    const item: Record<string, string> = {}
    dimNames.forEach((name, idx) => {
      item[name] = idx < dimValues.length ? (dimValues[idx].value ?? '') : ''
    })
    metricNames.forEach((name, idx) => {
      item[name] = idx < metricValues.length ? (metricValues[idx].value ?? '0') : '0'
    })
    return item
  })
}

async function fetchGa4MetricsAllGroups(
  integrationId: string,
  propertyId: string,
  clientId: string,
  clientName: string,
  dateStr: string,
): Promise<Row[]> {
  const yearWeek = isoYearWeek(dateStr)
  const records: Row[] = []

  for (const group of REQUEST_GROUPS) {
    let report: Ga4ReportJson
    try {
      report = await runReport(integrationId, propertyId, dateStr, dateStr, group.dimensions, group.metrics)
    } catch (error) {
      // Same as the Reporting backend: one failing group must not sink the day.
      console.warn(`GA4 sync: '${group.name}' group failed for client_id=${clientId} date=${dateStr}: ${errorMessage(error)}`)
      continue
    }

    for (const row of rowsFromReportJson(report, group.dimensions, group.metrics)) {
      const record: Row = {
        client_id: clientId,
        client_name: clientName,
        metric_date: dateStr,
        year_week: yearWeek,
        dimension_group: group.name,
      }
      for (const dim of group.dimensions) applyDimension(record, dim, row[dim] ?? '')
      for (const metric of group.metrics) applyMetric(record, metric, row[metric] ?? 0)
      records.push(record)
    }
  }
  return records
}

const PERIOD_TOTAL_METRICS = FULL_METRICS

export interface Ga4PeriodRow {
  sessions: number
  users: number
  new_users: number
  conversions: number
  event_count: number
  page_views: number
  engagement_rate: number
  average_session_duration: number
}

function normalizePeriodRow(row: Record<string, string>): Ga4PeriodRow {
  return {
    sessions: safeInt(row.sessions),
    users: safeInt(row.totalUsers),
    new_users: safeInt(row.newUsers),
    conversions: pyRound(safeFloat(row.conversions), 2),
    event_count: safeInt(row.eventCount),
    page_views: safeInt(row.screenPageViews),
    engagement_rate: engagementPct(row.engagementRate),
    average_session_duration: pyRound(safeFloat(row.averageSessionDuration), 2),
  }
}

/** True totals for [startDate, endDate] in one dimensionless GA4 request. */
export async function fetchGa4PeriodTotals(
  integrationId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4PeriodRow> {
  const report = await runReport(integrationId, propertyId, startDate, endDate, [], PERIOD_TOTAL_METRICS)
  const rows = rowsFromReportJson(report, [], PERIOD_TOTAL_METRICS)
  return normalizePeriodRow(rows[0] ?? {})
}

/** Top-N buckets of one dimension, ordered and limited server-side by GA4. */
export async function fetchGa4Breakdown(
  integrationId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  dimension: string,
  orderByMetric = 'sessions',
  topN = 10,
): Promise<(Ga4PeriodRow & { value: string })[]> {
  const report = await runReport(integrationId, propertyId, startDate, endDate, [dimension], PERIOD_TOTAL_METRICS, orderByMetric, topN)
  return rowsFromReportJson(report, [dimension], PERIOD_TOTAL_METRICS).map((row) => ({
    value: row[dimension] || 'Unknown',
    ...normalizePeriodRow(row),
  }))
}

/** Re-fetch this many trailing days even if already synced, to catch late revisions. */
const SETTLE_WINDOW_DAYS = 3

export async function runGa4Sync(
  integrationId: string,
  propertyId: string,
  clientId: string,
  clientName: string,
  days = 90,
  timezoneName: string | null = null,
): Promise<number> {
  const endDate = addDays(await getRealToday(timezoneName || 'UTC'), -1)

  const lastSynced = await lastSyncedDate('ga4_metrics', { client_id: clientId })
  const startDate = lastSynced
    ? minDate(addDays(lastSynced, -(SETTLE_WINDOW_DAYS - 1)), endDate)
    : addDays(endDate, -days)

  let total = 0
  for (let current = startDate; current <= endDate; current = addDays(current, 1)) {
    const records = await fetchGa4MetricsAllGroups(integrationId, propertyId, clientId, clientName, current)
    if (records.length) {
      await deleteWhere('ga4_metrics', { client_id: clientId, metric_date: current }, 'ga4_metrics clear')
      await insertChunked('ga4_metrics', records, 'ga4_metrics insert')
      total += records.length
    }
  }
  return total
}
