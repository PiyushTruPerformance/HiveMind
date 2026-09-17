import 'server-only'

import { HttpError } from '@/lib/server/integrations/http'

import {
  asArray,
  asRecord,
  authHeaders,
  connectorIntegrationId,
  nangoFetch,
  ProviderError,
  proxyGet,
  proxyPost,
  pyStr,
  readBody,
  type JsonRecord,
} from './client'

/**
 * Target listings for the composer's pickers — port of the `list_*` functions
 * in the Reporting backend's `ai_connectors/connectors/*.py`.
 */

export interface Target {
  id: string
  label: string
}

function requireId(item: JsonRecord, key: string, provider: string): string {
  const value = item[key]
  if (value === undefined || value === null) {
    throw new ProviderError(`${provider} item is missing "${key}"`)
  }
  return pyStr(value)
}

function truthyString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

// ---- Slack ---------------------------------------------------------------

const USER_TOKEN_PATHS: string[][] = [
  ['authed_user', 'access_token'],
  ['oauth', 'authed_user', 'access_token'],
  ['data', 'authed_user', 'access_token'],
  ['credentials', 'authed_user', 'access_token'],
  ['credentials', 'raw', 'authed_user', 'access_token'],
  ['credentials', 'data', 'authed_user', 'access_token'],
  ['raw', 'authed_user', 'access_token'],
  ['raw_credentials', 'authed_user', 'access_token'],
]

