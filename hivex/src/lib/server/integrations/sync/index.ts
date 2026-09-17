import 'server-only'

import { HttpError } from '@/lib/server/integrations/http'

import { getClientProperties, saveGa4Timezone } from './client-properties'
import { fetchGa4PropertyTimezone, runGa4Sync } from './ga4'
import { runGoogleAdsSync } from './google-ads'
import { runGscSync } from './gsc'
import { addDays, dateParts, errorMessage, makeDate, weekday } from './py'
import { GSC_TIMEZONE, getRealToday } from './real-time'
import * as ga4Reports from './reports/ga4'
import * as adsReports from './reports/google-ads'
import * as gscReports from './reports/gsc'
import { clearOpenPeriodRow } from './store'

/**
 * Google data sync — port of `ConnectorSyncService.sync_client`.
 *
 * Pulls GA4, Search Console and Google Ads data for one reporting client into
 * the shared Supabase tables and rebuilds the open daily-to-yearly period
 * reports that Reporting OS reads. A source without a mapped resource is
 * skipped; a failing source is recorded under `errors` and the others still run.
 * Missing client_properties or integration throws (HttpError 400).
 */

export type SyncSource = 'ga4' | 'gsc' | 'google_ads'

export interface SourceSyncResult {
  rows_synced: number
  reports_generated: string[]
}

export interface SyncResult {
  ga4: SourceSyncResult | null
  gsc: SourceSyncResult | null
  google_ads: SourceSyncResult | null
  errors: Partial<Record<SyncSource, string>>
}

export interface SyncOptions {
  days?: number
  /** Subset of sources to run; omitted means all. */
  sources?: Set<SyncSource>
}

const REPORTS_GENERATED = ['daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly']

interface PeriodBoundaries {
  yesterday: string
  week_start: string
  month_start: string
  quarter_start: string
  half_start: string
  year_start: string
}

function periodBoundaries(today: string): PeriodBoundaries {
  const { year, month } = dateParts(today)
  const quarter = Math.floor((month - 1) / 3) + 1
  return {
    yesterday: addDays(today, -1),
    week_start: addDays(today, -weekday(today)),
    month_start: makeDate(year, month, 1),
    quarter_start: makeDate(year, (quarter - 1) * 3 + 1, 1),
    half_start: makeDate(year, month <= 6 ? 1 : 7, 1),
    year_start: makeDate(year, 1, 1),
  }
}

