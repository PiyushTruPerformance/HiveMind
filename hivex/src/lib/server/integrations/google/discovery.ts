import 'server-only'

import { serverEnv } from '../env'
import { getAccessToken, refreshAccessToken, withGoogleToken, type GoogleTool } from '../google-tokens'
import { ensureOk } from '../http'
import { db, must } from '../supabase'

/**
 * Google resource discovery — port of `GoogleDiscoveryService.discover_resources`
 * and the listing functions in `connectors/google/{ga4,gsc,google_ads,google_business}.py`.
 *
 * Found resources are upserted into `connected_accounts` on
 * (integration_id, account_id, account_type), like the Reporting backend.
 * One deliberate difference: an existing `metadata.is_mapped` flag is kept
 * rather than wiped, so re-running discovery (e.g. on reconnect) does not
 * silently drop mappings both apps display.
 */

export interface DiscoveredAccount {
  account_id: string
  account_name: string
  account_type: 'ga4_property' | 'gsc_site' | 'google_ads_customer' | 'google_business_location'
  metadata: Record<string, unknown>
}

const GA4_ACCOUNTS_URL = 'https://analyticsadmin.googleapis.com/v1alpha/accountSummaries'
const GSC_SITES_URL = 'https://www.googleapis.com/webmasters/v3/sites'
const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v25'
const GBP_ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts'
const GBP_INFORMATION_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

/* ------------------------------------------------------------------ GA4 */

interface Ga4Summaries {
  accountSummaries?: { displayName?: string; propertySummaries?: { property?: string; displayName?: string }[] }[]
}

async function listGa4Properties(integrationId: string): Promise<DiscoveredAccount[]> {
  const response = await ensureOk(
    await fetch(GA4_ACCOUNTS_URL, { headers: bearer(await getAccessToken(integrationId, 'analytics')) }),
    'GA4 property discovery',
  )
  const data = (await response.json()) as Ga4Summaries
  return (data.accountSummaries ?? []).flatMap((account) =>
    (account.propertySummaries ?? []).map<DiscoveredAccount>((property) => ({
      account_id: property.property ?? '',
      account_name: property.displayName ?? property.property ?? '',
      account_type: 'ga4_property',
      metadata: { parent_account: account.displayName ?? null },
    })),
  )
}

/* ------------------------------------------------------------------ GSC */

async function listGscSites(integrationId: string): Promise<DiscoveredAccount[]> {
  const response = await ensureOk(
    await fetch(GSC_SITES_URL, { headers: bearer(await getAccessToken(integrationId, 'searchconsole')) }),
    'Search Console site discovery',
  )
  const data = (await response.json()) as { siteEntry?: { siteUrl?: string; permissionLevel?: string }[] }
  return (data.siteEntry ?? []).map((site) => ({
    account_id: site.siteUrl ?? '',
    account_name: site.siteUrl ?? '',
    account_type: 'gsc_site',
    metadata: { permission_level: site.permissionLevel ?? null },
  }))
}

/* ------------------------------------------------------------ Google Ads */

function adsHeaders(token: string, developerToken: string): Record<string, string> {
  const headers: Record<string, string> = { ...bearer(token), 'developer-token': developerToken, 'Content-Type': 'application/json' }
  const login = serverEnv.googleAdsLoginCustomerId()
  if (login) headers['login-customer-id'] = login
  return headers
}

async function listGoogleAdsAccounts(integrationId: string): Promise<DiscoveredAccount[]> {
  const developerToken = serverEnv.googleAdsDeveloperToken()
  if (!developerToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is not configured')

  const listResponse = await ensureOk(
    await withGoogleToken(integrationId, 'google_ads', (token) =>
      fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, { headers: adsHeaders(token, developerToken) }),
    ),
    'Google Ads account discovery',
  )
  const { resourceNames = [] } = (await listResponse.json()) as { resourceNames?: string[] }

  const customers: DiscoveredAccount[] = []
  for (const resource of resourceNames) {
    const customerId = resource.split('/').pop() ?? resource
    let name = customerId
    let isManager = false
    let currency: string | null = null
    let timeZone: string | null = null
    try {
      const info = await ensureOk(
        await withGoogleToken(integrationId, 'google_ads', (token) =>
          fetch(`${GOOGLE_ADS_API}/customers/${customerId.replace(/-/g, '')}/googleAds:search`, {
            method: 'POST',
            headers: adsHeaders(token, developerToken),
            body: JSON.stringify({
              query:
                'SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code, customer.time_zone FROM customer',
            }),
          }),
        ),
        'Google Ads customer lookup',
      )
      const row = ((await info.json()) as {
        results?: { customer?: { descriptiveName?: string; manager?: boolean; currencyCode?: string; timeZone?: string } }[]
      }).results?.[0]?.customer
      name = row?.descriptiveName || customerId
      isManager = Boolean(row?.manager)
      currency = row?.currencyCode ?? null
      timeZone = row?.timeZone ?? null
    } catch (error) {
      // Same fallback as Reporting: keep the id as the label rather than failing discovery.
      console.warn(`[integrations] Google Ads name lookup failed for ${customerId}:`, error)
    }
    customers.push({
      account_id: customerId,
      account_name: name,
      account_type: 'google_ads_customer',
      metadata: { is_manager: isManager, currency_code: currency, time_zone: timeZone },
    })
  }
  return customers
}

