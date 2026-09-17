import 'server-only'

import { serverEnv } from '@/lib/server/integrations/env'
import { HttpError } from '@/lib/server/integrations/http'
import { db, must } from '@/lib/server/integrations/supabase'

import {
  asArray,
  asRecord,
  authHeaders,
  endpointIntegrationId,
  nangoFetch,
  ProviderError,
  pyStr,
  readBody,
  type JsonRecord,
} from './client'
import { TARGET_LISTERS, type Target } from './connectors'

/**
 * Nango tool-connector service — port of the Reporting backend's
 * `endpoints/nango.py` and `endpoints/ai_connectors.py:get_targets`.
 *
 * Every connection belongs to one person (`nango_connections.user_id` =
 * user_profiles.id) inside one workspace; callers pass server-resolved ids only.
 */

export const SUPPORTED_NANGO_PROVIDERS = [
  'slack',
  'outlook',
  'zoom',
  'google-calendar',
  'granola',
  'fathom',
  'intercom',
  'notion',
] as const

export type NangoProvider = (typeof SUPPORTED_NANGO_PROVIDERS)[number]
export type { Target }

export interface NangoScope {
  workspaceId: string
  userProfileId: string
}

export interface NangoProviderScope extends NangoScope {
  provider: string
}

export interface ConnectSession {
  token: string | null
  connect_link: string | null
  expires_at: string
}

const SLACK_USER_SCOPES =
  'channels:history,groups:history,im:history,mpim:history,' +
  'channels:read,groups:read,chat:write,users:read,users:read.email,im:write,mpim:write'

/** Python `str.capitalize()`: first char upper, the rest lower. */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function parseJsonRecord(text: string): JsonRecord {
  try {
    return asRecord(JSON.parse(text)) ?? {}
  } catch {
    return {}
  }
}

/** Creates a Nango Connect session tagged with this workspace and this person. */
export async function createConnectSession({ provider, workspaceId, userProfileId }: NangoProviderScope): Promise<ConnectSession> {
  const integrationId = endpointIntegrationId(provider)
  const payload: JsonRecord = {
    tags: {
      end_user_id: workspaceId,
      // Identifies exactly who connected, so finalize never hands this
      // person's connection to a teammate in the same workspace.
      connecting_user_id: userProfileId,
    },
    allowed_integrations: [integrationId],
  }
  if (provider === 'slack') {
    // Also request user-token scopes so reads/sends act as the connecting person.
    payload.integrations_config_defaults = { [integrationId]: { user_scopes: SLACK_USER_SCOPES } }
  } else if (provider === 'outlook') {
    // Force a fresh Microsoft sign-in instead of silently reusing the browser's SSO account.
    payload.integrations_config_defaults = { [integrationId]: { authorization_params: { prompt: 'login' } } }
  }

  const response = await nangoFetch(
    '/connect/sessions',
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Create Nango session',
  )
  const text = await readBody(response)

  if (response.status !== 200 && response.status !== 201) {
    let detail = `Failed to create Nango session: ${text}`
    if (asRecord(parseJsonRecord(text).error)?.code === 'resource_capped') {
      detail =
        'Nango connection limit reached. Please upgrade your Nango plan or delete some unused connections in the Nango dashboard.'
    }
    throw new HttpError(response.status, detail)
  }

  const data = asRecord(parseJsonRecord(text).data) ?? {}
  const token = (data.token || data.session_token || null) as string | null
  const expiresAt = (data.expires_at as string | undefined) || new Date(Date.now() + 60 * 60 * 1000).toISOString()

  let connectLink = (data.connect_link as string | undefined) || (token ? `${serverEnv.nangoConnectBaseUrl()}/?session_token=${token}` : null)
  const baseUrl = serverEnv.nangoBaseUrl()
  if (connectLink && baseUrl !== 'https://api.nango.dev') {
    // Self-hosted Nango: tell the Connect UI which API validates the session.
    const separator = connectLink.includes('?') ? '&' : '?'
    connectLink = `${connectLink}${separator}apiURL=${baseUrl}`
  }

  return { token, connect_link: connectLink, expires_at: expiresAt }
}

