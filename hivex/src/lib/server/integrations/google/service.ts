import 'server-only'

import {
  requireClientWorkspace,
  visibleClients,
  workspacesForClients,
  type IntegrationContext,
  type UserProfile,
} from '../context'
import { serverEnv } from '../env'
import { fernetEncrypt } from '../fernet'
import { GOOGLE_TOKEN_URL } from '../google-tokens'
import { HttpError } from '../http'
import { db, must } from '../supabase'

import { discoverResources, type DiscoveryRun } from './discovery'
import { signState, verifyState } from './oauth-state'

/**
 * Google data connectors — port of `server/app/endpoints/integration.py`.
 *
 * Storage is the existing model, unchanged: one `integrations` row
 * (provider = 'google') per client data workspace, `oauth_tokens` per
 * (integration, tools string), discovered resources in `connected_accounts`,
 * and the chosen resources mirrored into `client_properties` for sync. HiveX and
 * Reporting OS therefore read and write the very same connection per client.
 *
 * Differences from Reporting, all on the security side: every call is tied to
 * the authenticated user's own visible clients; the OAuth state is signed and
 * user-bound; the callback returns to HiveX. Reporting's cross-tenant fuzzy
 * auto-mapping is not ported — assignment is explicit.
 */

export const GOOGLE_TOOL_SCOPES = {
  analytics: 'https://www.googleapis.com/auth/analytics.readonly',
  searchconsole: 'https://www.googleapis.com/auth/webmasters.readonly',
  google_ads: 'https://www.googleapis.com/auth/adwords',
  google_business: 'https://www.googleapis.com/auth/business.manage',
} as const

export type GoogleToolKey = keyof typeof GOOGLE_TOOL_SCOPES
export const ALL_GOOGLE_TOOLS = Object.keys(GOOGLE_TOOL_SCOPES) as GoogleToolKey[]

const CALLBACK_PATH = '/api/integrations/google/callback'
const redirectUri = () => `${serverEnv.appUrl()}${CALLBACK_PATH}`

interface IntegrationRow {
  id: string
  workspace_id: string
  status: string | null
}