function extractUserToken(payload: unknown): string | null {
  const root = asRecord(payload)
  if (!root) return null
  for (const path of USER_TOKEN_PATHS) {
    let value: unknown = root
    for (const key of path) {
      const record = asRecord(value)
      value = record ? record[key] : undefined
      if (value === undefined || value === null) break
    }
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/**
 * Port of `endpoints/slack.py:get_slack_token` — prefers the connecting
 * person's user token over the bot token, checking every known Nango shape.
 */
async function getSlackToken(connectionId: string): Promise<string> {
  const providerConfigKey = connectorIntegrationId('slack') || 'slack'
  const path = `/connection/${encodeURIComponent(connectionId)}?provider_config_key=${encodeURIComponent(providerConfigKey)}`
  const response = await nangoFetch(path, { headers: authHeaders() }, 'Fetch Slack connection')
  const text = await readBody(response)
  if (response.status !== 200) {
    throw new HttpError(response.status, `Failed to fetch connection from Nango: ${text}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpError(502, 'Nango returned an invalid Slack connection payload')
  }
  const connection = asRecord(parsed) ?? {}
  const credentials = asRecord(connection.credentials) ?? {}

  let userToken: string | null = null
  for (const candidate of [
    credentials.raw,
    connection.raw,
    connection.raw_credentials,
    connection.metadata,
    credentials,
    connection,
  ]) {
    userToken = extractUserToken(candidate)
    if (userToken) break
  }

  if (!userToken) {
    const primary = credentials.access_token
    if (typeof primary === 'string' && primary && !primary.toLowerCase().startsWith('xoxb-')) {
      userToken = primary
    }
  }

  const accessToken = userToken ?? truthyString(credentials.access_token)
  if (!accessToken) {
    throw new HttpError(500, 'Slack access token not found in Nango connection')
  }
  return accessToken
}

async function listSlackChannels(connectionId: string): Promise<Target[]> {
  const token = await getSlackToken(connectionId)
  const channels: JsonRecord[] = []
  let cursor: string | null = null
  for (;;) {
    const params = new URLSearchParams({ types: 'public_channel,private_channel,mpim,im', limit: '200' })
    if (cursor) params.set('cursor', cursor)
    let response: Response
    try {
      response = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
    } catch (error) {
      throw new ProviderError(`Slack API error: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (response.status !== 200) throw new ProviderError(`Slack API error: ${response.status}`)
    let data: JsonRecord
    try {
      data = asRecord(await response.json()) ?? {}
    } catch {
      throw new ProviderError('Slack API error: invalid JSON response')
    }
    if (!data.ok) throw new ProviderError(`Slack API error: ${pyStr(data.error)}`)
    for (const channel of asArray(data.channels)) {
      const record = asRecord(channel)
      if (record) channels.push(record)
    }
    cursor = truthyString(asRecord(data.response_metadata)?.next_cursor)
    if (!cursor) break
  }
  return channels.map((c) => {
    const id = requireId(c, 'id', 'Slack channel')
    return { id, label: truthyString(c.name) ?? truthyString(c.user) ?? id }
  })
}

// ---- Proxy-based providers -----------------------------------------------

async function listOutlookFolders(connectionId: string): Promise<Target[]> {
  const data = await proxyGet(connectionId, connectorIntegrationId('outlook'), 'v1.0/me/mailFolders', { $top: 100 })
  return asArray(data.value).map((item) => {
    const f = asRecord(item) ?? {}
    const id = requireId(f, 'id', 'Outlook folder')
    return { id, label: f.displayName != null ? String(f.displayName) : id }
  })
}

async function listZoomRecordings(connectionId: string, limit = 200): Promise<Target[]> {
  const data = await proxyGet(connectionId, connectorIntegrationId('zoom'), 'users/me/recordings', {
    page_size: Math.min(limit, 300),
  })
  return asArray(data.meetings).map((item) => {
    const m = asRecord(item) ?? {}
    const id = pyStr(m.id)
    return { id, label: m.topic != null ? String(m.topic) : id }
  })
}

async function listGoogleCalendarEvents(connectionId: string, limit = 50): Promise<Target[]> {
  // Python: strftime("%Y-%m-%dT%H:%M:%SZ") — whole seconds, UTC.
  const nowIso = `${new Date().toISOString().slice(0, 19)}Z`
  const data = await proxyGet(connectionId, connectorIntegrationId('google-calendar'), 'calendar/v3/calendars/primary/events', {
    maxResults: Math.min(limit, 250),
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: nowIso,
  })
  return asArray(data.items).map((item) => {
    const e = asRecord(item) ?? {}
    return { id: requireId(e, 'id', 'Google Calendar event'), label: truthyString(e.summary) ?? '(no title)' }
  })
}

async function listGranolaNotes(connectionId: string, limit = 30): Promise<Target[]> {
  const data = await proxyGet(connectionId, connectorIntegrationId('granola'), 'v1/notes', {
    page_size: Math.min(limit, 30),
  })
  return asArray(data.notes).map((item) => {
    const n = asRecord(item) ?? {}
    const id = requireId(n, 'id', 'Granola note')
    return { id, label: truthyString(n.title) ?? id }
  })
}

async function listFathomMeetings(connectionId: string, limit = 50): Promise<Target[]> {
  const data = await proxyGet(connectionId, connectorIntegrationId('fathom'), 'external/v1/meetings')
  return asArray(data.items)
    .slice(0, limit)
    .map((item) => {
      const m = asRecord(item) ?? {}
      return {
        id: requireId(m, 'recording_id', 'Fathom meeting'),
        label: truthyString(m.title) ?? truthyString(m.meeting_title) ?? '(untitled meeting)',
      }
    })
}

async function listIntercomConversations(connectionId: string, limit = 50): Promise<Target[]> {
  const data = await proxyGet(connectionId, connectorIntegrationId('intercom'), 'conversations', {
    per_page: Math.min(limit, 150),
  })
  return asArray(data.conversations).map((item) => {
    const c = asRecord(item) ?? {}
    const source = asRecord(c.source) ?? {}
    const subject = (truthyString(source.subject) ?? '').trim()
    return {
      id: requireId(c, 'id', 'Intercom conversation'),
      label: subject || `Conversation ${pyStr(c.id)}`,
    }
  })
}

function notionPageTitle(page: JsonRecord): string {
  const properties = asRecord(page.properties) ?? {}
  const titleProperty = asRecord(properties.title) ?? {}
  const titleItems = asArray(titleProperty.title)
  if (titleItems.length > 0) {
    const plainText = truthyString(asRecord(titleItems[0])?.plain_text)
    if (plainText) return plainText
  }
  return 'Untitled'
}

async function listNotionPages(connectionId: string, limit = 50): Promise<Target[]> {
  const data = await proxyPost(connectionId, connectorIntegrationId('notion'), 'v1/search', {
    page_size: Math.min(limit, 100),
    filter: { property: 'object', value: 'page' },
  })
  const targets: Target[] = []
  for (const item of asArray(data.results)) {
    const p = asRecord(item)
    if (!p || !p.id) continue
    targets.push({ id: pyStr(p.id), label: notionPageTitle(p) })
  }
  return targets
}

/** Per-provider dispatch, mirroring `get_targets` in `endpoints/ai_connectors.py`. */
export const TARGET_LISTERS: Record<string, (connectionId: string) => Promise<Target[]>> = {
  slack: (id) => listSlackChannels(id),
  outlook: (id) => listOutlookFolders(id),
  zoom: (id) => listZoomRecordings(id),
  'google-calendar': (id) => listGoogleCalendarEvents(id),
  granola: (id) => listGranolaNotes(id),
  fathom: (id) => listFathomMeetings(id),
  intercom: (id) => listIntercomConversations(id),
  notion: (id) => listNotionPages(id),
}
