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
 * GSC period reports — port of `services/reports/gsc_report_builder.py`.
 * Rolls the stored `gsc_metrics` rows up into `client_gsc_period_reports`.
 */

type Json = Record<string, unknown>

const safeCtr = (clicks: number, impressions: number) => (impressions ? pyRound(clicks / impressions, 6) : 0)

function weightedPosition(rows: Json[]): number {
  let totalImp = 0
  for (const r of rows) totalImp += toFloat(r.impressions)
  if (!totalImp) return 0
  let weighted = 0
  for (const r of rows) weighted += toFloat(r.position) * toFloat(r.impressions)
  return pyRound(weighted / totalImp, 4)
}

async function metricRows(columns: string, group: string, start: string, end: string, clientId: string, propertyUrl: string) {
  return (unwrap(
    await db()
      .from('gsc_metrics')
      .select(columns)
      .eq('dimension_group', group)
      .eq('client_id', clientId)
      .eq('property_url', propertyUrl)
      .gte('metric_date', start)
      .lte('metric_date', end),
    `gsc_metrics ${group} read`,
  ) ?? []) as unknown as Json[]
}

async function getGscTotals(start: string, end: string, clientId: string, propertyUrl: string): Promise<Json | null> {
  const rows = await metricRows('clicks,impressions,position', 'totals', start, end, clientId, propertyUrl)
  if (!rows.length) return null
  let clicksSum = 0
  let impressionsSum = 0
  for (const r of rows) clicksSum += toFloat(r.clicks)
  for (const r of rows) impressionsSum += toFloat(r.impressions)
  const clicks = Math.trunc(clicksSum)
  const impressions = Math.trunc(impressionsSum)
  return { clicks, impressions, ctr: safeCtr(clicks, impressions), position: weightedPosition(rows), client_id: clientId }
}

/** Queries/pages: sum clicks and impressions, impression-weight position, top 25 by clicks. */
async function topByKey(
  column: 'query' | 'page',
  group: string,
  fallbackLabel: string,
  start: string,
  end: string,
  clientId: string,
  propertyUrl: string,
): Promise<Json[]> {
  const rows = await metricRows(`${column},clicks,impressions,position`, group, start, end, clientId, propertyUrl)
  const agg = new Map<unknown, { key: unknown; clicks: number; impressions: number; posXImp: number }>()
  for (const r of rows) {
    const key = or(r[column], fallbackLabel)
    let entry = agg.get(key)
    if (!entry) {
      entry = { key, clicks: 0, impressions: 0, posXImp: 0 }
      agg.set(key, entry)
    }
    entry.clicks += toInt(r.clicks)
    entry.impressions += toInt(r.impressions)
    entry.posXImp += toFloat(r.position) * toFloat(r.impressions)
  }
  const result = [...agg.values()].map((v) => ({
    [column]: v.key,
    clicks: v.clicks,
    impressions: v.impressions,
    ctr: safeCtr(v.clicks, v.impressions),
    position: v.impressions ? pyRound(v.posXImp / v.impressions, 4) : 0,
  }))
  return sortDesc(result, (x) => x.clicks as number).slice(0, 25)
}

/** Countries/devices: sum clicks and impressions, top 10 by clicks. */
async function clicksByKey(column: 'country' | 'device', group: string, start: string, end: string, clientId: string, propertyUrl: string) {
  const rows = await metricRows(`${column},clicks,impressions`, group, start, end, clientId, propertyUrl)
  const agg = new Map<unknown, Json & { clicks: number; impressions: number }>()
  for (const r of rows) {
    const key = or(r[column], 'Unknown')
    let entry = agg.get(key)
    if (!entry) {
      entry = { [column]: key, clicks: 0, impressions: 0 }
      agg.set(key, entry)
    }
    entry.clicks += toInt(r.clicks)
    entry.impressions += toInt(r.impressions)
  }
  return sortDesc([...agg.values()], (x) => x.clicks).slice(0, 10)
}

async function enrich(current: Json, start: string, end: string, clientId: string, propertyUrl: string): Promise<Json> {
  current.top_queries = await topByKey('query', 'queries', '(not provided)', start, end, clientId, propertyUrl)
  current.top_pages = await topByKey('page', 'pages', '(unknown)', start, end, clientId, propertyUrl)
  current.countries = await clicksByKey('country', 'countries', start, end, clientId, propertyUrl)
  current.devices = await clicksByKey('device', 'devices', start, end, clientId, propertyUrl)
  return current
}

