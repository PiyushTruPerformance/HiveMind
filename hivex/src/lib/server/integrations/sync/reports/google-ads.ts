import 'server-only'

import { db } from '@/lib/server/integrations/supabase'

import { addDays, or, pyRound, toFloat, toInt } from '../py'
import { unwrap } from '../store'
import {
  dictGet,
  growthFalsy as growth,
  previousHalfYearly,
  previousMonthly,
  previousQuarterly,
  previousWeekly,
  previousYearly,
  sortDesc,
  type PeriodType,
} from './periods'

/**
 * Google Ads period reports — port of `services/reports/google_ads_report_builder.py`.
 * Rolls stored `google_ads_metrics` rows up into `client_google_ads_period_reports`.
 */

type Json = Record<string, unknown>

const HEADLINE_KEYS = ['impressions', 'clicks', 'cost', 'conversions', 'conversions_value', 'ctr', 'cpc', 'cpa', 'roas']

const safeRatio = (numerator: number, denominator: number, digits = 4) =>
  denominator ? pyRound(numerator / denominator, digits) : 0

async function metricRows(columns: string, group: string, start: string, end: string, clientId: string, customerId: string) {
  return (unwrap(
    await db()
      .from('google_ads_metrics')
      .select(columns)
      .eq('dimension_group', group)
      .eq('client_id', clientId)
      .eq('customer_id', customerId)
      .gte('metric_date', start)
      .lte('metric_date', end),
    `google_ads_metrics ${group} read`,
  ) ?? []) as unknown as Json[]
}

function sum(rows: Json[], column: string): number {
  let total = 0
  for (const r of rows) total += toFloat(r[column])
  return total
}

async function getGoogleAdsTotals(start: string, end: string, clientId: string, customerId: string): Promise<Json | null> {
  const rows = await metricRows('impressions,clicks,cost,conversions,conversions_value', 'overview', start, end, clientId, customerId)
  if (!rows.length) return null

  const impressions = Math.trunc(sum(rows, 'impressions'))
  const clicks = Math.trunc(sum(rows, 'clicks'))
  const cost = pyRound(sum(rows, 'cost'), 4)
  const conversions = pyRound(sum(rows, 'conversions'), 4)
  const conversionsValue = pyRound(sum(rows, 'conversions_value'), 4)
  return {
    impressions,
    clicks,
    cost,
    conversions,
    conversions_value: conversionsValue,
    ctr: safeRatio(clicks, impressions, 6),
    cpc: safeRatio(cost, clicks),
    cpa: safeRatio(cost, conversions),
    roas: safeRatio(conversionsValue, cost),
    client_id: clientId,
  }
}

interface Bucket extends Json {
  impressions: number
  clicks: number
  cost: number
  conversions: number
}

/** Groups rows by `keyOf`, summing impressions/clicks/cost/conversions in first-seen order. */
function aggregate(rows: Json[], keyOf: (r: Json) => { id: string; fields: Json }): Bucket[] {
  const agg = new Map<string, Bucket>()
  for (const r of rows) {
    const { id, fields } = keyOf(r)
    let entry = agg.get(id)
    if (!entry) {
      entry = { ...fields, impressions: 0, clicks: 0, cost: 0, conversions: 0 }
      agg.set(id, entry)
    }
    entry.impressions += toInt(r.impressions)
    entry.clicks += toInt(r.clicks)
    entry.cost += toFloat(r.cost)
    entry.conversions += toFloat(r.conversions)
  }
  return [...agg.values()]
}

/** Map keys must distinguish 2840 from '2840' as a Python dict would. */
const keyId = (...values: unknown[]) => JSON.stringify(values)

async function enrich(current: Json, start: string, end: string, clientId: string, customerId: string): Promise<Json> {
  const campaigns = await metricRows('campaign_name,impressions,clicks,cost,conversions', 'campaigns', start, end, clientId, customerId)
  current.top_campaigns = sortDesc(
    aggregate(campaigns, (r) => {
      const name = or(r.campaign_name, '(unknown)')
      return { id: keyId(name), fields: { campaign: name } }
    }),
    (x) => x.cost,
  ).slice(0, 25)

  const keywords = await metricRows(
    'keyword_text,keyword_match_type,impressions,clicks,cost,conversions',
    'keywords', start, end, clientId, customerId,
  )
  current.top_keywords = sortDesc(
    aggregate(keywords, (r) => {
      const text = or(r.keyword_text, '(unknown)')
      const matchType = or(r.keyword_match_type, '')
      return { id: keyId(text, matchType), fields: { keyword: text, match_type: matchType } }
    }),
    (x) => x.clicks,
  ).slice(0, 25)

  const terms = await metricRows('search_term,impressions,clicks,cost,conversions', 'search_terms', start, end, clientId, customerId)
  current.top_search_terms = sortDesc(
    aggregate(terms, (r) => {
      const term = or(r.search_term, '(unknown)')
      return { id: keyId(term), fields: { search_term: term } }
    }),
    (x) => x.clicks,
  ).slice(0, 25)

  const devices = await metricRows('device,impressions,clicks,cost,conversions', 'devices', start, end, clientId, customerId)
  current.devices = sortDesc(
    aggregate(devices, (r) => {
      const device = or(r.device, 'Unknown')
      return { id: keyId(device), fields: { device } }
    }),
    (x) => x.cost,
  )

  const geo = await metricRows('country_criterion_id,impressions,clicks,cost,conversions', 'geo', start, end, clientId, customerId)
  current.geo = sortDesc(
    aggregate(geo, (r) => {
      const country = or(r.country_criterion_id, 'Unknown')
      return { id: keyId(country), fields: { country_criterion_id: country } }
    }),
    (x) => x.cost,
  ).slice(0, 10)

  return current
}

