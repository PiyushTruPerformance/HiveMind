import { apiUrl, authUrl } from '@/lib/api/config'

/**
 * Integrations API client — the Tru Reporting core backend.
 *
 * HiveX is a client of the existing integration backend; nothing here
 * reimplements it. Two route families:
 *
 *   /api/v1/*   Clerk-authenticated: clients, data workspaces, Nango tool
 *               connectors, connector sync.
 *   /auth/*     Google OAuth, status, discovery, mapping and disconnect. These
 *               backend routes take no Authorization header (as the Reporting
 *               client calls them). HiveX only ever passes workspace ids that the
 *               authenticated `/workspaces/` endpoint returned for this user.
 *
 * Contracts mirror `server/app/endpoints/{integration,nango,connectors,clients,
 * workspaces}.py` in the Tru Reporting repository.
 */

/* ---------------------------------------------------------------- types */

export interface BackendClient {
  id: string
  name: string | null
  key: string
  initials?: string | null
  accent?: string | null
  created_at?: string | null
}

/** A `workspaces` row: the per-client data workspace integrations hang off. */
export interface DataWorkspace {
  id: string
  name: string
  connected_to: string | null
  created_at?: string | null
}

/** A `connected_accounts` row, as `/auth/status` returns the mapped ones. */
export interface ConnectedAccountRow {
  id?: string
  account_id: string
  account_name: string | null
  account_type: 'ga4_property' | 'gsc_site' | 'google_ads_customer' | string
  key?: string | null
  is_verified?: boolean | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

export interface GoogleStatus {
  connected: boolean
  ga4: ConnectedAccountRow | null
  gsc: ConnectedAccountRow | null
  google_ads: ConnectedAccountRow | null
  /** Absent when not connected. */
  scopes_granted?: string[]
}

export interface GoogleDiscovery {
  ga4_properties: { id: string; name: string; is_verified?: boolean; key?: string | null; client_name?: string | null }[]
  gsc_sites: { url: string; permissionLevel?: string; is_verified?: boolean; key?: string | null; client_name?: string | null }[]
  google_ads_customers: {
    id: string
    name: string
    is_verified?: boolean
    key?: string | null
    client_name?: string | null
    is_manager?: boolean
    currency_code?: string | null
    time_zone?: string | null
  }[]
  granted_scopes: string[]
}

export interface GoogleMappingRequest {
  workspace_id: string
  ga4_property_id?: string
  ga4_property_name?: string
  gsc_site_url?: string
  google_ads_customer_id?: string
  google_ads_customer_name?: string
}

/** Google tool keys the backend's OAuth scope map understands. */
export type GoogleTool = 'analytics' | 'searchconsole' | 'google_ads' | 'google_business'

export interface NangoConnectSession {
  token: string
  connect_link?: string
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

async function request<T>(url: string, init: RequestInit, failure: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, cache: 'no-store' })
  } catch {
    throw new IntegrationApiError(0, `${failure}: the integrations service could not be reached.`, true)
  }

  if (!response.ok) {
    let detail: string | undefined
    try {
      const body = (await response.json()) as { detail?: unknown }
      detail = typeof body.detail === 'string' ? body.detail : undefined
    } catch {
      detail = undefined
    }
    if (response.status === 401) {
      throw new IntegrationApiError(401, 'Your session could not be verified. Sign in again and retry.')
    }
    if (response.status === 403) {
      throw new IntegrationApiError(403, detail ?? 'You do not have permission to do that.')
    }
    throw new IntegrationApiError(response.status, detail ? `${failure}: ${detail}` : `${failure} (${response.status})`)
  }

  const text = await response.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new IntegrationApiError(response.status, `${failure}: the service returned a malformed response.`)
  }
}

const json = { 'Content-Type': 'application/json' }
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

/* ---------------------------------------------------------------- endpoints */

export const integrationApi = {
  /* Tenant context — both scoped server-side to the caller's company. */
  listClients: (token: string) =>
    request<BackendClient[]>(apiUrl('/clients/'), { headers: bearer(token) }, 'Could not load clients'),

  listDataWorkspaces: (token: string) =>
    request<DataWorkspace[]>(apiUrl('/workspaces/'), { headers: bearer(token) }, 'Could not load workspaces'),

  /* Google (first-party OAuth pipeline). */

  /** Browser-navigation URL: the backend answers with a redirect to Google's consent screen. */
  googleStartUrl: (workspaceId: string, tools: GoogleTool[]) => {
    const params = new URLSearchParams({ workspace_id: workspaceId, tools: tools.join(',') })
    return authUrl(`/auth/google/start?${params.toString()}`)
  },

  googleStatus: (workspaceId: string) =>
    request<GoogleStatus>(
      authUrl(`/auth/status/${encodeURIComponent(workspaceId)}`),
      {},
      'Could not load Google connection status',
    ),

  googleDiscovery: (workspaceId: string) =>
    request<GoogleDiscovery>(
      authUrl(`/auth/google/discovery?workspace_id=${encodeURIComponent(workspaceId)}`),
      {},
      'Could not load Google resources',
    ),

  saveGoogleMapping: (body: GoogleMappingRequest) =>
    request<{ status: string; message?: string }>(
      authUrl('/auth/mapping'),
      { method: 'POST', headers: json, body: JSON.stringify(body) },
      'Could not save the mapping',
    ),

  disconnectGoogleTool: (workspaceId: string, tool: GoogleTool) =>
    request<{ status: string }>(
      authUrl(`/auth/disconnect/${encodeURIComponent(workspaceId)}/${tool}`),
      { method: 'DELETE' },
      'Could not disconnect Google',
    ),

  /* Nango (tool connectors). Connections are per user within a workspace. */

  nangoStatus: (token: string, workspaceId: string) =>
    request<{ connected_providers: string[] }>(
      apiUrl(`/nango/status/${encodeURIComponent(workspaceId)}`),
      { headers: bearer(token) },
      'Could not load tool connections',
    ),

  nangoConnectSession: (token: string, provider: string, workspaceId: string) =>
    request<NangoConnectSession>(
      apiUrl('/nango/connect-session'),
      { method: 'POST', headers: { ...json, ...bearer(token) }, body: JSON.stringify({ provider, workspace_id: workspaceId }) },
      'Could not start the connection',
    ),

  nangoFinalize: (token: string, provider: string, workspaceId: string) =>
    request<{ status: string; message?: string }>(
      apiUrl('/nango/finalize-connection'),
      { method: 'POST', headers: { ...json, ...bearer(token) }, body: JSON.stringify({ provider, workspace_id: workspaceId }) },
      'Could not finish the connection',
    ),

  nangoDisconnect: (token: string, provider: string, workspaceId: string) =>
    request<{ status: string }>(
      apiUrl(`/nango/disconnect/${encodeURIComponent(workspaceId)}/${encodeURIComponent(provider)}`),
      { method: 'DELETE', headers: bearer(token) },
      'Could not disconnect',
    ),

  /* Data sync for one client (GA4, Search Console, Google Ads). */
  syncClient: (token: string, clientId: string) =>
    request<unknown>(
      apiUrl(`/connectors/sync/${encodeURIComponent(clientId)}?days=90`),
      { method: 'POST', headers: bearer(token) },
      'Sync failed',
    ),
}

export function integrationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong with the integrations service.'
}
