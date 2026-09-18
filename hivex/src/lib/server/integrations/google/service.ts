import 'server-only'

import {
  requireClient,
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
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
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

    /*
     * Which Google identity this is. The schema has no column for it, so the
     * email is kept in `integrations.name` — the only free-text field on the
     * row — giving each connection a human identity in both apps. The openid
     * and email scopes are always requested, so this is available.
     */
    const email = await googleAccountEmail(tokens.access_token)

    /* 1. The client's Google integration: reuse or create. */
    const now = new Date().toISOString()
    const existing = await googleIntegration(workspace.id)
    let integrationId: string
    if (existing) {
      integrationId = existing.id
      must(
        await db()
          .from('integrations')
          .update({ status: 'connected', updated_at: now, ...(email ? { name: integrationName(email) } : {}) })
          .eq('id', integrationId),
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
            name: email ? integrationName(email) : 'Google Marketing Integration',
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

/**
 * The signed-in Google identity for an access token. Failure is not fatal: the
 * connection still works, it just shows without an email.
 */
async function googleAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) return null
    const data = (await response.json()) as { email?: string }
    return data.email ?? null
  } catch {
    return null
  }
}

/** `integrations.name` carries the account identity: "Google · someone@agency.com". */
const NAME_PREFIX = 'Google · '
const integrationName = (email: string) => `${NAME_PREFIX}${email}`

