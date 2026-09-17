import 'server-only'

import { serverEnv } from '@/lib/server/integrations/env'
import { HttpError } from '@/lib/server/integrations/http'

/**
 * Thin fetch wrapper around Nango's REST API — port of the Reporting backend's
 * `ai_connectors/nango_client.py` plus the raw calls in `endpoints/nango.py`.
 */

export type JsonRecord = Record<string, unknown>

/** Provider-side failure; `listTargets` maps it to a 502 (Python's RuntimeError). */
export class ProviderError extends Error {}

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Python `str(value)` for the id/label values we compare and display. */
export function pyStr(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  return String(value)
}

export function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${serverEnv.nangoSecretKey()}` }
}

/**
 * Integration id as resolved by `endpoints/nango.py` (connect/finalize/disconnect):
 * only slack/outlook/zoom read settings, every other provider is used verbatim.
 */
export function endpointIntegrationId(provider: string): string {
  if (provider === 'slack' || provider === 'outlook' || provider === 'zoom') {
    return serverEnv.nangoIntegrationId(provider)
  }
  return provider
}

/** Integration id as resolved by `nango_client.provider_integration_id` (connector proxy calls). */
export function connectorIntegrationId(provider: string): string {
  return serverEnv.nangoIntegrationId(provider)
}

export async function nangoFetch(path: string, init: RequestInit, context: string): Promise<Response> {
  try {
    return await fetch(`${serverEnv.nangoBaseUrl()}${path}`, { ...init, cache: 'no-store' })
  } catch (error) {
    throw new HttpError(502, `${context}: could not reach Nango (${error instanceof Error ? error.message : String(error)})`)
  }
}

export async function readBody(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

function parseJson(text: string, context: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderError(`${context} returned invalid JSON`)
  }
}

function toQuery(params?: Record<string, string | number>): string {
  if (!params) return ''
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) query.set(key, String(value))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

function proxyHeaders(connectionId: string, providerConfigKey: string): Record<string, string> {
  return {
    ...authHeaders(),
    'Connection-Id': connectionId,
    'Provider-Config-Key': providerConfigKey,
  }
}

async function proxyRequest(method: 'GET' | 'POST', path: string, init: RequestInit, query: string): Promise<JsonRecord> {
  const cleanPath = path.replace(/^\/+/, '')
  let response: Response
  try {
    response = await fetch(`${serverEnv.nangoBaseUrl()}/proxy/${cleanPath}${query}`, { ...init, method, cache: 'no-store' })
  } catch (error) {
    throw new ProviderError(`Nango proxy ${method} ${path} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  const text = await readBody(response)
  if (response.status >= 400) {
    throw new ProviderError(`Nango proxy ${method} ${path} failed: ${response.status} ${text}`)
  }
  if (!text) return {}
  return asRecord(parseJson(text, `Nango proxy ${method} ${path}`)) ?? {}
}

/** GET through Nango's proxy with the connection's credentials. */
export function proxyGet(
  connectionId: string,
  providerConfigKey: string,
  path: string,
  params?: Record<string, string | number>,
): Promise<JsonRecord> {
  return proxyRequest('GET', path, { headers: proxyHeaders(connectionId, providerConfigKey) }, toQuery(params))
}

/** POST a JSON body through Nango's proxy with the connection's credentials. */
export function proxyPost(
  connectionId: string,
  providerConfigKey: string,
  path: string,
  jsonBody?: JsonRecord,
): Promise<JsonRecord> {
  return proxyRequest(
    'POST',
    path,
    {
      headers: { ...proxyHeaders(connectionId, providerConfigKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonBody ?? {}),
    },
    '',
  )
}
