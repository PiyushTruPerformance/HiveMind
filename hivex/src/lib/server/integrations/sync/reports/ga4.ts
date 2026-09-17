import 'server-only'

import { db } from '@/lib/server/integrations/supabase'

import { fetchGa4Breakdown, fetchGa4PeriodTotals, type Ga4PeriodRow } from '../ga4'
import { addDays, pyRound } from '../py'
import { unwrap } from '../store'
import {
  dictGet,
  previousHalfYearly,
  previousMonthly,
  previousQuarterly,
  previousWeekly,
  previousYearly,
  sortDesc,
  type PeriodType,
} from './periods'

/**
 * GA4 period reports — port of `services/reports/ga4_report_builder.py`.
 * Totals and breakdowns are live GA4 queries over the exact period, upserted
 * into `client_period_reports`.
 */

type Json = Record<string, unknown>
type Current = Ga4PeriodRow & Json

function growth(current: unknown, previous: unknown): number {
  if (previous === null || previous === undefined || previous === 0) return 0
  const p = Number(previous)
  return pyRound(((Number(current) - p) / p) * 100, 2)
}

const delta = (current: unknown, previous: unknown) => Number(current) - Number(previous)

async function getPeriodTotals(
  integrationId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  clientId: string,
): Promise<Current | null> {
  const totals = await fetchGa4PeriodTotals(integrationId, propertyId, startDate, endDate)
  if (!totals.sessions && !totals.users && !totals.event_count) return null
  return { ...totals, client_id: clientId }
}

async function breakdownList(
  integrationId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  dimension: string,
  label: string,
): Promise<Json[]> {
  const rows = await fetchGa4Breakdown(integrationId, propertyId, startDate, endDate, dimension)
  const items = rows.map((r) => ({
    [label]: r.value,
    sessions: r.sessions,
    users: r.users,
    conversions: r.conversions,
    engagement_rate: r.engagement_rate,
    average_session_duration: r.average_session_duration,
  }))
  return sortDesc(items, (x) => x.sessions as number).slice(0, 10)
}

async function getEvents(integrationId: string, propertyId: string, startDate: string, endDate: string): Promise<Json[]> {
  const rows = await fetchGa4Breakdown(integrationId, propertyId, startDate, endDate, 'eventName', 'eventCount')
  const events = rows.map((r) => ({ event: r.value, count: r.event_count }))
  return sortDesc(events, (x) => x.count).slice(0, 10)
}

function buildCommonPayload(
  periodType: PeriodType,
  clientId: string,
  periodStart: string,
  periodEnd: string,
  current: Current,
  previous: Json,
): Json {
  const title = (() => {
    const t = periodType.replace(/_/g, '-')
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  })()
  const prev = (key: string) => dictGet(previous, key, 0)
  const g = (key: keyof Ga4PeriodRow) => growth(current[key], prev(key))

  return {
    client_id: clientId,
    period_type: periodType,
    period_start: periodStart,
    period_end: periodEnd,
    sessions: current.sessions,
    users: current.users,
    new_users: current.new_users,
    conversions: current.conversions,
    event_count: current.event_count,
    page_views: current.page_views,
    engagement_rate: current.engagement_rate,
    average_session_duration: current.average_session_duration,
    growth_sessions: g('sessions'),
    growth_users: g('users'),
    growth_new_users: g('new_users'),
    growth_conversions: g('conversions'),
    growth_page_views: g('page_views'),
    growth_engagement_rate: g('engagement_rate'),
    ai_summary: `\n${title} Report\n\nSessions: ${current.sessions}\nUsers: ${current.users}\nConversions: ${pyFloatStr(current.conversions)}\n`,
    rag_text: `\nPeriod Type: ${title}\nSessions: ${current.sessions}\nUsers: ${current.users}\nConversions: ${pyFloatStr(current.conversions)}\n`,
    report_payload: {
      headline: [
        { label: 'Sessions', value: current.sessions, growth: g('sessions') },
        { label: 'Users', value: current.users, growth: g('users') },
        { label: 'Conversions', value: current.conversions, growth: g('conversions') },
      ],
      comparison: {
        current_period: {
          sessions: current.sessions,
          users: current.users,
          new_users: current.new_users,
          conversions: current.conversions,
          page_views: current.page_views,
          event_count: current.event_count,
          engagement_rate: current.engagement_rate,
          average_session_duration: current.average_session_duration,
        },
        previous_period: {
          sessions: prev('sessions'),
          users: prev('users'),
          new_users: prev('new_users'),
          conversions: prev('conversions'),
          page_views: prev('page_views'),
          event_count: prev('event_count'),
          engagement_rate: prev('engagement_rate'),
          average_session_duration: prev('average_session_duration'),
        },
      },
      growth: {
        sessions: g('sessions'),
        users: g('users'),
        new_users: g('new_users'),
        conversions: g('conversions'),
        page_views: g('page_views'),
        event_count: g('event_count'),
        engagement_rate: g('engagement_rate'),
      },
      delta: {
        sessions: delta(current.sessions, prev('sessions')),
        users: delta(current.users, prev('users')),
        conversions: delta(current.conversions, prev('conversions')),
        page_views: delta(current.page_views, prev('page_views')),
      },
      top_sources: dictGet(current, 'top_sources', []),
      channels: dictGet(current, 'channels', []),
      top_pages: dictGet(current, 'top_pages', []),
      countries: dictGet(current, 'countries', []),
      devices: dictGet(current, 'devices', []),
      events: dictGet(current, 'events', []),
    },
  }
}

