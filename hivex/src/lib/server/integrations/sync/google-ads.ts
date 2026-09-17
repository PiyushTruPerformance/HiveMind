import 'server-only'

import { serverEnv } from '@/lib/server/integrations/env'
import { getGoogleTokens, withGoogleToken } from '@/lib/server/integrations/google-tokens'
import { HttpError, ensureOk } from '@/lib/server/integrations/http'

import { addDays, errorMessage, minDate, pyRound, toFloat, toInt, truthy } from './py'
import { getRealToday } from './real-time'
import { deleteWhere, insertChunked, lastSyncedDate } from './store'

/**
 * Google Ads fetch + store — port of `app/connectors/google_sync/google_ads.py`.
 *
 * The Reporting backend uses the gRPC `google-ads` client; HiveX sends the
 * same GAQL to the REST `googleAds:searchStream` endpoint and maps the
 * camelCase JSON back to the values the gRPC objects expose: enums as their
 * names, int64 as integers, and proto3 defaults (which REST omits) filled in.
 */

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v25'

const METRIC_FIELDS = [
  'metrics.impressions',
  'metrics.clicks',
  'metrics.cost_micros',
  'metrics.conversions',
  'metrics.conversions_value',
  'metrics.ctr',
  'metrics.average_cpc',
]

interface AdsJob {
  name: string
  resource: string
  select: string[]
}

const DIMENSION_JOBS: AdsJob[] = [
  { name: 'overview', resource: 'customer', select: ['segments.date', ...METRIC_FIELDS] },
  {
    name: 'campaigns',
    resource: 'campaign',
    select: ['segments.date', 'campaign.id', 'campaign.name', 'campaign.status', ...METRIC_FIELDS],
  },
  {
    name: 'ad_groups',
    resource: 'ad_group',
    select: ['segments.date', 'campaign.id', 'campaign.name', 'ad_group.id', 'ad_group.name', 'ad_group.status', ...METRIC_FIELDS],
  },
  {
    name: 'keywords',
    resource: 'keyword_view',
    select: [
      'segments.date', 'campaign.id', 'campaign.name', 'ad_group.id', 'ad_group.name',
      'ad_group_criterion.keyword.text', 'ad_group_criterion.keyword.match_type',
      ...METRIC_FIELDS,
    ],
  },
  {
    name: 'search_terms',
    resource: 'search_term_view',
    select: ['segments.date', 'campaign.id', 'ad_group.id', 'search_term_view.search_term', ...METRIC_FIELDS],
  },
  { name: 'devices', resource: 'customer', select: ['segments.date', 'segments.device', ...METRIC_FIELDS] },
  {
    name: 'geo',
    resource: 'geographic_view',
    select: ['segments.date', 'geographic_view.country_criterion_id', ...METRIC_FIELDS],
  },
]

type FieldKind = 'string' | 'enum' | 'int64' | 'double'

const FIELDS: Record<string, { column: string; kind: FieldKind }> = {
  'segments.date': { column: 'metric_date', kind: 'string' },
  'segments.device': { column: 'device', kind: 'enum' },
  'campaign.id': { column: 'campaign_id', kind: 'int64' },
  'campaign.name': { column: 'campaign_name', kind: 'string' },
  'campaign.status': { column: 'campaign_status', kind: 'enum' },
  'ad_group.id': { column: 'ad_group_id', kind: 'int64' },
  'ad_group.name': { column: 'ad_group_name', kind: 'string' },
  'ad_group.status': { column: 'ad_group_status', kind: 'enum' },
  'ad_group_criterion.keyword.text': { column: 'keyword_text', kind: 'string' },
  'ad_group_criterion.keyword.match_type': { column: 'keyword_match_type', kind: 'enum' },
  'search_term_view.search_term': { column: 'search_term', kind: 'string' },
  'geographic_view.country_criterion_id': { column: 'country_criterion_id', kind: 'int64' },
  'metrics.impressions': { column: 'impressions', kind: 'int64' },
  'metrics.clicks': { column: 'clicks', kind: 'int64' },
  'metrics.cost_micros': { column: 'cost_micros', kind: 'int64' },
  'metrics.conversions': { column: 'conversions', kind: 'double' },
  'metrics.conversions_value': { column: 'conversions_value', kind: 'double' },
  'metrics.ctr': { column: 'ctr', kind: 'double' },
  'metrics.average_cpc': { column: 'average_cpc_micros', kind: 'double' },
}

type JsonObject = Record<string, unknown>

const camel = (part: string) => part.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/**
 * Reads a GAQL field path from a REST row. An absent field is the proto3
 * default, which is what the gRPC object would have returned.
 */
function resolveField(row: JsonObject, fieldPath: string): unknown {
  const { kind } = FIELDS[fieldPath]
  let value: unknown = row
  for (const part of fieldPath.split('.')) {
    value = value && typeof value === 'object' ? (value as JsonObject)[camel(part)] : undefined
  }

  if (kind === 'enum') return typeof value === 'string' ? value : 'UNSPECIFIED'
  if (kind === 'string') return typeof value === 'string' ? value : ''
  if (kind === 'double') return typeof value === 'number' ? value : value === undefined || value === null ? 0 : Number(value)
  // int64 arrives as a decimal string over REST; gRPC yields a Python int.
  if (value === undefined || value === null) return 0
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : String(value)
}