interface ConnectedAccountRow {
  account_id: string
  account_name: string | null
  account_type: string
  key?: string | null
  is_verified?: boolean | null
  metadata: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

async function googleIntegration(workspaceId: string): Promise<IntegrationRow | null> {
  const rows = must(
    await db().from('integrations').select('id, workspace_id, status').eq('workspace_id', workspaceId).eq('provider', 'google'),
    'Google integration lookup',
  ) as IntegrationRow[]
  return rows[0] ?? null
}

async function grantedScopes(integrationId: string): Promise<string[]> {
  const rows = must(
    await db().from('oauth_tokens').select('scopes').eq('integration_id', integrationId),
    'Granted scope lookup',
  ) as { scopes: string[] | null }[]
  return [...new Set(rows.flatMap((r) => r.scopes ?? []))]
}

/* ------------------------------------------------------------- connect */

function safeReturnPath(path: string | undefined): string {
  return path && path.startsWith('/') && !path.startsWith('//') ? path : '/app/integrations'
}

/** Google consent URL for one of the caller's clients (port of /auth/google/start). */
export async function buildConnectUrl(
  ctx: IntegrationContext,
  input: { clientId: string; tools?: string[]; returnTo?: string },
): Promise<string> {
  await requireClientWorkspace(ctx, input.clientId)
  const tools = (input.tools?.length ? input.tools : ALL_GOOGLE_TOOLS).filter(
    (t): t is GoogleToolKey => t in GOOGLE_TOOL_SCOPES,
  )
  if (tools.length === 0) throw new HttpError(400, 'Choose at least one Google service.')

  const scopes = [...new Set([...tools.map((t) => GOOGLE_TOOL_SCOPES[t]), 'openid', 'email', 'profile'])]
  const state = signState({
    profileId: ctx.profile.id,
    clientId: input.clientId,
    tools,
    returnTo: safeReturnPath(input.returnTo),
  })

  const params = new URLSearchParams({
    client_id: serverEnv.googleClientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/* ------------------------------------------------------------- callback */

function withQuery(path: string, params: Record<string, string>): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${serverEnv.appUrl()}${path}${separator}${new URLSearchParams(params).toString()}`
}

/**
 * Handles Google's redirect (port of /auth/google/callback). Returns the HiveX
 * URL to send the browser to — success or a readable error, never a raw 500.
 */
export async function handleCallback(searchParams: URLSearchParams): Promise<string> {
  let returnTo = '/app/integrations'
  try {
    const state = verifyState(searchParams.get('state') ?? '')
    returnTo = safeReturnPath(state.returnTo)

    const denied = searchParams.get('error')
    if (denied) throw new HttpError(400, denied === 'access_denied' ? 'Google access was declined.' : `Google returned: ${denied}`)
    const code = searchParams.get('code')
    if (!code) throw new HttpError(400, 'Google did not return an authorization code.')

    /* Re-resolve the user and their client: the state proves who started the
       flow, not that they are still allowed to finish it. */
    const profiles = must(
      await db().from('user_profiles').select('*').eq('id', state.profileId).limit(1),
      'Profile lookup',
    ) as UserProfile[]
    const profile = profiles[0]
    if (!profile || profile.status !== 'approved' || !profile.company_id) {
      throw new HttpError(403, 'Your account can no longer connect integrations.')
    }
    const ctx: IntegrationContext = { profile: profile as IntegrationContext['profile'] }
    const { workspace } = await requireClientWorkspace(ctx, state.clientId)

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: serverEnv.googleClientId(),
        client_secret: serverEnv.googleClientSecret(),
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenResponse.ok) {
      throw new HttpError(400, `Google did not issue tokens (${tokenResponse.status}).`)
    }
    const tokens = (await tokenResponse.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
      scope?: string
    }

    /* 1. The client's Google integration: reuse or create. */
    const now = new Date().toISOString()
    const existing = await googleIntegration(workspace.id)
    let integrationId: string
    if (existing) {
      integrationId = existing.id
      must(
        await db().from('integrations').update({ status: 'connected', updated_at: now }).eq('id', integrationId),
        'Updating the Google integration',
      )
    } else {
      const created = must(
        await db()
          .from('integrations')
          .insert({
            workspace_id: workspace.id,
            provider: 'google',
            service: 'google',
            status: 'connected',
            name: 'Google Marketing Integration',
          })
          .select('id'),
        'Creating the Google integration',
      ) as { id: string }[]
      integrationId = created[0]!.id
    }

    /* 2. Tokens, keyed by the tools string, encrypted with the shared key. */
    const tokenProvider = state.tools.join(',')
    const payload: Record<string, unknown> = {
      integration_id: integrationId,
      provider: tokenProvider,
      access_token_encrypted: fernetEncrypt(tokens.access_token),
      expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
    }
    if (tokens.refresh_token) payload.refresh_token_encrypted = fernetEncrypt(tokens.refresh_token)

    const tokenRows = must(
      await db().from('oauth_tokens').select('id').eq('integration_id', integrationId).eq('provider', tokenProvider),
      'Token lookup',
    ) as { id: string }[]
    if (tokenRows[0]) {
      must(await db().from('oauth_tokens').update(payload).eq('id', tokenRows[0].id), 'Saving Google tokens')
    } else {
      must(await db().from('oauth_tokens').insert(payload), 'Saving Google tokens')
    }

    /* 3. Discover what the account can see. */
    const discovery = await discoverResources(integrationId, state.tools)
    const failed = Object.keys(discovery.errors)
    return withQuery(returnTo, {
      google: 'connected',
      client: state.clientId,
      ...(failed.length ? { discovery_errors: failed.join(',') } : {}),
    })
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Google connection failed. Try again.'
    if (!(error instanceof HttpError)) console.error('[integrations] Google callback failed', error)
    return withQuery(returnTo, { google: 'error', message })
  }
}

/* ------------------------------------------------------------- status */

export interface GoogleClientStatus {
  client_id: string
  connected: boolean
  scopes_granted: string[]
  ga4: ConnectedAccountRow | null
  gsc: ConnectedAccountRow | null
  google_ads: ConnectedAccountRow | null
  connected_at: string | null
}

/** Port of /auth/status for every client the caller can see, in one call. */
export async function statusForClients(ctx: IntegrationContext): Promise<GoogleClientStatus[]> {
  const clients = await visibleClients(ctx)
  const workspaces = await workspacesForClients(clients.map((c) => c.id))
  const firstWorkspace = new Map<string, string>()
  workspaces.forEach((w) => {
    if (w.connected_to && !firstWorkspace.has(w.connected_to)) firstWorkspace.set(w.connected_to, w.id)
  })

  return Promise.all(
    clients.map(async (client): Promise<GoogleClientStatus> => {
      const empty: GoogleClientStatus = {
        client_id: client.id,
        connected: false,
        scopes_granted: [],
        ga4: null,
        gsc: null,
        google_ads: null,
        connected_at: null,
      }
      const workspaceId = firstWorkspace.get(client.id)
      if (!workspaceId) return empty
      const integration = await googleIntegration(workspaceId)
      if (!integration) return empty

      const scopes = await grantedScopes(integration.id)
      const accounts = must(
        await db().from('connected_accounts').select('*').eq('integration_id', integration.id),
        'Connected account lookup',
      ) as ConnectedAccountRow[]
      const mapped = (type: string, scope: string) =>
        scopes.includes(scope)
          ? (accounts.find((a) => a.account_type === type && a.metadata?.is_mapped === true) ?? null)
          : null

      const integrationRow = must(
        await db().from('integrations').select('created_at').eq('id', integration.id).limit(1),
        'Integration lookup',
      ) as { created_at: string | null }[]

      return {
        client_id: client.id,
        connected: true,
        scopes_granted: scopes,
        ga4: mapped('ga4_property', GOOGLE_TOOL_SCOPES.analytics),
        gsc: mapped('gsc_site', GOOGLE_TOOL_SCOPES.searchconsole),
        google_ads: mapped('google_ads_customer', GOOGLE_TOOL_SCOPES.google_ads),
        connected_at: integrationRow[0]?.created_at ?? null,
      }
    }),
  )
}

/* ------------------------------------------------------------- discovery */

export interface GoogleDiscoveryView {
  client_id: string
  ga4_properties: { id: string; name: string; parent_account: string | null }[]
  gsc_sites: { url: string; permission_level: string | null }[]
  google_ads_customers: { id: string; name: string; is_manager: boolean; currency_code: string | null }[]
  google_business_locations: { id: string; name: string; address: string | null }[]
}

/** Stored discovery for one client's connection (port of /auth/google/discovery, scoped). */
export async function discoveryForClient(ctx: IntegrationContext, clientId: string): Promise<GoogleDiscoveryView> {
  const { workspace } = await requireClientWorkspace(ctx, clientId)
  const integration = await googleIntegration(workspace.id)
  if (!integration) throw new HttpError(404, 'Google is not connected for this client.')

  const rows = must(
    await db().from('connected_accounts').select('*').eq('integration_id', integration.id),
    'Connected account lookup',
  ) as ConnectedAccountRow[]
  const meta = (row: ConnectedAccountRow, key: string) => {
    const value = row.metadata?.[key]
    return typeof value === 'string' ? value : null
  }

  return {
    client_id: clientId,
    ga4_properties: rows
      .filter((r) => r.account_type === 'ga4_property')
      .map((r) => ({ id: r.account_id, name: r.account_name ?? r.account_id, parent_account: meta(r, 'parent_account') })),
    gsc_sites: rows
      .filter((r) => r.account_type === 'gsc_site')
      .map((r) => ({ url: r.account_id, permission_level: meta(r, 'permission_level') ?? meta(r, 'permissionLevel') })),
    google_ads_customers: rows
      .filter((r) => r.account_type === 'google_ads_customer')
      .map((r) => ({
        id: r.account_id,
        name: r.account_name ?? r.account_id,
        is_manager: r.metadata?.is_manager === true,
        currency_code: meta(r, 'currency_code'),
      })),
    google_business_locations: rows
      .filter((r) => r.account_type === 'google_business_location')
      .map((r) => ({ id: r.account_id, name: r.account_name ?? r.account_id, address: meta(r, 'address') })),
  }
}

/** Re-run discovery against Google for one client's connection. */
export async function rediscover(ctx: IntegrationContext, clientId: string): Promise<DiscoveryRun> {
  const { workspace } = await requireClientWorkspace(ctx, clientId)
  const integration = await googleIntegration(workspace.id)
  if (!integration) throw new HttpError(404, 'Google is not connected for this client.')
  const scopes = await grantedScopes(integration.id)
  const tools = ALL_GOOGLE_TOOLS.filter((t) => scopes.includes(GOOGLE_TOOL_SCOPES[t]))
  return discoverResources(integration.id, tools)
}

/* ------------------------------------------------------------- mapping */

export interface MappingInput {
  clientId: string
  ga4PropertyId?: string
  ga4PropertyName?: string
  gscSiteUrl?: string
  googleAdsCustomerId?: string
  googleAdsCustomerName?: string
}

/**
 * Assign resources to the client (port of POST /auth/mapping).
 *
 * Flags the chosen account per type `is_mapped` (others of that type false),
 * stamps the client key, and mirrors the ids into `client_properties` with the
 * integration id — what the sync pipeline reads. The client is always the
 * caller's own; the resource must belong to that client's Google connection.
 */
export async function saveMapping(ctx: IntegrationContext, input: MappingInput): Promise<{ status: 'success' }> {
  const { client, workspace } = await requireClientWorkspace(ctx, input.clientId)
  const integration = await googleIntegration(workspace.id)
  if (!integration) throw new HttpError(404, 'Google is not connected for this client.')

  const scopes = await grantedScopes(integration.id)
  const accounts = must(
    await db().from('connected_accounts').select('*').eq('integration_id', integration.id),
    'Connected account lookup',
  ) as (ConnectedAccountRow & { id?: string })[]

  const selections: { type: string; id: string | undefined; scope: string; normalise?: (v: string) => string }[] = [
    { type: 'ga4_property', id: input.ga4PropertyId, scope: GOOGLE_TOOL_SCOPES.analytics },
    { type: 'gsc_site', id: input.gscSiteUrl, scope: GOOGLE_TOOL_SCOPES.searchconsole },
    {
      type: 'google_ads_customer',
      id: input.googleAdsCustomerId,
      scope: GOOGLE_TOOL_SCOPES.google_ads,
      normalise: (v) => v.replace(/-/g, ''),
    },
  ]
  if (!selections.some((s) => s.id)) throw new HttpError(400, 'Choose a resource to assign.')

  const updates: Record<string, unknown>[] = []
  for (const selection of selections) {
    if (!selection.id) continue
    const norm = selection.normalise ?? ((v: string) => v)
    const target = norm(selection.id)
    const ofType = accounts.filter((a) => a.account_type === selection.type)
    if (!ofType.some((a) => norm(a.account_id) === target)) {
      throw new HttpError(404, 'That resource was not discovered on this client’s Google connection.')
    }
    if (scopes.length > 0 && !scopes.includes(selection.scope)) {
      throw new HttpError(403, 'Google access for that service was not granted. Reconnect Google.')
    }
    for (const account of ofType) {
      const chosen = norm(account.account_id) === target
      updates.push({
        integration_id: integration.id,
        account_id: account.account_id,
        account_type: account.account_type,
        account_name: account.account_name,
        metadata: { ...(account.metadata ?? {}), is_mapped: chosen },
        ...(chosen ? { key: client.key, is_verified: true } : {}),
      })
    }
  }
  must(
    await db().from('connected_accounts').upsert(updates, { onConflict: 'integration_id,account_id,account_type' }),
    'Saving the assignment',
  )

  /* Bridge into client_properties, partial update like Reporting. */
  const props: Record<string, unknown> = { client_name: client.name ?? client.key, integration_id: integration.id }
  if (input.ga4PropertyId) props.ga4_property_id = input.ga4PropertyId
  if (input.gscSiteUrl) props.gsc_property_url = input.gscSiteUrl
  if (input.googleAdsCustomerId) props.google_ads_customer_id = input.googleAdsCustomerId.replace(/-/g, '')

  const existing = must(
    await db().from('client_properties').select('client_id').eq('client_id', client.id),
    'Client property lookup',
  ) as { client_id: string }[]
  if (existing.length > 0) {
    must(await db().from('client_properties').update(props).eq('client_id', client.id), 'Saving client properties')
  } else {
    must(await db().from('client_properties').insert({ client_id: client.id, ...props }), 'Saving client properties')
  }

  return { status: 'success' }
}

/* ------------------------------------------------------------- disconnect */

/**
 * Disconnect Google tools for a client (port of DELETE /auth/disconnect/{ws}/{tool},
 * applied per tool). The integration row is removed once no tokens remain.
 */
export async function disconnectGoogle(
  ctx: IntegrationContext,
  input: { clientId: string; tools?: string[] },
): Promise<{ status: 'success'; disconnected: string[] }> {
  const { workspace } = await requireClientWorkspace(ctx, input.clientId)
  const integration = await googleIntegration(workspace.id)
  if (!integration) throw new HttpError(404, 'Google is not connected for this client.')

  const tools = (input.tools?.length ? input.tools : ALL_GOOGLE_TOOLS).filter(
    (t): t is GoogleToolKey => t in GOOGLE_TOOL_SCOPES,
  )
  for (const tool of tools) {
    must(
      await db().from('oauth_tokens').delete().eq('integration_id', integration.id).ilike('provider', `%${tool}%`),
      'Removing Google tokens',
    )
    if (tool === 'analytics') {
      must(
        await db().from('connected_accounts').delete().eq('integration_id', integration.id).eq('account_type', 'ga4_property'),
        'Removing GA4 properties',
      )
    } else if (tool === 'searchconsole') {
      must(
        await db().from('connected_accounts').delete().eq('integration_id', integration.id).eq('account_type', 'gsc_site'),
        'Removing Search Console sites',
      )
    }
  }

  const remaining = must(
    await db().from('oauth_tokens').select('id').eq('integration_id', integration.id),
    'Token lookup',
  ) as { id: string }[]
  if (remaining.length === 0) {
    must(await db().from('integrations').delete().eq('id', integration.id), 'Removing the Google integration')
  }
  return { status: 'success', disconnected: tools }
}
