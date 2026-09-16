import { aiApiUrl, apiUrl } from '@/lib/api/config'

/**
 * Ask Tru API client.
 *
 * Talks to the Tru Reporting AI service (the `universal-chat` pipeline and its
 * connector actions). Ported from Reporting OS `lib/services/chatApi.ts` and
 * `lib/Api/ConfirmConnectorAction.ts`; the endpoint list and payloads are
 * unchanged so the deployed service needs no modification.
 *
 * The signed-in user's profile and workspaces come from the Tru Reporting core
 * API (`/users/me`, `/workspaces/`), which verifies the Clerk session and reads
 * `user_profiles` from Supabase — the `account_id` sent below is the verified
 * profile id, never one the browser chooses.
 */

export interface ChatSession {
  id: string
  created_at: string
  session_name?: string | null
  account_id?: string
}

export type ActionStatus = 'proposed' | 'sent' | 'failed' | 'empty'

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  /** Set on an assistant message that proposes a connector action awaiting confirmation. */
  action_id?: string | null
  /** The action's current status, looked up fresh by the service on every fetch. */
  action_status?: string | null
}

export interface CurrentProfile {
  id: string
  clerk_id: string
  company_id: string | null
  status: string | null
  role: string | null
}

/** Events pushed on the chat WebSocket. */
export type ChatSocketEvent =
  | { event: 'new_chat_message'; data: ChatMessage }
  | { event: 'session_renamed'; data: { session_id: string; session_name: string } }
  | { event: 'ping' }

export class AskTruApiError extends Error {
  status: number
  /** True when the request never reached the service. */
  offline: boolean

  constructor(status: number, message: string, offline = false) {
    super(message)
    this.name = 'AskTruApiError'
    this.status = status
    this.offline = offline
  }
}

/* The AI service is commonly exposed through ngrok; this header skips its
   browser interstitial and is ignored everywhere else. */
const SERVICE_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
}

async function readDetail(response: Response): Promise<string | undefined> {
  const text = await response.text().catch(() => '')
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text) as { detail?: unknown }
    return typeof parsed.detail === 'string' ? parsed.detail : text
  } catch {
    return text
  }
}

async function request<T>(url: string, init: RequestInit, failure: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new AskTruApiError(0, 'Ask Tru could not reach its service. Check your connection and try again.', true)
  }

  if (!response.ok) {
    const detail = await readDetail(response)
    throw new AskTruApiError(response.status, detail ? `${failure}: ${detail}` : `${failure} (${response.status})`)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AskTruApiError(response.status, `${failure}: the service returned a malformed response.`)
  }
}

function withBearer(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Maps known connector failure substrings to an actionable message. Ported
 * from Reporting OS — the raw detail is usually a wrapped Nango/Graph/Slack
 * error several layers deep.
 */
function connectorErrorMessage(detail: string): string {
  if (/ErrorInvalidRecipients|not resolved/i.test(detail)) {
    return "That recipient address isn't valid — check it and try again."
  }
  if (/channel_not_found/i.test(detail)) {
    return "That Slack channel wasn't found — it may have been renamed or deleted."
  }
  if (/isn't connected|haven't connected/i.test(detail)) {
    return "That connector isn't connected yet — connect it from Integrations."
  }
  if (/already (proposed|sent|failed|empty)/i.test(detail)) {
    return 'This action already finished — send a new message instead.'
  }
  return detail.length > 160 ? `${detail.slice(0, 160)}…` : detail
}

export const askTruApi = {
  /* ---- Identity (Tru Reporting core API) ---- */

  getCurrentProfile: (token: string) =>
    request<CurrentProfile>(
      apiUrl('/users/me'),
      { headers: withBearer(token), cache: 'no-store' },
      'Could not load your profile',
    ),

  listWorkspaces: (token: string) =>
    request<{ id: string }[]>(
      apiUrl('/workspaces/'),
      { headers: withBearer(token), cache: 'no-store' },
      'Could not load your workspaces',
    ),

  /* ---- Chat sessions ---- */

  createSession: (accountId: string, sessionName: string) =>
    request<ChatSession>(
      aiApiUrl('/universal-chat/session'),
      {
        method: 'POST',
        headers: SERVICE_HEADERS,
        body: JSON.stringify({ account_id: accountId, session_name: sessionName }),
      },
      'Could not start a conversation',
    ),

  listSessions: async (accountId: string): Promise<ChatSession[]> => {
    try {
      return await request<ChatSession[]>(
        aiApiUrl(`/universal-chat/account/${encodeURIComponent(accountId)}/sessions/`),
        { headers: SERVICE_HEADERS },
        'Could not load conversations',
      )
    } catch (error) {
      // The service answers 404 for an account with no sessions yet.
      if (error instanceof AskTruApiError && error.status === 404) return []
      throw error
    }
  },

  listMessages: (sessionId: string) =>
    request<ChatMessage[]>(
      aiApiUrl(`/universal-chat/session/${encodeURIComponent(sessionId)}/messages?t=${Date.now()}`),
      {
        headers: { ...SERVICE_HEADERS, 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
        cache: 'no-store',
      },
      'Could not load messages',
    ),

  sendMessage: (input: { sessionId: string; content: string; accountId: string; workspaceId?: string }) =>
    request<ChatMessage>(
      aiApiUrl('/universal-chat/message'),
      {
        method: 'POST',
        headers: SERVICE_HEADERS,
        body: JSON.stringify({
          session_id: input.sessionId,
          content: input.content,
          account_id: input.accountId,
          workspace_id: input.workspaceId,
        }),
      },
      'Message was not sent',
    ),

  renameSession: (sessionId: string, accountId: string, sessionName: string) =>
    request<{ success: boolean }>(
      aiApiUrl('/universal-chat/session/rename'),
      {
        method: 'PUT',
        headers: SERVICE_HEADERS,
        body: JSON.stringify({ session_id: sessionId, account_id: accountId, session_name: sessionName }),
      },
      'Could not rename the conversation',
    ),

  deleteSession: (sessionId: string) =>
    request<{ success: boolean }>(
      aiApiUrl(`/universal-chat/session/${encodeURIComponent(sessionId)}`),
      { method: 'DELETE', headers: SERVICE_HEADERS },
      'Could not delete the conversation',
    ),

  /* ---- Connector actions ---- */

  confirmAction: async (token: string | null, actionId: string, editedContent?: string) => {
    try {
      return await request<unknown>(
        aiApiUrl(`/connectors/${encodeURIComponent(actionId)}/confirm`),
        {
          method: 'POST',
          headers: { ...SERVICE_HEADERS, ...withBearer(token) },
          body: JSON.stringify({ edited_content: editedContent ?? null }),
        },
        'Action failed',
      )
    } catch (error) {
      if (error instanceof AskTruApiError && !error.offline) {
        const detail = error.message.replace(/^Action failed:\s*/, '')
        throw new AskTruApiError(error.status, connectorErrorMessage(detail))
      }
      throw error
    }
  },
}

export function askTruErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Ask Tru ran into a problem. Try again in a moment.'
}