/** Python prints floats with a trailing `.0` (conversions is always a float there). */
function pyFloatStr(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value)
}

async function generatePeriodReport(
  periodType: PeriodType,
  periodStart: string,
  periodEnd: string,
  prevStart: string,
  prevEnd: string,
  clientId: string,
  integrationId: string,
  propertyId: string,
): Promise<void> {
  const current = await getPeriodTotals(integrationId, propertyId, periodStart, periodEnd, clientId)
  if (!current) return

  const previous: Json = (await getPeriodTotals(integrationId, propertyId, prevStart, prevEnd, clientId)) ?? {}

  const args = [integrationId, propertyId, periodStart, periodEnd] as const
  current.top_sources = await breakdownList(...args, 'sessionSourceMedium', 'source')
  current.channels = await breakdownList(...args, 'sessionDefaultChannelGroup', 'channel')
  current.top_pages = await breakdownList(...args, 'landingPagePlusQueryString', 'page')
  current.countries = await breakdownList(...args, 'country', 'country')
  current.devices = await breakdownList(...args, 'deviceCategory', 'device')
  current.events = await getEvents(...args)

  const payload = buildCommonPayload(periodType, clientId, periodStart, periodEnd, current, previous)
  unwrap(
    await db().from('client_period_reports').upsert(payload, { onConflict: 'client_id,period_type,period_start,period_end' }),
    'client_period_reports upsert',
  )
}

export async function generateDailyReport(reportDate: string, clientId: string, integrationId: string, propertyId: string) {
  const previousDate = addDays(reportDate, -1)
  await generatePeriodReport('daily', reportDate, reportDate, previousDate, previousDate, clientId, integrationId, propertyId)
}

export async function generateWeeklyReport(start: string, end: string, clientId: string, integrationId: string, propertyId: string) {
  const { prevStart, prevEnd } = previousWeekly(start)
  await generatePeriodReport('weekly', start, end, prevStart, prevEnd, clientId, integrationId, propertyId)
}

export async function generateMonthlyReport(start: string, end: string, clientId: string, integrationId: string, propertyId: string) {
  const { prevStart, prevEnd } = previousMonthly(start)
  await generatePeriodReport('monthly', start, end, prevStart, prevEnd, clientId, integrationId, propertyId)
}

export async function generateQuarterlyReport(start: string, end: string, clientId: string, integrationId: string, propertyId: string) {
  const { prevStart, prevEnd } = previousQuarterly(start)
  await generatePeriodReport('quarterly', start, end, prevStart, prevEnd, clientId, integrationId, propertyId)
}

export async function generateHalfYearlyReport(start: string, end: string, clientId: string, integrationId: string, propertyId: string) {
  const { prevStart, prevEnd } = previousHalfYearly(start)
  await generatePeriodReport('half_yearly', start, end, prevStart, prevEnd, clientId, integrationId, propertyId)
}

export async function generateYearlyReport(start: string, end: string, clientId: string, integrationId: string, propertyId: string) {
  const { prevStart, prevEnd } = previousYearly(start)
  await generatePeriodReport('yearly', start, end, prevStart, prevEnd, clientId, integrationId, propertyId)
}