/* ------------------------------------------------ Google Business Profile */

interface GbpLocation {
  name?: string
  title?: string
  storeCode?: string
  websiteUri?: string
  languageCode?: string
  phoneNumbers?: { primaryPhone?: string }
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string }
}

async function paged<T>(
  integrationId: string,
  url: string,
  key: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const items: T[] = []
  let pageToken: string | undefined
  let token = await getAccessToken(integrationId, 'google_business')
  do {
    const query = new URLSearchParams({ ...params, ...(pageToken ? { pageToken } : {}) })
    let response = await fetch(`${url}?${query.toString()}`, { headers: bearer(token) })
    if (response.status === 401) {
      token = await refreshAccessToken(integrationId, 'google_business')
      response = await fetch(`${url}?${query.toString()}`, { headers: bearer(token) })
    }
    await ensureOk(response, 'Google Business Profile discovery')
    const payload = (await response.json()) as Record<string, unknown> & { nextPageToken?: string }
    items.push(...((payload[key] as T[] | undefined) ?? []))
    pageToken = payload.nextPageToken
  } while (pageToken)
  return items
}

async function listGoogleBusinessLocations(integrationId: string): Promise<DiscoveredAccount[]> {
  const accounts = await paged<{ name?: string; accountName?: string }>(integrationId, GBP_ACCOUNTS_URL, 'accounts')
  const found: DiscoveredAccount[] = []
  for (const account of accounts) {
    if (!account.name) continue
    try {
      const locations = await paged<GbpLocation>(integrationId, `${GBP_INFORMATION_API}/${account.name}/locations`, 'locations', {
        readMask: 'name,title,storeCode,websiteUri,phoneNumbers,storefrontAddress,regularHours,languageCode',
      })
      for (const location of locations) {
        const a = location.storefrontAddress ?? {}
        const address = [(a.addressLines ?? []).join(', '), a.locality, a.administrativeArea, a.postalCode]
          .filter(Boolean)
          .join(', ')
        found.push({
          account_id: location.name ?? '',
          account_name: location.title ?? 'Unnamed Business',
          account_type: 'google_business_location',
          metadata: {
            business_account: account.name,
            business_account_name: account.accountName ?? null,
            store_code: location.storeCode ?? null,
            website: location.websiteUri ?? null,
            phone: location.phoneNumbers?.primaryPhone ?? null,
            language_code: location.languageCode ?? null,
            address,
            raw_location: location,
          },
        })
      }
    } catch (error) {
      console.warn(`[integrations] GBP locations failed for ${account.name}:`, error)
    }
  }
  return found
}

/* ------------------------------------------------------------ discover */

export interface DiscoveryRun {
  ga4_properties_found: number
  gsc_sites_found: number
  google_ads_accounts_found: number
  google_business_locations_found: number
  errors: Record<string, string>
}

/**
 * Discover and store what the connection can see. Per-tool failures are
 * recorded (not thrown), matching Reporting's "Skipping X discovery" behaviour,
 * but returned so callers can surface them.
 */
export async function discoverResources(integrationId: string, tools: string[]): Promise<DiscoveryRun> {
  const run = async (tool: GoogleTool, list: () => Promise<DiscoveredAccount[]>, errors: Record<string, string>) => {
    try {
      return await list()
    } catch (error) {
      errors[tool] = error instanceof Error ? error.message : String(error)
      return []
    }
  }

  const errors: Record<string, string> = {}
  const ga4 = tools.includes('analytics') ? await run('analytics', () => listGa4Properties(integrationId), errors) : []
  const gsc = tools.includes('searchconsole') ? await run('searchconsole', () => listGscSites(integrationId), errors) : []
  const ads = tools.includes('google_ads') ? await run('google_ads', () => listGoogleAdsAccounts(integrationId), errors) : []
  const gbp = tools.includes('google_business')
    ? await run('google_business', () => listGoogleBusinessLocations(integrationId), errors)
    : []

  const all = [...ga4, ...gsc, ...ads, ...gbp].filter((a) => a.account_id)
  if (all.length > 0) {
    const existing = must(
      await db().from('connected_accounts').select('account_id, account_type, metadata').eq('integration_id', integrationId),
      'Connected account lookup',
    ) as { account_id: string; account_type: string; metadata: Record<string, unknown> | null }[]
    const mapped = new Set(
      existing.filter((r) => r.metadata?.is_mapped === true).map((r) => `${r.account_type}|${r.account_id}`),
    )

    must(
      await db()
        .from('connected_accounts')
        .upsert(
          all.map((account) => ({
            integration_id: integrationId,
            account_id: account.account_id,
            account_name: account.account_name,
            account_type: account.account_type,
            metadata: mapped.has(`${account.account_type}|${account.account_id}`)
              ? { ...account.metadata, is_mapped: true }
              : account.metadata,
          })),
          { onConflict: 'integration_id,account_id,account_type' },
        ),
      'Saving discovered resources',
    )
  }

  return {
    ga4_properties_found: ga4.length,
    gsc_sites_found: gsc.length,
    google_ads_accounts_found: ads.length,
    google_business_locations_found: gbp.length,
    errors,
  }
}
