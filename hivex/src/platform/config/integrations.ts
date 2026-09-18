import type { IntegrationCategory, IntegrationDefinition, OSId } from '@/platform/types'

import { OS_REGISTRY } from './os-registry'

/**
 * Integration catalog.
 *
 * Two pipelines, exactly as the platform documentation describes:
 *
 *  1. `google_oauth` — the first-party Google OAuth pipeline (GA4, Search
 *     Console, Google Ads, Business Profile). The connector expansion roadmap
 *     explicitly EXCLUDES these from Nango because native sync, report builders
 *     and MCP tools already exist for them.
 *  2. `nango_oauth` / `api_key` — everything else, brokered through Nango.
 *     Slugs, auth types and phases below are taken verbatim from
 *     Docs/hivex-connector-expansion-roadmap.pdf (verified 2026-08-06).
 *
 * `phase: 0` means already live. Phases 1-5 are the documented rollout order.
 * `confirmed: false` reproduces the roadmap's one open item (Wappalyzer).
 */

export const INTEGRATION_CATEGORY_META: Record<
  IntegrationCategory,
  { label: string; description: string }
> = {
  analytics: { label: 'Analytics', description: 'Product and site behaviour data.' },
  advertising: { label: 'Advertising', description: 'Paid media spend and performance.' },
  search: { label: 'Search', description: 'Organic search visibility and presence.' },
  communication: { label: 'Communication', description: 'Where your team already talks.' },
  productivity: { label: 'Productivity', description: 'Docs, boards and task systems.' },
  crm: { label: 'CRM & marketing', description: 'Pipeline, contacts and lifecycle email.' },
  design: { label: 'Design', description: 'Design files and specs.' },
  seo: { label: 'SEO', description: 'Keyword, backlink and tech-stack intelligence.' },
  bi: { label: 'Business intelligence', description: 'Existing dashboards and models.' },
  meetings: { label: 'Meetings', description: 'Recordings, transcripts and notes.' },
  storage: { label: 'Storage', description: 'Files and shared drives.' },
}

const g = (
  id: string,
  name: string,
  category: IntegrationCategory,
  description: string,
  usedBy: OSId[],
  monogram: string,
  brandColor: string,
  scopes: string[],
): IntegrationDefinition => ({
  id,
  name,
  providerSlug: 'google-native',
  category,
  authType: 'google_oauth',
  description,
  usedBy,
  phase: 0,
  confirmed: true,
  brandColor,
  monogram,
  scopes,
  hasResourceSelection: true,
})

