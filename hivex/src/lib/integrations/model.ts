import { getIntegration } from '@/platform/config/integrations'
import type {
  IntegrationAccount,
  IntegrationMapping,
  IntegrationResource,
  OSId,
  Workspace,
} from '@/platform/types'
import { initialsOf, slugify } from '@/lib/utils/format'

import type {
  BackendClient,
  ConnectedAccountRow,
  DataWorkspace,
  GoogleDiscovery,
  GoogleStatus,
  GoogleTool,
} from './api'

/**
 * Backend → HiveX domain adapters. Pure functions, no I/O.
 *
 * How the Tru Reporting backend's model lands in HiveX's account → resource →
 * mapping model:
 *
 *   Google   One `integrations` row per *client data workspace*. So one HiveX
 *            account per connected client, client-scoped. Its resources are the
 *            GA4 properties / Search Console sites / Ads customers discovery
 *            found; its mappings are the ones the backend flags `is_mapped`,
 *            which always feed that same client (`workspaces.connected_to`).
 *   Nango    Tool connectors (Slack, Outlook, …), connected per user. One
 *            organization-level HiveX account per connected provider.
 *
 * Workspace ids stay inside ids and lookups here; they are never rendered.
 */

/* ------------------------------------------------------------ Google tools */

interface GoogleService {
  service: string
  tool: GoogleTool
  scope: string
  shortScope: string
}

/** HiveX integration id ↔ backend tool key ↔ OAuth scope. */
export const GOOGLE_SERVICES: GoogleService[] = [
  { service: 'ga4', tool: 'analytics', scope: 'https://www.googleapis.com/auth/analytics.readonly', shortScope: 'analytics.readonly' },
  { service: 'gsc', tool: 'searchconsole', scope: 'https://www.googleapis.com/auth/webmasters.readonly', shortScope: 'webmasters.readonly' },
  { service: 'google-ads', tool: 'google_ads', scope: 'https://www.googleapis.com/auth/adwords', shortScope: 'adwords' },
  { service: 'gbp', tool: 'google_business', scope: 'https://www.googleapis.com/auth/business.manage', shortScope: 'business.manage' },
]

export const ALL_GOOGLE_TOOLS: GoogleTool[] = GOOGLE_SERVICES.map((s) => s.tool)

/** Tool connectors the backend supports through Nango (server `ai_connectors.py`). */
export const NANGO_PROVIDERS = [
  'slack',
  'outlook',
  'zoom',
  'google-calendar',
  'granola',
  'notion',
  'fathom',
  'intercom',
] as const

export function isNangoProvider(provider: string): boolean {
  return (NANGO_PROVIDERS as readonly string[]).includes(provider)
}

/* ------------------------------------------------------------------ ids */

const SEP = '|'

export const googleAccountId = (workspaceId: string) => `google${SEP}${workspaceId}`
export const nangoAccountId = (provider: string) => `nango${SEP}${provider}`

export type ParsedAccountId =
  | { kind: 'google'; workspaceId: string }
  | { kind: 'nango'; provider: string }
  | null

export function parseAccountId(accountId: string): ParsedAccountId {
  const [kind, rest] = accountId.split(SEP)
  if (kind === 'google' && rest) return { kind: 'google', workspaceId: rest }
  if (kind === 'nango' && rest) return { kind: 'nango', provider: rest }
  return null
}

const resourceId = (workspaceId: string, service: string, externalId: string) =>
  [workspaceId, service, externalId].join(SEP)

export function parseResourceId(id: string): { workspaceId: string; service: string; externalId: string } | null {
  const [workspaceId, service, ...rest] = id.split(SEP)
  if (!workspaceId || !service || rest.length === 0) return null
  return { workspaceId, service, externalId: rest.join(SEP) }
}

const normaliseAdsId = (id: string) => id.replace(/-/g, '')

/* ------------------------------------------------------------- clients */

const HUES = ['212 84% 54%', '162 62% 38%', '272 58% 60%', '340 62% 56%', '28 80% 52%', '215 16% 42%']

function hueFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