function emailFromName(name: string | null): string | null {
  if (!name?.startsWith(NAME_PREFIX)) return null
  const email = name.slice(NAME_PREFIX.length).trim()
  return email.includes('@') ? email : null
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

/* ------------------------------------------------------------- accounts */

export interface GoogleAccountResource {
  service: 'ga4' | 'gsc' | 'google-ads' | 'gbp'
  external_id: string
  name: string
  subtitle: string | null
  /** Clients consuming this exact resource right now. */
  client_ids: string[]
}

export interface GoogleAccountClientUse {
  client_id: string
  ga4_property_id: string | null
  gsc_property_url: string | null
  google_ads_customer_id: string | null
}

export interface GoogleAccount {
  /** The integrations row id — the account's handle everywhere in the API. */
  id: string
  email: string | null
  /** The client this account was authorized under; it can still serve any client. */
  owner_client_id: string | null
  status: string
  connected_at: string | null
  scopes_granted: string[]
  resources: GoogleAccountResource[]
  clients: GoogleAccountClientUse[]
}

const ACCOUNT_TYPE_TO_SERVICE: Record<string, GoogleAccountResource['service']> = {
  ga4_property: 'ga4',
  gsc_site: 'gsc',
  google_ads_customer: 'google-ads',
  google_business_location: 'gbp',
}

const normaliseAds = (value: string) => value.replace(/-/g, '')

/**
 * Every Google account connected for the caller's company.
 *
 * An account is one `integrations` row: the OAuth connection and its tokens.
 * Its resources are what discovery found (`connected_accounts`), and the
 * clients using it are the `client_properties` rows pointing at it — which is
 * how one Google login can feed several clients.
 */
export async function googleAccounts(ctx: IntegrationContext): Promise<GoogleAccount[]> {
  const clients = await visibleClients(ctx)
  const clientIds = clients.map((c) => c.id)
  const workspaces = await workspacesForClients(clientIds)
  if (workspaces.length === 0) return []

  const clientForWorkspace = new Map(workspaces.map((w) => [w.id, w.connected_to]))
  const integrations = must(
    await db()
      .from('integrations')
      .select('id, workspace_id, status, name, created_at')
      .eq('provider', 'google')
      .in('workspace_id', workspaces.map((w) => w.id)),
    'Google account lookup',
  ) as { id: string; workspace_id: string; status: string | null; name: string | null; created_at: string | null }[]
  if (integrations.length === 0) return []

  const integrationIds = integrations.map((i) => i.id)
  const [accounts, tokens, properties] = await Promise.all([
    db().from('connected_accounts').select('*').in('integration_id', integrationIds),
    db().from('oauth_tokens').select('integration_id, scopes').in('integration_id', integrationIds),
    db()
      .from('client_properties')
      .select('client_id, integration_id, ga4_property_id, gsc_property_url, google_ads_customer_id')
      .in('client_id', clientIds),
  ])
  const accountRows = must(accounts, 'Connected account lookup') as (ConnectedAccountRow & { integration_id: string })[]
  const tokenRows = must(tokens, 'Granted scope lookup') as { integration_id: string; scopes: string[] | null }[]
  const propertyRows = must(properties, 'Client property lookup') as (GoogleAccountClientUse & { integration_id: string | null })[]

  return integrations.map((integration) => {
    const scopes = [
      ...new Set(tokenRows.filter((t) => t.integration_id === integration.id).flatMap((t) => t.scopes ?? [])),
    ]
    const uses = propertyRows.filter((p) => p.integration_id === integration.id)

    const resources = accountRows
      .filter((row) => row.integration_id === integration.id && ACCOUNT_TYPE_TO_SERVICE[row.account_type])
      .map<GoogleAccountResource>((row) => {
        const service = ACCOUNT_TYPE_TO_SERVICE[row.account_type]!
        const meta = (row.metadata ?? {}) as Record<string, unknown>
        const text = (key: string) => (typeof meta[key] === 'string' ? (meta[key] as string) : null)
        const usedBy = uses
          .filter((use) =>
            service === 'ga4'
              ? use.ga4_property_id === row.account_id
              : service === 'gsc'
                ? use.gsc_property_url === row.account_id
                : service === 'google-ads'
                  ? normaliseAds(use.google_ads_customer_id ?? '') === normaliseAds(row.account_id)
                  : false,
          )
          .map((use) => use.client_id)

        return {
          service,
          external_id: row.account_id,
          name: row.account_name ?? row.account_id,
          subtitle:
            service === 'ga4'
              ? text('parent_account')
              : service === 'gsc'
                ? (text('permission_level') ?? text('permissionLevel'))
                : service === 'google-ads'
                  ? [meta.is_manager === true ? 'Manager account' : 'Ads account', text('currency_code')].filter(Boolean).join(' · ')
                  : text('address'),
          client_ids: usedBy,
        }
      })

    return {
      id: integration.id,
      email: emailFromName(integration.name),
      owner_client_id: clientForWorkspace.get(integration.workspace_id) ?? null,
      status: integration.status ?? 'connected',
      connected_at: integration.created_at,
      scopes_granted: scopes,
      resources,
      /*
       * Only clients actually reading something. An unassigned client keeps its
       * `client_properties` row — the row is the client's Google slot, not its
       * selection — and listing it would claim a dependency that isn't there.
       */
      clients: uses
        .filter((use) => use.ga4_property_id || use.gsc_property_url || use.google_ads_customer_id)
        .map(({ client_id, ga4_property_id, gsc_property_url, google_ads_customer_id }) => ({
          client_id,
          ga4_property_id,
          gsc_property_url,
          google_ads_customer_id,
        })),
    }
  })
}

/** An account the caller may use, or 404. */
async function requireAccount(ctx: IntegrationContext, accountId: string): Promise<GoogleAccount> {
  const account = (await googleAccounts(ctx)).find((a) => a.id === accountId)
  if (!account) throw new HttpError(404, 'That Google account is not available to you.')
  return account
}

export interface AssignInput {
  accountId: string
  clientId: string
  service: 'ga4' | 'gsc' | 'google-ads'
  externalId: string
}

/**
 * Point one client at one resource of a Google account.
 *
 * Writes `client_properties`, which is what the sync pipeline reads, so a
 * client can consume any account's resource — including an account authorized
 * under a different client. The schema keeps a single `integration_id` per
 * client, so all of a client's Google data comes from one account: assigning a
 * resource from another account moves the whole client to that account, and the
 * response says which ids were dropped.
 */
export async function assignResource(
  ctx: IntegrationContext,
  input: AssignInput,
): Promise<{ status: 'success'; moved_account: boolean; cleared: string[] }> {
  const client = await requireClient(ctx, input.clientId)
  const account = await requireAccount(ctx, input.accountId)

  const resource = account.resources.find((r) => r.service === input.service && r.external_id === input.externalId)
  if (!resource) throw new HttpError(404, 'That resource is not available on this Google account.')

  const scope =
    input.service === 'ga4'
      ? GOOGLE_TOOL_SCOPES.analytics
      : input.service === 'gsc'
        ? GOOGLE_TOOL_SCOPES.searchconsole
        : GOOGLE_TOOL_SCOPES.google_ads
  if (account.scopes_granted.length > 0 && !account.scopes_granted.includes(scope)) {
    throw new HttpError(403, 'This Google account did not grant access to that service. Reconnect it with the service included.')
  }

  const existing = must(
    await db()
      .from('client_properties')
      .select('client_id, integration_id, ga4_property_id, gsc_property_url, google_ads_customer_id')
      .eq('client_id', client.id),
    'Client property lookup',
  ) as (GoogleAccountClientUse & { integration_id: string | null })[]
  const current = existing[0]
  const movedAccount = Boolean(current?.integration_id && current.integration_id !== account.id)

  const column =
    input.service === 'ga4' ? 'ga4_property_id' : input.service === 'gsc' ? 'gsc_property_url' : 'google_ads_customer_id'
  const value = input.service === 'google-ads' ? normaliseAds(input.externalId) : input.externalId

  /* Moving a client to another account invalidates ids that belonged to the old one. */
  const cleared: string[] = []
  const payload: Record<string, unknown> = {
    client_name: client.name ?? client.key,
    integration_id: account.id,
    [column]: value,
  }
  if (movedAccount) {
    for (const [col, held] of [
      ['ga4_property_id', current?.ga4_property_id],
      ['gsc_property_url', current?.gsc_property_url],
      ['google_ads_customer_id', current?.google_ads_customer_id],
    ] as const) {
      if (col !== column && held) {
        payload[col] = null
        cleared.push(col)
      }
    }
  }

  if (current) {
    must(await db().from('client_properties').update(payload).eq('client_id', client.id), 'Saving the assignment')
  } else {
    must(await db().from('client_properties').insert({ client_id: client.id, ...payload }), 'Saving the assignment')
  }

  /*
   * `connected_accounts.is_mapped` is the per-connection selection Reporting OS
   * shows. It only makes sense for the client this account was authorized
   * under, so it is updated for that client alone and left untouched otherwise.
   */
  if (account.owner_client_id === client.id) {
    const type = input.service === 'ga4' ? 'ga4_property' : input.service === 'gsc' ? 'gsc_site' : 'google_ads_customer'
    const rows = must(
      await db().from('connected_accounts').select('*').eq('integration_id', account.id).eq('account_type', type),
      'Connected account lookup',
    ) as ConnectedAccountRow[]
    const updates = rows.map((row) => {
      const chosen =
        input.service === 'google-ads'
          ? normaliseAds(row.account_id) === value
          : row.account_id === input.externalId
      return {
        integration_id: account.id,
        account_id: row.account_id,
        account_type: row.account_type,
        account_name: row.account_name,
        metadata: { ...(row.metadata ?? {}), is_mapped: chosen },
        ...(chosen ? { key: client.key, is_verified: true } : {}),
      }
    })
    if (updates.length > 0) {
      must(
        await db().from('connected_accounts').upsert(updates, { onConflict: 'integration_id,account_id,account_type' }),
        'Saving the assignment',
      )
    }
  }

  return { status: 'success', moved_account: movedAccount, cleared }
}

/** Stop a client using one service of an account (clears that column only). */
export async function unassignResource(
  ctx: IntegrationContext,
  input: { clientId: string; service: 'ga4' | 'gsc' | 'google-ads' },
): Promise<{ status: 'success' }> {
  const client = await requireClient(ctx, input.clientId)
  const column =
    input.service === 'ga4' ? 'ga4_property_id' : input.service === 'gsc' ? 'gsc_property_url' : 'google_ads_customer_id'

  const rows = must(
    await db().from('client_properties').select('client_id, integration_id').eq('client_id', client.id),
    'Client property lookup',
  ) as { client_id: string; integration_id: string | null }[]
  if (!rows[0]) return { status: 'success' }

  must(await db().from('client_properties').update({ [column]: null }).eq('client_id', client.id), 'Removing the assignment')

  if (rows[0].integration_id) {
    const type = input.service === 'ga4' ? 'ga4_property' : input.service === 'gsc' ? 'gsc_site' : 'google_ads_customer'
    const accountRows = must(
      await db().from('connected_accounts').select('*').eq('integration_id', rows[0].integration_id).eq('account_type', type),
      'Connected account lookup',
    ) as ConnectedAccountRow[]
    const mapped = accountRows.filter((row) => row.metadata?.is_mapped === true && row.key === client.key)
    if (mapped.length > 0) {
      must(
        await db()
          .from('connected_accounts')
          .upsert(
            mapped.map((row) => ({
              integration_id: rows[0].integration_id,
              account_id: row.account_id,
              account_type: row.account_type,
              account_name: row.account_name,
              metadata: { ...(row.metadata ?? {}), is_mapped: false },
            })),
            { onConflict: 'integration_id,account_id,account_type' },
          ),
        'Removing the assignment',
      )
    }
  }

  return { status: 'success' }
}

/** Disconnect a whole Google account (every tool it granted). */
export async function disconnectAccount(ctx: IntegrationContext, accountId: string) {
  const account = await requireAccount(ctx, accountId)
  if (!account.owner_client_id) throw new HttpError(409, 'This Google account has no client to disconnect from.')
  return disconnectGoogle(ctx, { clientId: account.owner_client_id })
}
