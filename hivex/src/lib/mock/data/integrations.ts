import type {
  IntegrationAccount,
  IntegrationMapping,
  IntegrationResource,
  OSId,
  ResourceKind,
} from '@/platform/types'
import { GOOGLE_PROVIDER, servicesForProvider } from '@/platform/config/integrations'

import { daysAgo, hoursAgo } from '../seed'

/**
 * Integration fixtures for the demo agency.
 *
 * Shaped to exercise every relationship the model has to support, because a
 * one-account-one-property fixture would let a broken model look fine:
 *
 *   - three organization-wide Google accounts, not one
 *   - several GA4 properties inside a single account, mapped to different clients
 *   - one client (Northwind) fed by resources from two different accounts
 *   - one client (Coastline) on its own client-scoped Google login
 *   - one Gmail account added in HR OS, so a product other than Reporting is
 *     visibly the origin of a shared login
 *   - several resources left deliberately unmapped, so the mapping workflow has
 *     something to do on first load
 *   - one account left in `reconnect_required`, so the unhealthy path is visible
 */

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

const googleAccount = (
  id: string,
  label: string,
  externalAccountId: string,
  scope: IntegrationAccount['scope'],
  overrides: Partial<IntegrationAccount> = {},
): IntegrationAccount => ({
  id,
  provider: GOOGLE_PROVIDER,
  scope,
  connectedIn: 'reporting',
  label,
  externalAccountId,
  status: 'connected',
  services: servicesForProvider(GOOGLE_PROVIDER),
  grantedScopes: [
    'analytics.readonly',
    'webmasters.readonly',
    'adwords',
    'business.manage',
  ],
  connectedAt: daysAgo(310),
  connectedBy: 'Alex Mercer',
  lastSyncAt: hoursAgo(2),
  ...overrides,
})

export const ACC_ANALYTICS = 'acct_google_analytics'
export const ACC_REPORTING = 'acct_google_reporting'
export const ACC_CLIENTS = 'acct_google_clients'
export const ACC_COASTLINE = 'acct_google_coastline'
export const ACC_SLACK = 'acct_slack_tru'
export const ACC_GMAIL = 'acct_gmail_ops'

export const DEMO_ACCOUNTS: IntegrationAccount[] = [
  googleAccount(ACC_ANALYTICS, 'analytics@agency.com', '114820394857263094821', {
    kind: 'organization',
  }, { connectedAt: daysAgo(388), lastSyncAt: hoursAgo(1) }),

  googleAccount(ACC_REPORTING, 'reporting@agency.com', '108374651029384756102', {
    kind: 'organization',
  }, { connectedAt: daysAgo(214), lastSyncAt: hoursAgo(3) }),

  /* Deliberately unhealthy: the refresh token was revoked upstream. */
  googleAccount(ACC_CLIENTS, 'clients@agency.com', '129384756102938475610', {
    kind: 'organization',
  }, {
    connectedAt: daysAgo(96),
    lastSyncAt: daysAgo(9),
    status: 'reconnect_required',
    error: 'The refresh token was revoked by the Google account owner.',
  }),

  /* A client that insists on its own login rather than the agency's. */
  googleAccount(ACC_COASTLINE, 'marketing@coastlinelegal.co', '156473829105647382910', {
    kind: 'client',
    osId: 'reporting',
    workspaceId: 'ws_coastline',
  }, {
    connectedAt: daysAgo(41),
    connectedBy: 'Priya Raghunathan',
    lastSyncAt: hoursAgo(6),
  }),

  /*
   * Added while the user was in HR OS, not Reporting.
   *
   * Gmail is used by Reporting, SEO and HR, so this one authorization shows up
   * as already-connected in all three — the case that used to force a second
   * sign-in per product.
   */
  {
    id: ACC_GMAIL,
    provider: 'gmail',
    scope: { kind: 'organization' },
    connectedIn: 'hr',
    label: 'ops@agency.com',
    externalAccountId: '117263094821148203948',
    status: 'connected',
    services: ['gmail'],
    grantedScopes: ['gmail.readonly'],
    connectedAt: daysAgo(64),
    connectedBy: 'Priya Raghunathan',
    lastSyncAt: hoursAgo(5),
  },

  {
    id: ACC_SLACK,
    provider: 'slack',
    scope: { kind: 'organization' },
    connectedIn: 'reporting',
    label: 'TruPerformance workspace',
    externalAccountId: 'T03H9KJ2P',
    status: 'error',
    services: ['slack'],
    grantedScopes: ['channels:read', 'chat:write'],
    connectedAt: daysAgo(120),
    connectedBy: 'Dmitri Volkov',
    lastSyncAt: daysAgo(3),
    error: 'invalid_auth — the Slack workspace token was rotated.',
  },
]