export const INTEGRATIONS: IntegrationDefinition[] = [
  /* ---------------------------------------------------------------- */
  /* First-party Google pipeline                                       */
  /* ---------------------------------------------------------------- */
  g(
    'ga4',
    'Google Analytics 4',
    'analytics',
    'Sessions, users, conversions and channel mix, synced daily into period rollups.',
    ['reporting', 'seo'],
    'GA',
    '#E8710A',
    ['analytics.readonly'],
  ),
  g(
    'gsc',
    'Google Search Console',
    'search',
    'Query, page, country and device performance for every verified property.',
    ['reporting', 'seo'],
    'SC',
    '#4285F4',
    ['webmasters.readonly'],
  ),
  g(
    'google-ads',
    'Google Ads',
    'advertising',
    'Campaign and ad-group spend, conversions, ROAS and CPC.',
    ['reporting'],
    'Ad',
    '#34A853',
    ['adwords'],
  ),
  g(
    'gbp',
    'Google Business Profile',
    'search',
    'Calls, direction requests, profile views and location performance.',
    ['reporting'],
    'BP',
    '#1A73E8',
    ['business.manage'],
  ),

  /* ---------------------------------------------------------------- */
  /* Phase 0 — already live via Nango                                  */
  /* ---------------------------------------------------------------- */
  {
    id: 'slack',
    name: 'Slack',
    providerSlug: 'slack',
    category: 'communication',
    authType: 'nango_oauth',
    description: 'Read channels and post summaries, alerts and approvals back to your team.',
    usedBy: ['reporting', 'seo', 'hr'],
    phase: 0,
    confirmed: true,
    brandColor: '#4A154B',
    monogram: 'Sl',
    scopes: ['channels:read', 'chat:write'],
    hasResourceSelection: true,
  },
  {
    id: 'outlook',
    name: 'Microsoft Outlook',
    providerSlug: 'outlook',
    category: 'communication',
    authType: 'nango_oauth',
    description: 'Read mail folders and draft or send email without leaving the platform.',
    usedBy: ['reporting', 'hr'],
    phase: 0,
    confirmed: true,
    brandColor: '#0F6CBD',
    monogram: 'Ol',
    scopes: ['Mail.Read', 'Mail.Send'],
    hasResourceSelection: true,
  },
  {
    id: 'zoom',
    name: 'Zoom',
    providerSlug: 'zoom',
    category: 'meetings',
    authType: 'nango_oauth',
    description: 'Pull meeting recordings and transcripts as assistant context.',
    usedBy: ['reporting', 'hr'],
    phase: 0,
    confirmed: true,
    brandColor: '#0B5CFF',
    monogram: 'Zm',
    scopes: ['recording:read', 'meeting:read'],
    hasResourceSelection: false,
  },

  /* ---------------------------------------------------------------- */
  /* Phase 1 — reuse the existing Google OAuth app                     */
  /* ---------------------------------------------------------------- */
  {
    id: 'gmail',
    name: 'Gmail',
    providerSlug: 'google-mail',
    category: 'communication',
    authType: 'nango_oauth',
    description: 'Read threads for context. A send action follows the same shape as Outlook.',
    usedBy: ['reporting', 'seo', 'hr'],
    phase: 1,
    confirmed: true,
    brandColor: '#EA4335',
    monogram: 'Gm',
    scopes: ['gmail.readonly'],
    hasResourceSelection: false,
    docsNote: 'Phase 1 — may reuse the existing Google Cloud OAuth client.',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    providerSlug: 'google-drive',
    category: 'storage',
    authType: 'nango_oauth',
    description: 'Reference documents and spreadsheets from shared drives.',
    usedBy: ['reporting', 'hr', 'finance'],
    phase: 1,
    confirmed: true,
    brandColor: '#1FA463',
    monogram: 'Dr',
    scopes: ['drive.readonly'],
    hasResourceSelection: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    providerSlug: 'google-calendar',
    category: 'productivity',
    authType: 'nango_oauth',
    description: 'Read availability and schedule reviews, interviews and check-ins.',
    usedBy: ['reporting', 'hr'],
    phase: 1,
    confirmed: true,
    brandColor: '#4285F4',
    monogram: 'Cal',
    scopes: ['calendar.readonly', 'calendar.events'],
    hasResourceSelection: true,
  },

  /* ---------------------------------------------------------------- */
  /* Phase 2 — project and notes tools                                 */
  /* ---------------------------------------------------------------- */
  {
    id: 'notion',
    name: 'Notion',
    providerSlug: 'notion',
    category: 'productivity',
    authType: 'nango_oauth',
    description: 'Summarise pages and databases as working context.',
    usedBy: ['reporting', 'seo', 'hr'],
    phase: 2,
    confirmed: true,
    brandColor: '#111111',
    monogram: 'No',
    scopes: ['read_content'],
    hasResourceSelection: true,
  },
  {
    id: 'monday',
    name: 'Monday.com',
    providerSlug: 'monday',
    category: 'productivity',
    authType: 'nango_oauth',
    description: 'Read boards and items alongside the built-in sprint board.',
    usedBy: ['reporting', 'hr'],
    phase: 2,
    confirmed: true,
    brandColor: '#FF3D57',
    monogram: 'Mo',
    scopes: ['boards:read'],
    hasResourceSelection: true,
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    providerSlug: 'clickup',
    category: 'productivity',
    authType: 'nango_oauth',
    description: 'Read spaces, lists and tasks for cross-tool status.',
    usedBy: ['reporting', 'seo'],
    phase: 2,
    confirmed: true,
    brandColor: '#7B68EE',
    monogram: 'Cu',
    scopes: ['task:read'],
    hasResourceSelection: true,
  },

  /* ---------------------------------------------------------------- */
  /* Phase 3 — marketing and CRM                                       */
  /* ---------------------------------------------------------------- */
  {
    id: 'hubspot',
    name: 'HubSpot',
    providerSlug: 'hubspot',
    category: 'crm',
    authType: 'nango_oauth',
    description: 'Deals, contacts and lifecycle stages joined to marketing performance.',
    usedBy: ['reporting', 'seo', 'finance'],
    phase: 3,
    confirmed: true,
    brandColor: '#FF7A59',
    monogram: 'Hs',
    scopes: ['crm.objects.contacts.read', 'crm.objects.deals.read'],
    hasResourceSelection: true,
  },
  {
    id: 'activecampaign',
    name: 'ActiveCampaign',
    providerSlug: 'active-campaign',
    category: 'crm',
    authType: 'nango_oauth',
    description: 'Automation performance and contact-level engagement.',
    usedBy: ['reporting', 'seo'],
    phase: 3,
    confirmed: true,
    brandColor: '#356AE6',
    monogram: 'Ac',
    scopes: ['contacts:read', 'campaigns:read'],
    hasResourceSelection: false,
  },
  {
    id: 'marketo',
    name: 'Marketo',
    providerSlug: 'marketo',
    category: 'crm',
    authType: 'nango_oauth',
    description: 'Program performance and lead lifecycle reporting.',
    usedBy: ['reporting'],
    phase: 3,
    confirmed: true,
    brandColor: '#5C4C9F',
    monogram: 'Mk',
    scopes: ['lead:read', 'activity:read'],
    hasResourceSelection: false,
  },
  {
    id: 'brevo',
    name: 'Brevo',
    providerSlug: 'brevo-api-key',
    category: 'crm',
    authType: 'api_key',
    description: 'Transactional and campaign email statistics.',
    usedBy: ['seo', 'reporting'],
    phase: 3,
    confirmed: true,
    brandColor: '#0B996E',
    monogram: 'Bv',
    scopes: ['API key'],
    hasResourceSelection: false,
    docsNote: 'Added to Nango Nov 2024; no dedicated setup guide yet.',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    providerSlug: 'intercom',
    category: 'crm',
    authType: 'nango_oauth',
    description: 'Conversations and support volume as assistant context.',
    usedBy: ['reporting', 'hr'],
    phase: 3,
    confirmed: true,
    brandColor: '#1F8DED',
    monogram: 'Ic',
    scopes: ['conversations:read'],
    hasResourceSelection: false,
  },

  /* ---------------------------------------------------------------- */
  /* Phase 4 — design, SEO and BI                                      */
  /* ---------------------------------------------------------------- */
  {
    id: 'figma',
    name: 'Figma',
    providerSlug: 'figma',
    category: 'design',
    authType: 'nango_oauth',
    description: 'Reference design files in briefs and deliverables.',
    usedBy: ['reporting'],
    phase: 4,
    confirmed: true,
    brandColor: '#F24E1E',
    monogram: 'Fg',
    scopes: ['file_read'],
    hasResourceSelection: true,
    docsNote: 'A separate figma-scim variant exists for SCIM provisioning; not used here.',
  },
  {
    id: 'semrush',
    name: 'SEMrush',
    providerSlug: 'semrush',
    category: 'seo',
    authType: 'api_key',
    description: 'Keyword difficulty, competitor visibility and backlink metrics.',
    usedBy: ['seo'],
    phase: 4,
    confirmed: true,
    brandColor: '#FF642D',
    monogram: 'Sr',
    scopes: ['API key'],
    hasResourceSelection: false,
    docsNote: 'Nango documents this as "Semrush (v3)".',
  },
  {
    id: 'looker',
    name: 'Looker',
    providerSlug: 'looker',
    category: 'bi',
    authType: 'api_key',
    description: 'Bring existing Looker models and dashboards into platform reporting.',
    usedBy: ['reporting', 'finance'],
    phase: 4,
    confirmed: true,
    brandColor: '#5F3DC4',
    monogram: 'Lk',
    scopes: ['API3 key', 'hostname'],
    hasResourceSelection: true,
    docsNote: 'Confirm this is classic Looker (BI), not Looker Studio, before building.',
  },
  {
    id: 'wappalyzer',
    name: 'Wappalyzer',
    providerSlug: 'wappalyzer',
    category: 'seo',
    authType: 'api_key',
    description: 'Detect the technology stack behind prospect and competitor sites.',
    usedBy: ['seo'],
    phase: 4,
    confirmed: false,
    brandColor: '#4608AD',
    monogram: 'Wp',
    scopes: ['API key'],
    hasResourceSelection: false,
    docsNote: 'Slug unconfirmed — verify on the Nango dashboard before building.',
  },

  /* ---------------------------------------------------------------- */
  /* Phase 5 — meeting notes and extra storage                         */
  /* ---------------------------------------------------------------- */
  {
    id: 'granola',
    name: 'Granola',
    providerSlug: 'granola',
    category: 'meetings',
    authType: 'nango_oauth',
    description: 'AI meeting notes as read-only assistant context.',
    usedBy: ['reporting', 'hr'],
    phase: 5,
    confirmed: true,
    brandColor: '#1C1C1C',
    monogram: 'Gr',
    scopes: ['notes:read'],
    hasResourceSelection: false,
  },
  {
    id: 'fathom',
    name: 'Fathom',
    providerSlug: 'fathom',
    category: 'meetings',
    authType: 'api_key',
    description: 'Meeting summaries and transcripts from Fathom Video.',
    usedBy: ['reporting', 'hr'],
    phase: 5,
    confirmed: true,
    brandColor: '#7C3AED',
    monogram: 'Fa',
    scopes: ['API key'],
    hasResourceSelection: false,
    docsNote: 'Fathom Video (meeting notetaker), not Fathom Analytics.',
  },
  {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    providerSlug: 'one-drive',
    category: 'storage',
    authType: 'nango_oauth',
    description: 'Reference files stored in OneDrive and SharePoint libraries.',
    usedBy: ['reporting', 'hr', 'finance'],
    phase: 5,
    confirmed: true,
    brandColor: '#0364B8',
    monogram: 'Od',
    scopes: ['Files.Read.All'],
    hasResourceSelection: true,
  },
]

