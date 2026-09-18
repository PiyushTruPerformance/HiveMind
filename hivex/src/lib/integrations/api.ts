/**
 * Integrations API client — HiveX's own integration API (`/api/integrations/*`).
 *
 * Same-origin route handlers in this app, which authenticate the Clerk session
 * and resolve tenant, client and internal workspace context on the server. The
 * browser never sends or receives a workspace id; clients are the only handle.
 */

/* ---------------------------------------------------------------- types */

export interface IntegrationClient {
  id: string
  name: string | null
  key: string
  initials: string | null
  created_at: string | null
}

export interface ConnectedAccountRow {
  account_id: string
  account_name: string | null
  account_type: string
  key?: string | null
  is_verified?: boolean | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

export interface GoogleClientStatus {
  client_id: string
  connected: boolean
  scopes_granted: string[]
  ga4: ConnectedAccountRow | null
  gsc: ConnectedAccountRow | null
  google_ads: ConnectedAccountRow | null
  connected_at: string | null
}

export interface GoogleDiscovery {
  client_id: string
  ga4_properties: { id: string; name: string; parent_account: string | null }[]
  gsc_sites: { url: string; permission_level: string | null }[]
  google_ads_customers: { id: string; name: string; is_manager: boolean; currency_code: string | null }[]
  google_business_locations: { id: string; name: string; address: string | null }[]
}

export interface DiscoveryRun {
  ga4_properties_found: number
  gsc_sites_found: number
  google_ads_accounts_found: number
  google_business_locations_found: number
  errors: Record<string, string>
}

export type GoogleTool = 'analytics' | 'searchconsole' | 'google_ads' | 'google_business'

export interface GoogleMappingRequest {
  client_id: string
  ga4_property_id?: string
  ga4_property_name?: string
  gsc_site_url?: string
  google_ads_customer_id?: string
  google_ads_customer_name?: string
}

export type GoogleService = 'ga4' | 'gsc' | 'google-ads' | 'gbp'

export interface GoogleAccountResource {
  service: GoogleService
  external_id: string
  name: string
  subtitle: string | null
  /** Clients consuming this exact resource. */
  client_ids: string[]
}

export interface GoogleAccountClientUse {
  client_id: string
  ga4_property_id: string | null
  gsc_property_url: string | null
  google_ads_customer_id: string | null
}

/** One connected Google identity: its resources and the clients using them. */
export interface GoogleAccount {
  id: string
  email: string | null
  owner_client_id: string | null
  status: string
  connected_at: string | null
  scopes_granted: string[]
  resources: GoogleAccountResource[]
  clients: GoogleAccountClientUse[]
}

export interface ToolStatus {
  supported: string[]
  connected_providers: string[]
}

export interface NangoConnectSession {
  token: string | null
  connect_link: string | null
  expires_at: string
}

export class IntegrationApiError extends Error {
  status: number
  offline: boolean

  constructor(status: number, message: string, offline = false) {
    super(message)
    this.name = 'IntegrationApiError'
    this.status = status
    this.offline = offline
  }
}

/* ---------------------------------------------------------------- transport */

const BASE = '/api/integrations'

async function request<T>(
  token: string,
  path: string,
  init: RequestInit & { json?: unknown } = {},
  failure = 'Integrations request failed',
): Promise<T> {
  const { json, ...rest } = init
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...rest,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...rest.headers,
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    })
  } catch {
    throw new IntegrationApiError(0, `${failure}: the server could not be reached.`, true)
  }

  if (!response.ok) {
    let detail: string | undefined
    try {
      const body = (await response.json()) as { detail?: unknown }
      detail = typeof body.detail === 'string' ? body.detail : undefined
    } catch {
      detail = undefined
    }
    if (response.status === 401) throw new IntegrationApiError(401, 'Your session could not be verified. Sign in again.')
    throw new IntegrationApiError(response.status, detail ?? `${failure} (${response.status})`)
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new IntegrationApiError(response.status, `${failure}: the server returned a malformed response.`)
  }
}