export async function syncClient(clientId: string, options: SyncOptions = {}): Promise<SyncResult> {
  const days = options.days ?? 3
  const wants = (source: SyncSource) => !options.sources || options.sources.has(source)

  const props = await getClientProperties(clientId)
  const integrationId = props.integration_id
  const clientName = props.client_name || clientId
  const today = await getRealToday()
  const bounds = periodBoundaries(today)

  const result: SyncResult = { ga4: null, gsc: null, google_ads: null, errors: {} }

  if (!integrationId) {
    throw new HttpError(400, `client_properties.integration_id is not set for client_id='${clientId}'.`)
  }

  if (props.ga4_property_id && wants('ga4')) {
    try {
      const propertyId = props.ga4_property_id

      // GA4 buckets data by the property's own timezone; resolve it once and
      // cache it. Best-effort: fall back to the UTC `today` if it can't be read.
      let ga4Timezone = props.ga4_timezone
      if (!ga4Timezone) {
        try {
          ga4Timezone = await fetchGa4PropertyTimezone(integrationId, propertyId)
          if (ga4Timezone) await saveGa4Timezone(clientId, ga4Timezone)
        } catch (error) {
          console.warn(`GA4 sync: couldn't resolve/cache timezone for client_id=${clientId}: ${errorMessage(error)}`)
          ga4Timezone = null
        }
      }

      const ga4Today = ga4Timezone ? await getRealToday(ga4Timezone) : today
      const b = periodBoundaries(ga4Today)
      const rows = await runGa4Sync(integrationId, propertyId, clientId, clientName, days, ga4Timezone)

      const table = 'client_period_reports'
      const filters = { client_id: clientId }
      await clearOpenPeriodRow(table, filters, 'daily', b.yesterday)
      await ga4Reports.generateDailyReport(b.yesterday, clientId, integrationId, propertyId)
      await clearOpenPeriodRow(table, filters, 'weekly', b.week_start)
      await ga4Reports.generateWeeklyReport(b.week_start, ga4Today, clientId, integrationId, propertyId)
      await clearOpenPeriodRow(table, filters, 'monthly', b.month_start)
      await ga4Reports.generateMonthlyReport(b.month_start, ga4Today, clientId, integrationId, propertyId)
      await clearOpenPeriodRow(table, filters, 'quarterly', b.quarter_start)
      await ga4Reports.generateQuarterlyReport(b.quarter_start, ga4Today, clientId, integrationId, propertyId)
      await clearOpenPeriodRow(table, filters, 'half_yearly', b.half_start)
      await ga4Reports.generateHalfYearlyReport(b.half_start, ga4Today, clientId, integrationId, propertyId)
      await clearOpenPeriodRow(table, filters, 'yearly', b.year_start)
      await ga4Reports.generateYearlyReport(b.year_start, ga4Today, clientId, integrationId, propertyId)

      result.ga4 = { rows_synced: rows, reports_generated: [...REPORTS_GENERATED] }
    } catch (error) {
      result.errors.ga4 = errorMessage(error)
    }
  }

  if (props.gsc_property_url && wants('gsc')) {
    try {
      const siteUrl = props.gsc_property_url

      // GSC always buckets by Pacific Time, so "yesterday" is computed there.
      const gscToday = await getRealToday(GSC_TIMEZONE)
      const b = periodBoundaries(gscToday)
      const rows = await runGscSync(integrationId, siteUrl, clientId, clientName, days)

      const table = 'client_gsc_period_reports'
      const filters = { client_id: clientId, property_url: siteUrl }
      await clearOpenPeriodRow(table, filters, 'daily', b.yesterday)
      await gscReports.generateGscDailyReport(b.yesterday, clientId, siteUrl)
      await clearOpenPeriodRow(table, filters, 'weekly', b.week_start)
      await gscReports.generateGscWeeklyReport(b.week_start, gscToday, clientId, siteUrl)
      await clearOpenPeriodRow(table, filters, 'monthly', b.month_start)
      await gscReports.generateGscMonthlyReport(b.month_start, gscToday, clientId, siteUrl)
      await clearOpenPeriodRow(table, filters, 'quarterly', b.quarter_start)
      await gscReports.generateGscQuarterlyReport(b.quarter_start, gscToday, clientId, siteUrl)
      await clearOpenPeriodRow(table, filters, 'half_yearly', b.half_start)
      await gscReports.generateGscHalfYearlyReport(b.half_start, gscToday, clientId, siteUrl)
      await clearOpenPeriodRow(table, filters, 'yearly', b.year_start)
      await gscReports.generateGscYearlyReport(b.year_start, gscToday, clientId, siteUrl)

      result.gsc = { rows_synced: rows, reports_generated: [...REPORTS_GENERATED] }
    } catch (error) {
      result.errors.gsc = errorMessage(error)
    }
  }

  if (props.google_ads_customer_id && wants('google_ads')) {
    try {
      const customerId = props.google_ads_customer_id.replace(/-/g, '')
      const rows = await runGoogleAdsSync(integrationId, customerId, clientId, clientName, days)

      const table = 'client_google_ads_period_reports'
      const filters = { client_id: clientId, customer_id: customerId }
      await clearOpenPeriodRow(table, filters, 'daily', bounds.yesterday)
      await adsReports.generateGoogleAdsDailyReport(bounds.yesterday, clientId, customerId)
      await clearOpenPeriodRow(table, filters, 'weekly', bounds.week_start)
      await adsReports.generateGoogleAdsWeeklyReport(bounds.week_start, today, clientId, customerId)
      await clearOpenPeriodRow(table, filters, 'monthly', bounds.month_start)
      await adsReports.generateGoogleAdsMonthlyReport(bounds.month_start, today, clientId, customerId)
      await clearOpenPeriodRow(table, filters, 'quarterly', bounds.quarter_start)
      await adsReports.generateGoogleAdsQuarterlyReport(bounds.quarter_start, today, clientId, customerId)
      await clearOpenPeriodRow(table, filters, 'half_yearly', bounds.half_start)
      await adsReports.generateGoogleAdsHalfYearlyReport(bounds.half_start, today, clientId, customerId)
      await clearOpenPeriodRow(table, filters, 'yearly', bounds.year_start)
      await adsReports.generateGoogleAdsYearlyReport(bounds.year_start, today, clientId, customerId)

      result.google_ads = { rows_synced: rows, reports_generated: [...REPORTS_GENERATED] }
    } catch (error) {
      result.errors.google_ads = errorMessage(error)
    }
  }

  return result
}