export const INTEGRATION_MAP: Record<string, IntegrationDefinition> = Object.fromEntries(
  INTEGRATIONS.map((i) => [i.id, i]),
)

export function getIntegration(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_MAP[id]
}

/**
 * Catalog cross-reference: integrations that name this product.
 *
 * Presentation only — it drives the "Used by" tiles. What a product may
 * actually *consume* comes from its own registry entry, which is the narrower
 * and authoritative list; see `serviceIdsForOS`.
 */
export function integrationsForOS(osId: OSId): IntegrationDefinition[] {
  return INTEGRATIONS.filter((i) => i.usedBy.includes(osId))
}

export const PHASE_META: Record<number, { label: string; note: string }> = {
  0: { label: 'Available now', note: 'Live in the platform today.' },
  1: { label: 'Phase 1', note: 'Google workspace tools — reuses the existing OAuth client.' },
  2: { label: 'Phase 2', note: 'Project and notes tools, parallel to the built-in sprint board.' },
  3: { label: 'Phase 3', note: 'Marketing and CRM — closest fit to the product domain.' },
  4: { label: 'Phase 4', note: 'Design, SEO and BI tooling.' },
  5: { label: 'Phase 5', note: 'Meeting notes and additional storage.' },
}

export const GOOGLE_DATA_SOURCE_IDS = ['ga4', 'gsc', 'google-ads', 'gbp'] as const