/* ---------------------------------------------------------------- endpoints */

export const integrationApi = {
  listClients: (token: string) => request<IntegrationClient[]>(token, '/clients', {}, 'Could not load clients'),

  /* Google data connectors */
  googleStatus: (token: string) =>
    request<GoogleClientStatus[]>(token, '/google', {}, 'Could not load Google connections'),

  googleDiscovery: (token: string, clientId: string) =>
    request<GoogleDiscovery>(
      token,
      `/google/discovery?client_id=${encodeURIComponent(clientId)}`,
      {},
      'Could not load Google resources',
    ),

  googleRediscover: (token: string, clientId: string) =>
    request<DiscoveryRun>(token, '/google/discovery', { method: 'POST', json: { client_id: clientId } }, 'Discovery failed'),

  googleConnectUrl: (token: string, clientId: string, returnTo: string, tools?: GoogleTool[]) =>
    request<{ url: string }>(
      token,
      '/google/connect',
      { method: 'POST', json: { client_id: clientId, return_to: returnTo, ...(tools ? { tools } : {}) } },
      'Could not start Google sign-in',
    ),

  saveGoogleMapping: (token: string, body: GoogleMappingRequest) =>
    request<{ status: string }>(token, '/google/mapping', { method: 'POST', json: body }, 'Could not save the assignment'),

  disconnectGoogle: (token: string, clientId: string, tools?: GoogleTool[]) =>
    request<{ status: string; disconnected: string[] }>(
      token,
      '/google/disconnect',
      { method: 'POST', json: { client_id: clientId, ...(tools ? { tools } : {}) } },
      'Could not disconnect Google',
    ),

  syncClient: (token: string, clientId: string) =>
    request<Record<string, unknown>>(token, '/google/sync', { method: 'POST', json: { client_id: clientId } }, 'Sync failed'),

  /* Google accounts: identities, their resources and client assignments */
  googleAccounts: (token: string) =>
    request<GoogleAccount[]>(token, '/google/accounts', {}, 'Could not load Google accounts'),

  assignResource: (
    token: string,
    body: { account_id: string; client_id: string; service: Exclude<GoogleService, 'gbp'>; external_id: string },
  ) =>
    request<{ status: string; moved_account: boolean; cleared: string[] }>(
      token,
      '/google/assign',
      { method: 'POST', json: body },
      'Could not save the assignment',
    ),

  unassignResource: (token: string, body: { client_id: string; service: Exclude<GoogleService, 'gbp'> }) =>
    request<{ status: string }>(token, '/google/assign', { method: 'DELETE', json: body }, 'Could not remove the assignment'),

  disconnectAccount: (token: string, accountId: string) =>
    request<{ status: string }>(
      token,
      '/google/disconnect',
      { method: 'POST', json: { account_id: accountId } },
      'Could not disconnect this Google account',
    ),

  /* Tool connectors (Nango, per user) */
  toolStatus: (token: string) => request<ToolStatus>(token, '/tools', {}, 'Could not load tool connections'),

  toolConnectSession: (token: string, provider: string) =>
    request<NangoConnectSession>(
      token,
      '/tools/connect-session',
      { method: 'POST', json: { provider } },
      'Could not start the connection',
    ),

  toolFinalize: (token: string, provider: string) =>
    request<{ status: string; message?: string }>(
      token,
      '/tools/finalize',
      { method: 'POST', json: { provider } },
      'Could not finish the connection',
    ),

  toolDisconnect: (token: string, provider: string) =>
    request<{ status: string }>(token, '/tools/disconnect', { method: 'POST', json: { provider } }, 'Could not disconnect'),

  toolTargets: (token: string, provider: string) =>
    request<{ targets: { id: string; label: string }[] }>(
      token,
      `/tools/targets?provider=${encodeURIComponent(provider)}`,
      {},
      'Could not load targets',
    ),
}

export function integrationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong with the integrations service.'
}