/** Finds this person's newest Nango connection for the provider and records it. */
export async function finalizeConnection({
  provider,
  workspaceId,
  userProfileId,
}: NangoProviderScope): Promise<{ status: 'success'; message: string }> {
  const integrationId = endpointIntegrationId(provider)
  const supabase = db()

  const response = await nangoFetch('/connections', { headers: authHeaders() }, 'Fetch Nango connections')
  const text = await readBody(response)
  if (response.status !== 200) {
    throw new HttpError(400, `Failed to fetch connections from Nango: ${text}`)
  }

  const connections = asArray(parseJsonRecord(text).connections)
    .map((c) => asRecord(c) ?? {})
    .sort((a, b) => {
      const ka = String(a.created ?? '')
      const kb = String(b.created ?? '')
      return ka < kb ? 1 : ka > kb ? -1 : 0
    })

  let matched: JsonRecord | null = null
  for (const conn of connections) {
    if (conn.provider_config_key !== integrationId) continue

    // Tags don't reliably round-trip through Nango's list endpoint, so the
    // built-in end_user id is also accepted — but then a connection already
    // claimed by a different person in our DB is skipped.
    const tags = asRecord(conn.tags)
    const endUser = asRecord(conn.end_user)
    const candidateConnectionId = conn.connection_id

    const tagsMatch =
      !!tags &&
      Object.keys(tags).length > 0 &&
      pyStr(tags.end_user_id) === workspaceId &&
      pyStr(tags.connecting_user_id) === userProfileId
    const endUserMatch = !!endUser && Object.keys(endUser).length > 0 && pyStr(endUser.id) === workspaceId

    if (!(tagsMatch || endUserMatch)) continue

    if (endUserMatch && !tagsMatch && candidateConnectionId) {
      const claimed = must(
        await supabase
          .from('nango_connections')
          .select('user_id, integrations!inner(workspace_id, provider)')
          .eq('integrations.workspace_id', workspaceId)
          .eq('integrations.provider', provider)
          .eq('connection_id', candidateConnectionId as string)
          .neq('user_id', userProfileId),
        'Check existing Nango connection owner',
      )
      if (claimed && claimed.length > 0) continue
    }

    matched = conn
    break
  }

  if (!matched) throw new HttpError(400, 'Connection not found on Nango')

  const connectionId = matched.connection_id as string

  let integrations = must(
    await supabase.from('integrations').select('id').eq('workspace_id', workspaceId).eq('provider', provider),
    'Load integration',
  )
  if (!integrations || integrations.length === 0) {
    integrations = must(
      await supabase
        .from('integrations')
        .insert({
          workspace_id: workspaceId,
          provider,
          service: provider,
          status: 'connected',
          name: `${capitalize(provider)} Integration`,
        })
        .select('id'),
      'Create integration',
    )
  }
  const integrationDbId = (integrations?.[0] as { id: string } | undefined)?.id
  if (!integrationDbId) throw new HttpError(500, 'Create integration failed')

  // One row per person: a teammate connecting the same provider gets their own row.
  const existing = must(
    await supabase
      .from('nango_connections')
      .select('id')
      .eq('integration_id', integrationDbId)
      .eq('provider', provider)
      .eq('user_id', userProfileId),
    'Load Nango connection',
  )
  if (!existing || existing.length === 0) {
    must(
      await supabase.from('nango_connections').insert({
        integration_id: integrationDbId,
        provider,
        connection_id: connectionId,
        user_id: userProfileId,
      }),
      'Save Nango connection',
    )
  } else {
    must(
      await supabase
        .from('nango_connections')
        .update({ connection_id: connectionId })
        .eq('integration_id', integrationDbId)
        .eq('provider', provider)
        .eq('user_id', userProfileId),
      'Update Nango connection',
    )
  }

  return { status: 'success', message: 'Connection finalized' }
}

