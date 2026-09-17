import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { serverEnv } from '../env'
import { HttpError } from '../http'

/**
 * Signed OAuth `state`.
 *
 * The Reporting backend passes plain base64 JSON, so anyone can forge a state
 * that attaches their Google account to another workspace. HiveX signs it
 * (HMAC-SHA256, key derived from ENCRYPTION_KEY) and binds it to the user who
 * started the flow, the client, a nonce and a 15-minute expiry. The callback
 * rejects anything else.
 */

export interface OAuthStatePayload {
  /** user_profiles.id that started the flow */
  profileId: string
  clientId: string
  tools: string[]
  /** In-app path to return to */
  returnTo: string
  nonce: string
  exp: number
}

const TTL_MS = 15 * 60_000

function signingKey(): Buffer {
  return createHash('sha256').update(`hivex:oauth-state:${serverEnv.encryptionKey()}`).digest()
}

const b64 = (buf: Buffer) => buf.toString('base64url')

export function signState(payload: Omit<OAuthStatePayload, 'nonce' | 'exp'>): string {
  const full: OAuthStatePayload = { ...payload, nonce: b64(randomBytes(12)), exp: Date.now() + TTL_MS }
  const body = b64(Buffer.from(JSON.stringify(full)))
  const mac = b64(createHmac('sha256', signingKey()).update(body).digest())
  return `${body}.${mac}`
}

export function verifyState(state: string): OAuthStatePayload {
  const [body, mac] = state.split('.')
  if (!body || !mac) throw new HttpError(400, 'Invalid OAuth state.')
  const expected = createHmac('sha256', signingKey()).update(body).digest()
  const actual = Buffer.from(mac, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new HttpError(400, 'OAuth state signature is invalid.')
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    throw new HttpError(400, 'The Google sign-in took too long. Start again.')
  }
  return payload
}