/* -------------------------------------------------------------------------- */
/* Provider grouping                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which integrations share a single authorization.
 *
 * One Google login grants GA4, Search Console, Ads and Business Profile at
 * once, so those four are *services* of one account rather than four separate
 * connections. Everything else authorizes on its own, so its provider key is
 * just its own id.
 */
export const GOOGLE_PROVIDER = 'google'

/* -------------------------------------------------------------------------- */
/* Connector kinds                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What a connection is *for* — the split the Integrations page is built around.
 *
 *   data  Brings business data into the platform: the first-party Google
 *         pipeline (GA4, Search Console, Ads, Business Profile), authorized per
 *         client and synced into reports.
 *   tool  Lets Ask Tru act in an external tool (send, read, schedule). These run
 *         through Nango and belong to the person who connected them.
 *
 * Only providers the integrations backend actually implements are classified;
 * everything else in the catalog stays browsable but is not presented as a
 * working connector. Derived from the catalog, so a new entry needs no second
 * definition here.
 */
export type ConnectorKind = 'data' | 'tool'

/** Tool connectors the backend supports (server lib/server/integrations/nango). */
const TOOL_CONNECTOR_IDS = [
  'slack',
  'outlook',
  'zoom',
  'google-calendar',
  'granola',
  'notion',
  'fathom',
  'intercom',
] as const

