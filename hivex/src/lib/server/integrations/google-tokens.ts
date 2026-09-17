import 'server-only'

import { serverEnv } from './env'
import { fernetDecrypt, fernetEncrypt } from './fernet'
import { HttpError } from './http'
import { db, must } from './supabase'

/**
 * Google OAuth token access — port of the Reporting backend's
 * `GoogleTokenService` and `TokenService`.
 *
 * Tokens live in `oauth_tokens`, one row per (integration, tools string), e.g.
 * provider = "analytics,searchconsole,google_ads,google_business". A lookup for
 * one tool takes the newest row whose provider contains it (`ilike %tool%`),
 * exactly as the Reporting backend does, so both apps resolve the same token.
 */

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type GoogleTool = 'analytics' | 'searchconsole' | 'google_ads' | 'google_business' | 'google'

interface TokenRow {
  id: string
  integration_id: string
  provider: string
  access_token_encrypted: string
  refresh_token_encrypted: string | null
  expires_at: string | null
  scopes: string[] | null
}

export async function getLatestTokenRow(integrationId: string, tool: GoogleTool = 'google'): Promise<TokenRow> {
  const rows = must(
    await db()
      .from('oauth_tokens')
      .select('*')
      .eq('integration_id', integrationId)
      .ilike('provider', `%${tool}%`)
      .order('created_at', { ascending: false })
      .limit(1),
    'Google token lookup',
  ) as TokenRow[]
  if (!rows[0]) throw new HttpError(404, 'No Google token found for this connection. Reconnect Google.')
  return rows[0]
}

export async function getGoogleTokens(integrationId: string, tool: GoogleTool) {
  const row = await getLatestTokenRow(integrationId, tool)
  return {
    accessToken: fernetDecrypt(row.access_token_encrypted),
    refreshToken: row.refresh_token_encrypted ? fernetDecrypt(row.refresh_token_encrypted) : '',
    scopes: row.scopes ?? [],
  }
}

export async function getAccessToken(integrationId: string, tool: GoogleTool = 'google'): Promise<string> {
  return (await getGoogleTokens(integrationId, tool)).accessToken
}

/** Exchanges the stored refresh token for a new access token and stores it encrypted. */
export async function refreshAccessToken(integrationId: string, tool: GoogleTool = 'google'): Promise<string> {
  const row = await getLatestTokenRow(integrationId, tool)
  if (!row.refresh_token_encrypted) {
    throw new HttpError(401, 'This Google connection has no refresh token. Reconnect Google to restore access.')
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: serverEnv.googleClientId(),
      client_secret: serverEnv.googleClientSecret(),
      refresh_token: fernetDecrypt(row.refresh_token_encrypted),
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200)
    throw new HttpError(401, `Google refused to refresh the access token — reconnect Google. ${detail}`.trim())
  }
  const data = (await response.json()) as { access_token: string; expires_in?: number }

  must(
    await db()
      .from('oauth_tokens')
      .update({ access_token_encrypted: fernetEncrypt(data.access_token) })
      .eq('id', row.id),
    'Google token refresh',
  )
  return data.access_token
}

/**
 * Runs a Google API call with the stored access token, refreshing once on 401 —
 * the retry pattern every Reporting connector uses.
 */
export async function withGoogleToken(
  integrationId: string,
  tool: GoogleTool,
  call: (accessToken: string) => Promise<Response>,
): Promise<Response> {
  let response = await call(await getAccessToken(integrationId, tool))
  if (response.status === 401) {
    response = await call(await refreshAccessToken(integrationId, tool))
  }
  return response
}