function buildQuery(job: AdsJob, dateStr: string): string {
  return `SELECT ${job.select.join(', ')} FROM ${job.resource} WHERE segments.date = '${dateStr}'`
}

function rowToRecord(row: JsonObject, job: AdsJob, customerId: string, clientId: string, clientName: string, dateStr: string) {
  const record: JsonObject = {
    client_id: clientId,
    client_name: clientName,
    customer_id: customerId,
    dimension_group: job.name,
    metric_date: dateStr,
  }
  for (const fieldPath of job.select) record[FIELDS[fieldPath].column] = resolveField(row, fieldPath)

  const costMicros = toFloat(record.cost_micros)
  const avgCpcMicros = toFloat(record.average_cpc_micros)
  delete record.cost_micros
  delete record.average_cpc_micros
  record.cost = pyRound(costMicros / 1_000_000, 4)
  record.average_cpc = pyRound(avgCpcMicros / 1_000_000, 4)
  record.impressions = toInt(record.impressions)
  record.clicks = toInt(record.clicks)
  record.conversions = toFloat(record.conversions)
  record.conversions_value = toFloat(record.conversions_value)
  record.ctr = pyRound(toFloat(record.ctr), 6)
  return record
}

/**
 * The same preconditions `GoogleAdsAuthService.get_client` enforces before
 * any query runs; failing them aborts the Google Ads sync for this client.
 */
async function assertGoogleAdsConfigured(integrationId: string): Promise<string> {
  const developerToken = serverEnv.googleAdsDeveloperToken()
  if (!developerToken) {
    throw new HttpError(
      400,
      'GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for one at https://ads.google.com/aw/apicenter and add it to the server environment.',
    )
  }
  try {
    serverEnv.googleClientId()
    serverEnv.googleClientSecret()
  } catch {
    throw new HttpError(400, 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in the server environment.')
  }
  const tokens = await getGoogleTokens(integrationId, 'google_ads')
  if (!tokens.refreshToken) {
    throw new HttpError(
      400,
      `No refresh_token available for integration_id='${integrationId}'. Google Ads requires a refresh_token — ` +
        "the user must complete the Google OAuth consent flow with the 'google_ads' tool included.",
    )
  }
  return developerToken
}

async function searchStream(integrationId: string, developerToken: string, customerId: string, query: string): Promise<JsonObject[]> {
  const loginCustomerId = serverEnv.googleAdsLoginCustomerId()
  const response = await withGoogleToken(integrationId, 'google_ads', (token) =>
    fetch(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
        ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    }),
  )
  await ensureOk(response, `Google Ads searchStream (${customerId})`)
  const batches = (await response.json()) as { results?: JsonObject[] }[]
  return (Array.isArray(batches) ? batches : []).flatMap((batch) => batch.results ?? [])
}

async function fetchGoogleAdsMetrics(
  integrationId: string,
  customerId: string,
  clientId: string,
  clientName: string,
  dateStr: string,
): Promise<number> {
  const developerToken = await assertGoogleAdsConfigured(integrationId)
  let total = 0

  for (const job of DIMENSION_JOBS) {
    let records: JsonObject[]
    try {
      const rows = await searchStream(integrationId, developerToken, customerId, buildQuery(job, dateStr))
      records = rows.map((row) => rowToRecord(row, job, customerId, clientId, clientName, dateStr))
    } catch (error) {
      // The Reporting backend skips a failing job silently; log so it is at least visible here.
      console.warn(`Google Ads sync: '${job.name}' job failed for client_id=${clientId} date=${dateStr}: ${errorMessage(error)}`)
      continue
    }
    if (!records.length) continue

    await deleteWhere(
      'google_ads_metrics',
      { client_id: clientId, customer_id: customerId, dimension_group: job.name, metric_date: dateStr },
      'google_ads_metrics clear',
    )
    await insertChunked('google_ads_metrics', records, 'google_ads_metrics insert')
    total += records.length
  }
  return total
}

/** Re-fetch this many trailing days even if already synced, to catch attribution updates. */
const SETTLE_WINDOW_DAYS = 3

export async function runGoogleAdsSync(
  integrationId: string,
  customerId: string,
  clientId: string,
  clientName: string,
  days = 3,
): Promise<number> {
  const endDate = addDays(await getRealToday(), -1)

  const lastSynced = await lastSyncedDate('google_ads_metrics', { client_id: clientId, customer_id: customerId })
  const startDate = truthy(lastSynced)
    ? minDate(addDays(lastSynced as string, -(SETTLE_WINDOW_DAYS - 1)), endDate)
    : addDays(endDate, -(days - 1))

  let total = 0
  for (let current = startDate; current <= endDate; current = addDays(current, 1)) {
    total += await fetchGoogleAdsMetrics(integrationId, customerId, clientId, clientName, current)
  }
  return total
}
