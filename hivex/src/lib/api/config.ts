/**
 * Backend API configuration — the one place backend base URLs are read.
 *
 * Two services, named exactly as the Tru Reporting client names them so one
 * `.env.local` serves both apps:
 *
 *   NEXT_PUBLIC_BASE_URL        Tru Reporting core API, including `/api/v1`.
 *                               Owns identity: `/users/me`, `/workspaces/`.
 *   NEXT_PUBLIC_AI_BACKEND_URL  Tru Reporting AI service, including `/api/ai/v1`.
 *                               Owns Ask Tru: `/universal-chat/*`, `/connectors/*`
 *                               and the chat WebSocket.
 *
 * Nothing in the Ask Tru flow hardcodes a host. NEXT_PUBLIC_ values are inlined
 * at build time, so a change to `.env.local` needs a dev-server restart.
 */

const trimBase = (value: string | undefined) => (value?.trim() ?? '').replace(/\/+$/, '')

export const API_BASE_URL = trimBase(process.env.NEXT_PUBLIC_BASE_URL)
export const AI_API_BASE_URL = trimBase(process.env.NEXT_PUBLIC_AI_BACKEND_URL)

export const isApiConfigured = API_BASE_URL.length > 0
export const isAiApiConfigured = AI_API_BASE_URL.length > 0

export class ApiConfigError extends Error {
  constructor(variable: string) {
    super(`${variable} is not set. Add it to .env.local and restart the dev server.`)
    this.name = 'ApiConfigError'
  }
}

function join(base: string, variable: string, path: string): string {
  if (!base) throw new ApiConfigError(variable)
  let root = base
  // A relative base ("/external-api") is served through this app's own origin.
  if (root.startsWith('/')) {
    if (typeof window === 'undefined') throw new ApiConfigError(variable)
    root = `${window.location.origin}${root}`
  }
  return `${root}${path.startsWith('/') ? path : `/${path}`}`
}

/** Core API URL (`/users/me` → `{NEXT_PUBLIC_BASE_URL}/users/me`). */
export function apiUrl(path: string): string {
  return join(API_BASE_URL, 'NEXT_PUBLIC_BASE_URL', path)
}

/** AI service URL (`/universal-chat/message` → `{NEXT_PUBLIC_AI_BACKEND_URL}/universal-chat/message`). */
export function aiApiUrl(path: string): string {
  return join(AI_API_BASE_URL, 'NEXT_PUBLIC_AI_BACKEND_URL', path)
}

/**
 * Optional direct AI service URL for the WebSocket, including `/api/ai/v1`.
 * Needed when NEXT_PUBLIC_AI_BACKEND_URL is a relative proxy path: hosting
 * rewrites (e.g. Vercel) forward HTTP only, never WebSocket upgrades.
 */
export const AI_WS_BASE_URL = trimBase(process.env.NEXT_PUBLIC_AI_WS_URL)

/** AI service WebSocket URL: http → ws, https → wss, same host and prefix. */
export function aiWsUrl(path: string): string {
  const url = AI_WS_BASE_URL
    ? join(AI_WS_BASE_URL, 'NEXT_PUBLIC_AI_WS_URL', path)
    : aiApiUrl(path)
  return url.replace(/^http(s?):\/\//i, (_match, secure: string) => `ws${secure}://`)
}