/** A backend client as a HiveX Reporting OS workspace. */
export function clientToWorkspace(client: BackendClient, organizationId: string): Workspace {
  const name = client.name?.trim() || client.key
  const created = client.created_at ?? new Date(0).toISOString()
  return {
    id: client.id,
    osId: 'reporting',
    organizationId,
    name,
    slug: slugify(name) || client.id,
    monogram: client.initials?.trim() || initialsOf(name),
    accent: hueFor(client.id),
    health: 'healthy',
    healthScore: 0,
    memberCount: 0,
    connectedIntegrations: [],
    createdAt: created,
    updatedAt: created,
    stats: [],
  }
}

/* ------------------------------------------------------------- Google */

export function googleAccount(
  workspace: DataWorkspace,
  clientId: string,
  clientName: string,
  status: GoogleStatus,
): IntegrationAccount {
  const scopes = new Set(status.scopes_granted ?? [])
  const granted = GOOGLE_SERVICES.filter((s) => scopes.has(s.scope))
  return {
    id: googleAccountId(workspace.id),
    provider: 'google',
    scope: { kind: 'client', osId: 'reporting', workspaceId: clientId },
    connectedIn: 'reporting',
    label: `${clientName} · Google`,
    externalAccountId: workspace.id,
    status: 'connected',
    services: granted.map((s) => s.service),
    grantedScopes: granted.map((s) => s.shortScope),
    connectedAt: workspace.created_at ?? '',
    connectedBy: 'Your team',
  }
}

export function googleResources(workspaceId: string, discovery: GoogleDiscovery): IntegrationResource[] {
  const accountId = googleAccountId(workspaceId)
  return [
    ...discovery.ga4_properties.map<IntegrationResource>((p) => ({
      id: resourceId(workspaceId, 'ga4', p.id),
      accountId,
      service: 'ga4',
      externalId: p.id,
      name: p.name || p.id,
      subtitle: p.client_name ? `GA4 property · ${p.client_name}` : 'GA4 property',
      kind: 'property',
      available: true,
    })),
    ...discovery.gsc_sites.map<IntegrationResource>((s) => ({
      id: resourceId(workspaceId, 'gsc', s.url),
      accountId,
      service: 'gsc',
      externalId: s.url,
      name: s.url.replace(/^sc-domain:/, ''),
      subtitle: s.permissionLevel && s.permissionLevel !== 'unknown' ? `Search Console · ${s.permissionLevel}` : 'Search Console site',
      kind: 'site',
      available: true,
    })),
    ...discovery.google_ads_customers.map<IntegrationResource>((c) => ({
      id: resourceId(workspaceId, 'google-ads', normaliseAdsId(c.id)),
      accountId,
      service: 'google-ads',
      externalId: normaliseAdsId(c.id),
      name: c.name || c.id,
      subtitle: [c.is_manager ? 'Manager account' : 'Ads account', c.currency_code].filter(Boolean).join(' · '),
      kind: 'account',
      available: true,
    })),
  ]
}

/** The backend's `is_mapped` selections, always feeding the workspace's own client. */
export function googleMappings(workspaceId: string, clientId: string, status: GoogleStatus): IntegrationMapping[] {
  const entries: [string, ConnectedAccountRow | null][] = [
    ['ga4', status.ga4],
    ['gsc', status.gsc],
    ['google-ads', status.google_ads],
  ]
  return entries.flatMap(([service, row]) => {
    if (!row) return []
    const externalId = service === 'google-ads' ? normaliseAdsId(row.account_id) : row.account_id
    return [
      {
        id: `map${SEP}${resourceId(workspaceId, service, externalId)}`,
        resourceId: resourceId(workspaceId, service, externalId),
        osId: 'reporting' as OSId,
        workspaceId: clientId,
        mappedAt: row.updated_at ?? row.created_at ?? '',
        mappedBy: 'Your team',
      },
    ]
  })
}

/* ------------------------------------------------------------- Nango */

export function nangoAccount(provider: string, workspaceId: string): IntegrationAccount {
  const definition = getIntegration(provider)
  return {
    id: nangoAccountId(provider),
    provider,
    scope: { kind: 'organization' },
    connectedIn: definition?.usedBy[0] ?? 'reporting',
    label: definition?.name ?? provider,
    externalAccountId: workspaceId,
    status: 'connected',
    services: [provider],
    grantedScopes: definition?.scopes ?? [],
    connectedAt: '',
    connectedBy: 'You',
  }
}
