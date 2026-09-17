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
  ConnectedAccountRow,
  GoogleClientStatus,
  GoogleDiscovery,
  GoogleTool,
  IntegrationClient,
} from './api'

/**
 * API → HiveX domain adapters. Pure functions, no I/O.
 *
 *   Google   One connection per client (the shared integration model). One
 *            client-scoped HiveX account per connected client; its resources
 *            are what discovery found; its mappings are the assigned ones.
 *   Tools    Nango connections, owned by the signed-in user. One
 *            organization-level HiveX account per connected provider.
 */

/* ------------------------------------------------------------ Google tools */

interface GoogleService {
  service: string
  tool: GoogleTool
  scope: string
  shortScope: string
}

/** HiveX integration id ↔ API tool key ↔ OAuth scope. */
export const GOOGLE_SERVICES: GoogleService[] = [
  { service: 'ga4', tool: 'analytics', scope: 'https://www.googleapis.com/auth/analytics.readonly', shortScope: 'analytics.readonly' },
  { service: 'gsc', tool: 'searchconsole', scope: 'https://www.googleapis.com/auth/webmasters.readonly', shortScope: 'webmasters.readonly' },
  { service: 'google-ads', tool: 'google_ads', scope: 'https://www.googleapis.com/auth/adwords', shortScope: 'adwords' },
  { service: 'gbp', tool: 'google_business', scope: 'https://www.googleapis.com/auth/business.manage', shortScope: 'business.manage' },
]

/* ------------------------------------------------------------------ ids */

const SEP = '|'

export const googleAccountId = (clientId: string) => `google${SEP}${clientId}`
export const toolAccountId = (provider: string) => `tool${SEP}${provider}`

export type ParsedAccountId = { kind: 'google'; clientId: string } | { kind: 'tool'; provider: string } | null

export function parseAccountId(accountId: string): ParsedAccountId {
  const [kind, rest] = accountId.split(SEP)
  if (kind === 'google' && rest) return { kind: 'google', clientId: rest }
  if (kind === 'tool' && rest) return { kind: 'tool', provider: rest }
  return null
}

const resourceId = (clientId: string, service: string, externalId: string) => [clientId, service, externalId].join(SEP)

export function parseResourceId(id: string): { clientId: string; service: string; externalId: string } | null {
  const [clientId, service, ...rest] = id.split(SEP)
  if (!clientId || !service || rest.length === 0) return null
  return { clientId, service, externalId: rest.join(SEP) }
}

const normaliseAdsId = (id: string) => id.replace(/-/g, '')

/* ------------------------------------------------------------- clients */

const HUES = ['212 84% 54%', '162 62% 38%', '272 58% 60%', '340 62% 56%', '28 80% 52%', '215 16% 42%']

function hueFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

/** A client as a HiveX Reporting OS workspace. */
export function clientToWorkspace(client: IntegrationClient, organizationId: string): Workspace {
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

export function googleAccount(clientName: string, status: GoogleClientStatus): IntegrationAccount {
  const scopes = new Set(status.scopes_granted)
  const granted = GOOGLE_SERVICES.filter((s) => scopes.has(s.scope))
  return {
    id: googleAccountId(status.client_id),
    provider: 'google',
    scope: { kind: 'client', osId: 'reporting', workspaceId: status.client_id },
    connectedIn: 'reporting',
    label: `${clientName} · Google`,
    externalAccountId: status.client_id,
    status: 'connected',
    services: granted.map((s) => s.service),
    grantedScopes: granted.map((s) => s.shortScope),
    connectedAt: status.connected_at ?? '',
    connectedBy: 'Your team',
  }
}

export function googleResources(clientId: string, discovery: GoogleDiscovery): IntegrationResource[] {
  const accountId = googleAccountId(clientId)
  return [
    ...discovery.ga4_properties.map<IntegrationResource>((p) => ({
      id: resourceId(clientId, 'ga4', p.id),
      accountId,
      service: 'ga4',
      externalId: p.id,
      name: p.name || p.id,
      subtitle: p.parent_account ? `GA4 property · ${p.parent_account}` : 'GA4 property',
      kind: 'property',
      available: true,
    })),
    ...discovery.gsc_sites.map<IntegrationResource>((s) => ({
      id: resourceId(clientId, 'gsc', s.url),
      accountId,
      service: 'gsc',
      externalId: s.url,
      name: s.url.replace(/^sc-domain:/, ''),
      subtitle: s.permission_level ? `Search Console · ${s.permission_level}` : 'Search Console site',
      kind: 'site',
      available: true,
    })),
    ...discovery.google_ads_customers.map<IntegrationResource>((c) => ({
      id: resourceId(clientId, 'google-ads', normaliseAdsId(c.id)),
      accountId,
      service: 'google-ads',
      externalId: normaliseAdsId(c.id),
      name: c.name || c.id,
      subtitle: [c.is_manager ? 'Manager account' : 'Ads account', c.currency_code].filter(Boolean).join(' · '),
      kind: 'account',
      available: true,
    })),
    ...discovery.google_business_locations.map<IntegrationResource>((l) => ({
      id: resourceId(clientId, 'gbp', l.id),
      accountId,
      service: 'gbp',
      externalId: l.id,
      name: l.name,
      subtitle: l.address ?? 'Business Profile location',
      kind: 'location',
      available: true,
    })),
  ]
}

/** Assigned resources — they always feed the client that owns the connection. */
export function googleMappings(status: GoogleClientStatus): IntegrationMapping[] {
  const entries: [string, ConnectedAccountRow | null][] = [
    ['ga4', status.ga4],
    ['gsc', status.gsc],
    ['google-ads', status.google_ads],
  ]
  return entries.flatMap(([service, row]) => {
    if (!row) return []
    const externalId = service === 'google-ads' ? normaliseAdsId(row.account_id) : row.account_id
    const id = resourceId(status.client_id, service, externalId)
    return [
      {
        id: `map${SEP}${id}`,
        resourceId: id,
        osId: 'reporting' as OSId,
        workspaceId: status.client_id,
        mappedAt: row.updated_at ?? row.created_at ?? '',
        mappedBy: 'Your team',
      },
    ]
  })
}

/* ------------------------------------------------------------- tools */

export function toolAccount(provider: string): IntegrationAccount {
  const definition = getIntegration(provider)
  return {
    id: toolAccountId(provider),
    provider,
    scope: { kind: 'organization' },
    connectedIn: definition?.usedBy[0] ?? 'reporting',
    label: definition?.name ?? provider,
    externalAccountId: provider,
    status: 'connected',
    services: [provider],
    grantedScopes: definition?.scopes ?? [],
    connectedAt: '',
    connectedBy: 'You',
  }
}