/* -------------------------------------------------------------------------- */
/* Resources                                                                   */
/* -------------------------------------------------------------------------- */

const res = (
  id: string,
  accountId: string,
  service: string,
  externalId: string,
  name: string,
  subtitle: string,
  kind: ResourceKind,
  available = true,
): IntegrationResource => ({
  id,
  accountId,
  service,
  externalId,
  name,
  subtitle,
  kind,
  available,
})

export const DEMO_RESOURCES: IntegrationResource[] = [
  /* ---- analytics@agency.com — the main book of business ---------------- */
  res('r_ga4_northwind', ACC_ANALYTICS, 'ga4', '318294771', 'Northwind Retail — Web', 'GA4 property', 'property'),
  res('r_ga4_northwind_app', ACC_ANALYTICS, 'ga4', '299104553', 'Northwind Retail — App', 'GA4 property', 'property'),
  res('r_ga4_meridian', ACC_ANALYTICS, 'ga4', '402118876', 'Meridian Health', 'GA4 property', 'property'),
  res('r_ga4_lumen', ACC_ANALYTICS, 'ga4', '377209114', 'Lumen Studio', 'GA4 property', 'property'),
  res('r_ga4_harbor', ACC_ANALYTICS, 'ga4', '351992048', 'Harbor & Vine', 'GA4 property', 'property'),
  res('r_gsc_northwind', ACC_ANALYTICS, 'gsc', 'sc-domain:northwind.com', 'northwind.com', 'Domain property', 'site'),
  res('r_gsc_meridian', ACC_ANALYTICS, 'gsc', 'https://meridianhealth.io/', 'meridianhealth.io', 'URL prefix', 'site'),
  res('r_gsc_lumen', ACC_ANALYTICS, 'gsc', 'https://lumen.studio/', 'lumen.studio', 'URL prefix', 'site'),
  res('r_ads_northwind', ACC_ANALYTICS, 'google-ads', '482-119-3374', 'Northwind Retail', 'Manager sub-account', 'account'),
  res('r_gbp_northwind_flag', ACC_ANALYTICS, 'gbp', 'loc/8827311', 'Northwind Retail — Flagship', 'Seattle, WA', 'location'),
  res('r_gbp_northwind_bell', ACC_ANALYTICS, 'gbp', 'loc/8827318', 'Northwind Retail — Bellevue', 'Bellevue, WA', 'location'),

  /* ---- reporting@agency.com — newer accounts --------------------------- */
  res('r_ga4_atlas', ACC_REPORTING, 'ga4', '410558273', 'Atlas Freight', 'GA4 property', 'property'),
  res('r_ga4_verdant', ACC_REPORTING, 'ga4', '418930277', 'Verdant Home', 'GA4 property', 'property'),
  res('r_ga4_demo', ACC_REPORTING, 'ga4', '422001938', 'Agency Demo Site', 'GA4 property', 'property'),
  res('r_gsc_atlas', ACC_REPORTING, 'gsc', 'sc-domain:atlasfreight.com', 'atlasfreight.com', 'Domain property', 'site'),
  res('r_gsc_verdant', ACC_REPORTING, 'gsc', 'sc-domain:verdanthome.co', 'verdanthome.co', 'Domain property', 'site'),
  res('r_ads_meridian', ACC_REPORTING, 'google-ads', '771-204-8890', 'Meridian Health', 'Manager sub-account', 'account'),
  res('r_ads_lumen', ACC_REPORTING, 'google-ads', '904-556-1123', 'Lumen Studio', 'Manager sub-account', 'account'),
  res('r_gbp_meridian', ACC_REPORTING, 'gbp', 'loc/5510223', 'Meridian Health — Clinic', 'Portland, OR', 'location'),

  /* ---- clients@agency.com — currently unhealthy, so nothing is usable -- */
  res('r_ga4_coastline_legacy', ACC_CLIENTS, 'ga4', '341887290', 'Coastline Legal (legacy)', 'GA4 property', 'property', false),
  res('r_gsc_coastline_legacy', ACC_CLIENTS, 'gsc', 'sc-domain:coastlinelegal.co', 'coastlinelegal.co', 'Domain property', 'site', false),
  res('r_ads_coastline_legacy', ACC_CLIENTS, 'google-ads', '655-330-2211', 'Coastline Legal', 'Manager sub-account', 'account', false),

  /* ---- Coastline's own login ------------------------------------------ */
  res('r_ga4_coastline_own', ACC_COASTLINE, 'ga4', '390114772', 'Coastline Legal', 'GA4 property', 'property'),
  res('r_gsc_coastline_own', ACC_COASTLINE, 'gsc', 'sc-domain:coastlinelegal.co', 'coastlinelegal.co', 'Domain property', 'site'),
  res('r_ads_coastline_own', ACC_COASTLINE, 'google-ads', '208-771-4590', 'Coastline Legal Ads', 'Direct account', 'account'),

  /* ---- Slack ----------------------------------------------------------- */
  res('r_slack_analytics', ACC_SLACK, 'slack', 'C01ANALYTICS', '#analytics', '38 members', 'channel', false),
  res('r_slack_clients', ACC_SLACK, 'slack', 'C02CLIENTS', '#client-updates', '54 members', 'channel', false),
]