export function connectorKind(integrationId: string): ConnectorKind | null {
  const integration = INTEGRATION_MAP[integrationId]
  if (!integration) return null
  if (integration.authType === 'google_oauth') return 'data'
  return (TOOL_CONNECTOR_IDS as readonly string[]).includes(integrationId) ? 'tool' : null
}

export const DATA_CONNECTORS: IntegrationDefinition[] = INTEGRATIONS.filter(
  (i) => connectorKind(i.id) === 'data',
)

export const TOOL_CONNECTORS: IntegrationDefinition[] = TOOL_CONNECTOR_IDS.map(
  (id) => INTEGRATION_MAP[id],
).filter(Boolean)

/** Catalog entries with no backend connector yet — browsable, not presented as live. */
export const CATALOG_ONLY: IntegrationDefinition[] = INTEGRATIONS.filter(
  (i) => connectorKind(i.id) === null,
)

export function providerKeyFor(integrationId: string): string {
  const integration = INTEGRATION_MAP[integrationId]
  if (!integration) return integrationId
  return integration.authType === 'google_oauth' ? GOOGLE_PROVIDER : integration.id
}

/** Integration ids granted by one authorization of this provider. */
export function servicesForProvider(provider: string): string[] {
  if (provider === GOOGLE_PROVIDER) {
    return INTEGRATIONS.filter((i) => i.authType === 'google_oauth').map((i) => i.id)
  }
  return INTEGRATION_MAP[provider] ? [provider] : []
}

/** Display name for a provider family. */
export function providerName(provider: string): string {
  if (provider === GOOGLE_PROVIDER) return 'Google'
  return INTEGRATION_MAP[provider]?.name ?? provider
}

/**
 * The integration whose branding represents a provider family.
 *
 * Google Analytics stands in for the Google family so an account card carries a
 * recognisable mark without inventing a second icon set.
 */
export function providerIconIntegration(provider: string): IntegrationDefinition {
  if (provider === GOOGLE_PROVIDER) return INTEGRATION_MAP.ga4
  return INTEGRATION_MAP[provider] ?? INTEGRATION_MAP.ga4
}

/**
 * Integration ids a product can consume.
 *
 * This is what makes an organization account visible to a new product: the
 * account lists the services it grants, the product lists the services it uses,
 * and the intersection decides. Nothing has to be re-authorized or re-assigned
 * when a product is added.
 */
export function serviceIdsForOS(osId: OSId): Set<string> {
  const os = OS_REGISTRY[osId]
  return new Set([...os.requiredIntegrations, ...os.optionalIntegrations])
}

/** True when a product can read anything from an account granting `services`. */
export function osCanUseServices(osId: OSId, services: string[]): boolean {
  const usable = serviceIdsForOS(osId)
  return services.some((service) => usable.has(service))
}

/** Providers a product can authorize, derived from the services it declares. */
export function providersForOS(osId: OSId): string[] {
  const seen = new Set<string>()
  serviceIdsForOS(osId).forEach((id) => seen.add(providerKeyFor(id)))
  return [...seen]
}