function buildPayload(
  periodType: PeriodType,
  clientId: string,
  propertyUrl: string,
  periodStart: string,
  periodEnd: string,
  current: Json,
  previous: Json,
): Json {
  const prev = (key: string) => dictGet(previous, key, 0)
  const g = (key: string) => growth(current[key], prev(key))
  return {
    client_id: clientId,
    property_url: propertyUrl,
    period_type: periodType,
    period_start: periodStart,
    period_end: periodEnd,
    clicks: current.clicks,
    impressions: current.impressions,
    ctr: current.ctr,
    position: current.position,
    growth_clicks: g('clicks'),
    growth_impressions: g('impressions'),
    growth_ctr: g('ctr'),
    growth_position: g('position'),
    report_payload: {
      headline: [
        { label: 'Clicks', value: current.clicks, growth: g('clicks') },
        { label: 'Impressions', value: current.impressions, growth: g('impressions') },
        { label: 'CTR', value: current.ctr, growth: g('ctr') },
        { label: 'Avg Position', value: current.position, growth: g('position') },
      ],
      comparison: {
        current_period: { clicks: current.clicks, impressions: current.impressions, ctr: current.ctr, position: current.position },
        previous_period: { clicks: prev('clicks'), impressions: prev('impressions'), ctr: prev('ctr'), position: prev('position') },
      },
      growth: { clicks: g('clicks'), impressions: g('impressions'), ctr: g('ctr'), position: g('position') },
      top_queries: dictGet(current, 'top_queries', []),
      top_pages: dictGet(current, 'top_pages', []),
      countries: dictGet(current, 'countries', []),
      devices: dictGet(current, 'devices', []),
    },
  }
}

async function upsert(payload: Json): Promise<void> {
  unwrap(
    await db()
      .from('client_gsc_period_reports')
      .upsert(payload, { onConflict: 'client_id,property_url,period_type,period_start,period_end' }),
    'client_gsc_period_reports upsert',
  )
}

async function getPreviousReport(
  periodType: PeriodType,
  clientId: string,
  propertyUrl: string,
  prevStart: string,
  prevEnd: string,
): Promise<Json> {
  const rows = unwrap(
    await db()
      .from('client_gsc_period_reports')
      .select('clicks,impressions,ctr,position')
      .eq('period_type', periodType)
      .eq('client_id', clientId)
      .eq('property_url', propertyUrl)
      .eq('period_start', prevStart)
      .eq('period_end', prevEnd),
    'client_gsc_period_reports previous read',
  ) as Json[] | null
  return rows?.[0] ?? {}
}

/** Daily and weekly compare against freshly summed metrics for the previous range. */
async function generateFromTotals(periodType: PeriodType, start: string, end: string, prevStart: string, prevEnd: string, clientId: string, propertyUrl: string) {
  const current = await getGscTotals(start, end, clientId, propertyUrl)
  if (!current) return
  const previous = (await getGscTotals(prevStart, prevEnd, clientId, propertyUrl)) ?? {}
  await enrich(current, start, end, clientId, propertyUrl)
  await upsert(buildPayload(periodType, clientId, propertyUrl, start, end, current, previous))
}

/** Monthly and longer compare against the stored previous period report. */
async function generateMacro(periodType: PeriodType, start: string, end: string, prevStart: string, prevEnd: string, clientId: string, propertyUrl: string) {
  const current = await getGscTotals(start, end, clientId, propertyUrl)
  if (!current) return
  const previous = await getPreviousReport(periodType, clientId, propertyUrl, prevStart, prevEnd)
  await enrich(current, start, end, clientId, propertyUrl)
  await upsert(buildPayload(periodType, clientId, propertyUrl, start, end, current, previous))
}

export async function generateGscDailyReport(reportDate: string, clientId: string, propertyUrl: string) {
  const prev = addDays(reportDate, -1)
  await generateFromTotals('daily', reportDate, reportDate, prev, prev, clientId, propertyUrl)
}

export async function generateGscWeeklyReport(start: string, end: string, clientId: string, propertyUrl: string) {
  const { prevStart, prevEnd } = previousWeekly(start)
  await generateFromTotals('weekly', start, end, prevStart, prevEnd, clientId, propertyUrl)
}

export async function generateGscMonthlyReport(start: string, end: string, clientId: string, propertyUrl: string) {
  const { prevStart, prevEnd } = previousMonthly(start)
  await generateMacro('monthly', start, end, prevStart, prevEnd, clientId, propertyUrl)
}

export async function generateGscQuarterlyReport(start: string, end: string, clientId: string, propertyUrl: string) {
  const { prevStart, prevEnd } = previousQuarterly(start)
  await generateMacro('quarterly', start, end, prevStart, prevEnd, clientId, propertyUrl)
}

export async function generateGscHalfYearlyReport(start: string, end: string, clientId: string, propertyUrl: string) {
  const { prevStart, prevEnd } = previousHalfYearly(start)
  await generateMacro('half_yearly', start, end, prevStart, prevEnd, clientId, propertyUrl)
}

export async function generateGscYearlyReport(start: string, end: string, clientId: string, propertyUrl: string) {
  const { prevStart, prevEnd } = previousYearly(start)
  await generateMacro('yearly', start, end, prevStart, prevEnd, clientId, propertyUrl)
}