/* -------------------------------------------------------------------------- */
/* Mappings                                                                    */
/* -------------------------------------------------------------------------- */

const map = (resourceId: string, workspaceId: string, days: number): IntegrationMapping => ({
  id: `map_${resourceId}`,
  resourceId,
  osId: 'reporting' as OSId,
  workspaceId,
  mappedAt: daysAgo(days),
  mappedBy: 'Alex Mercer',
})

export const DEMO_MAPPINGS: IntegrationMapping[] = [
  /* Northwind pulls from analytics@ for everything. */
  map('r_ga4_northwind', 'ws_northwind', 380),
  map('r_gsc_northwind', 'ws_northwind', 380),
  map('r_ads_northwind', 'ws_northwind', 379),
  map('r_gbp_northwind_flag', 'ws_northwind', 300),
  map('r_gbp_northwind_bell', 'ws_northwind', 300),

  /* Meridian mixes two accounts: analytics@ for organic, reporting@ for paid. */
  map('r_ga4_meridian', 'ws_meridian', 290),
  map('r_gsc_meridian', 'ws_meridian', 290),
  map('r_ads_meridian', 'ws_meridian', 180),
  map('r_gbp_meridian', 'ws_meridian', 180),

  /* Lumen likewise. */
  map('r_ga4_lumen', 'ws_lumen', 205),
  map('r_gsc_lumen', 'ws_lumen', 205),
  map('r_ads_lumen', 'ws_lumen', 150),

  /* Coastline runs entirely on its own client-scoped login. */
  map('r_ga4_coastline_own', 'ws_coastline', 41),
  map('r_gsc_coastline_own', 'ws_coastline', 41),
  map('r_ads_coastline_own', 'ws_coastline', 40),
]

/*
 * Left unmapped on purpose, so the mapping workflow is demonstrable on load:
 *   r_ga4_northwind_app, r_ga4_harbor, r_ga4_atlas, r_ga4_verdant,
 *   r_ga4_demo, r_gsc_atlas, r_gsc_verdant
 * plus everything under the unhealthy clients@agency.com account.
 */

/** Discovery catalogue used when a *new* account is connected in the demo. */
export const DISCOVERY_TEMPLATES: Record<string, Omit<IntegrationResource, 'id' | 'accountId'>[]> = {
  [GOOGLE_PROVIDER]: [
    { service: 'ga4', externalId: '500118273', name: 'Brightline Media', subtitle: 'GA4 property', kind: 'property', available: true },
    { service: 'ga4', externalId: '500118299', name: 'Brightline Media — Blog', subtitle: 'GA4 property', kind: 'property', available: true },
    { service: 'ga4', externalId: '500229110', name: 'Kestrel Outdoors', subtitle: 'GA4 property', kind: 'property', available: true },
    { service: 'gsc', externalId: 'sc-domain:brightline.media', name: 'brightline.media', subtitle: 'Domain property', kind: 'site', available: true },
    { service: 'gsc', externalId: 'sc-domain:kestrel.co', name: 'kestrel.co', subtitle: 'Domain property', kind: 'site', available: true },
    { service: 'google-ads', externalId: '330-448-7712', name: 'Brightline Media', subtitle: 'Manager sub-account', kind: 'account', available: true },
    { service: 'gbp', externalId: 'loc/9911002', name: 'Kestrel Outdoors — Store', subtitle: 'Denver, CO', kind: 'location', available: true },
  ],
  slack: [
    { service: 'slack', externalId: 'C10GENERAL', name: '#general', subtitle: '96 members', kind: 'channel', available: true },
    { service: 'slack', externalId: 'C10REPORTS', name: '#reports', subtitle: '22 members', kind: 'channel', available: true },
  ],
}

/** Email suggestions offered by the mock Google chooser. */
export const DISCOVERY_ACCOUNT_LABELS = [
  'growth@agency.com',
  'ops@agency.com',
  'insights@agency.com',
  'media@agency.com',
]