/** Providers this person has connected in the workspace (never a teammate's). */
export async function connectedProviders({ workspaceId, userProfileId }: NangoScope): Promise<string[]> {
  const rows = must(
    await db()
      .from('nango_connections')
      .select('provider, integrations!inner(workspace_id)')
      .eq('integrations.workspace_id', workspaceId)
      .eq('user_id', userProfileId),
    'Load Nango connection status',
  )
  return (rows ?? []).map((row) => (row as { provider: string }).provider)
}

/** Removes this person's own connection from Nango and the DB; the integrations row stays. */
export async function disconnect({ provider, workspaceId, userProfileId }: NangoProviderScope): Promise<{ status: 'success' }> {
  const supabase = db()
  const integrations = must(
    await supabase.from('integrations').select('id').eq('workspace_id', workspaceId).eq('provider', provider),
    'Load integration',
  )
  if (!integrations || integrations.length === 0) throw new HttpError(404, 'Integration not found in DB')
  const integrationDbId = (integrations[0] as { id: string }).id

  const rows = must(
    await supabase
      .from('nango_connections')
      .select('connection_id')
      .eq('integration_id', integrationDbId)
      .eq('provider', provider)
      .eq('user_id', userProfileId),
    'Load Nango connection',
  )
  if (!rows || rows.length === 0) throw new HttpError(404, 'Connection not found in DB')
  const connectionId = (rows[0] as { connection_id: string }).connection_id
  const integrationId = endpointIntegrationId(provider)

  // Like the Python endpoint, Nango's response status is not checked.
  await nangoFetch(
    `/connections/${encodeURIComponent(connectionId)}?provider_config_key=${encodeURIComponent(integrationId)}`,
    { method: 'DELETE', headers: authHeaders() },
    'Delete Nango connection',
  )

  must(
    await supabase
      .from('nango_connections')
      .delete()
      .eq('integration_id', integrationDbId)
      .eq('provider', provider)
      .eq('user_id', userProfileId),
    'Delete Nango connection',
  )

  return { status: 'success' }
}

/** Port of `_resolve_connection_id`: this person's connection id for the provider. */
async function resolveConnectionId(workspaceId: string, provider: string, userProfileId: string): Promise<string> {
  const supabase = db()
  const notConnected = `${provider} isn't connected for this workspace yet.`

  const integrations = must(
    await supabase.from('integrations').select('id').eq('workspace_id', workspaceId).eq('provider', provider),
    'Load integration',
  )
  if (!integrations || integrations.length === 0) throw new HttpError(404, notConnected)
  const integrationDbId = (integrations[0] as { id: string }).id

  const rows = must(
    await supabase
      .from('nango_connections')
      .select('connection_id')
      .eq('integration_id', integrationDbId)
      .eq('provider', provider)
      .eq('user_id', userProfileId),
    'Load Nango connection',
  )
  if (!rows || rows.length === 0) throw new HttpError(404, notConnected)
  return (rows[0] as { connection_id: string }).connection_id
}

/** Live picker targets (channels, folders, meetings, pages…) for this person's connection. */
export async function listTargets({ provider, workspaceId, userProfileId }: NangoProviderScope): Promise<Target[]> {
  const lister = (SUPPORTED_NANGO_PROVIDERS as readonly string[]).includes(provider) ? TARGET_LISTERS[provider] : undefined
  if (!lister) throw new HttpError(400, `Unsupported provider: ${provider}`)

  const connectionId = await resolveConnectionId(workspaceId, provider, userProfileId)

  try {
    return await lister(connectionId)
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new HttpError(502, `Failed to list ${provider} targets: ${error.message}`)
    }
    throw error
  }
}