function buildPayload(
  periodType: PeriodType,
  clientId: string,
  customerId: string,
  periodStart: string,
  periodEnd: string,
  current: Json,
  previous: Json,
): Json {
  const growthByKey: Record<string, number> = {}
  for (const k of HEADLINE_KEYS) growthByKey[k] = growth(dictGet(current, k, 0), dictGet(previous, k, 0))
  const pick = (source: Json) => Object.fromEntries(HEADLINE_KEYS.map((k) => [k, dictGet(source, k, 0)]))

  return {
    client_id: clientId,
    customer_id: customerId,
    period_type: periodType,
    period_start: periodStart,
    period_end: periodEnd,
    ...pick(current),
    ...Object.fromEntries(HEADLINE_KEYS.map((k) => [`growth_${k}`, growthByKey[k]])),
    report_payload: {
      headline: HEADLINE_KEYS.map((k) => ({ label: k, value: dictGet(current, k, 0), growth: growthByKey[k] })),
      comparison: { current_period: pick(current), previous_period: pick(previous) },
      growth: growthByKey,
      top_campaigns: dictGet(current, 'top_campaigns', []),
      top_keywords: dictGet(current, 'top_keywords', []),
      top_search_terms: dictGet(current, 'top_search_terms', []),
      devices: dictGet(current, 'devices', []),
      geo: dictGet(current, 'geo', []),
    },
  }
}

async function upsert(payload: Json): Promise<void> {
  unwrap(
    await db()
      .from('client_google_ads_period_reports')
      .upsert(payload, { onConflict: 'client_id,customer_id,period_type,period_start,period_end' }),
    'client_google_ads_period_reports upsert',
  )
}

async function getPreviousReport(
  periodType: PeriodType,
  clientId: string,
  customerId: string,
  prevStart: string,
  prevEnd: string,
): Promise<Json> {
  const rows = unwrap(
    await db()
      .from('client_google_ads_period_reports')
      .select(HEADLINE_KEYS.join(','))
      .eq('period_type', periodType)
      .eq('client_id', clientId)
      .eq('customer_id', customerId)
      .eq('period_start', prevStart)
      .eq('period_end', prevEnd),
    'client_google_ads_period_reports previous read',
  ) as unknown as Json[] | null
  return rows?.[0] ?? {}
}

/** Daily and weekly compare against freshly summed metrics for the previous range. */
async function generateFromTotals(periodType: PeriodType, start: string, end: string, prevStart: string, prevEnd: string, clientId: string, customerId: string) {
  const current = await getGoogleAdsTotals(start, end, clientId, customerId)
  if (!current) return
  const previous = (await getGoogleAdsTotals(prevStart, prevEnd, clientId, customerId)) ?? {}
  await enrich(current, start, end, clientId, customerId)
  await upsert(buildPayload(periodType, clientId, customerId, start, end, current, previous))
}

/** Monthly and longer compare against the stored previous period report. */
async function generateMacro(periodType: PeriodType, start: string, end: string, prevStart: string, prevEnd: string, clientId: string, customerId: string) {
  const current = await getGoogleAdsTotals(start, end, clientId, customerId)
  if (!current) return
  const previous = await getPreviousReport(periodType, clientId, customerId, prevStart, prevEnd)
  await enrich(current, start, end, clientId, customerId)
  await upsert(buildPayload(periodType, clientId, customerId, start, end, current, previous))
}

export async function generateGoogleAdsDailyReport(reportDate: string, clientId: string, customerId: string) {
  const prev = addDays(reportDate, -1)
  await generateFromTotals('daily', reportDate, reportDate, prev, prev, clientId, customerId)
}

export async function generateGoogleAdsWeeklyReport(start: string, end: string, clientId: string, customerId: string) {
  const { prevStart, prevEnd } = previousWeekly(start)
  await generateFromTotals('weekly', start, end, prevStart, prevEnd, clientId, customerId)
}

export async function generateGoogleAdsMonthlyReport(start: string, end: string, clientId: string, customerId: string) {
  const { prevStart, prevEnd } = previousMonthly(start)
  await generateMacro('monthly', start, end, prevStart, prevEnd, clientId, customerId)
}

export async function generateGoogleAdsQuarterlyReport(start: string, end: string, clientId: string, customerId: string) {
  const { prevStart, prevEnd } = previousQuarterly(start)
  await generateMacro('quarterly', start, end, prevStart, prevEnd, clientId, customerId)
}

export async function generateGoogleAdsHalfYearlyReport(start: string, end: string, clientId: string, customerId: string) {
  const { prevStart, prevEnd } = previousHalfYearly(start)
  await generateMacro('half_yearly', start, end, prevStart, prevEnd, clientId, customerId)
}

export async function generateGoogleAdsYearlyReport(start: string, end: string, clientId: string, customerId: string) {
  const { prevStart, prevEnd } = previousYearly(start)
  await generateMacro('yearly', start, end, prevStart, prevEnd, clientId, customerId)
}
