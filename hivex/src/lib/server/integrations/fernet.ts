import 'server-only'

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { serverEnv } from './env'
import { HttpError } from './http'

/**
 * Fernet (https://github.com/fernet/spec) — byte-compatible with Python's
 * `cryptography.fernet.Fernet`, which the Tru Reporting backend uses to encrypt
 * `oauth_tokens.access_token_encrypted` / `refresh_token_encrypted`.
 *
 * Same ENCRYPTION_KEY ⇒ HiveX reads tokens Reporting wrote and vice versa.
 *
 *   token = base64url( 0x80 | timestamp(8, BE) | iv(16) | AES-128-CBC ciphertext | HMAC-SHA256(32) )
 *   key   = base64url(32 bytes) = signing key (16) | encryption key (16)
 */

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function keys(): { signing: Buffer; encryption: Buffer } {
  const raw = decodeBase64Url(serverEnv.encryptionKey())
  if (raw.length !== 32) {
    throw new HttpError(503, 'ENCRYPTION_KEY must be a 32-byte url-safe base64 Fernet key.')
  }
  return { signing: raw.subarray(0, 16), encryption: raw.subarray(16) }
}

export function fernetEncrypt(plaintext: string): string {
  if (!plaintext) return ''
  const { signing, encryption } = keys()
  const iv = randomBytes(16)
  const timestamp = Buffer.alloc(8)
  timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)))

  const cipher = createCipheriv('aes-128-cbc', encryption, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const body = Buffer.concat([Buffer.from([0x80]), timestamp, iv, ciphertext])
  const hmac = createHmac('sha256', signing).update(body).digest()

  // Python emits url-safe base64 *with* padding.
  return Buffer.concat([body, hmac]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
}

export function fernetDecrypt(token: string): string {
  if (!token) return ''
  const { signing, encryption } = keys()
  const data = decodeBase64Url(token)
  if (data.length < 1 + 8 + 16 + 16 + 32 || data[0] !== 0x80) {
    throw new HttpError(500, 'Stored token is not a valid Fernet token.')
  }
  const body = data.subarray(0, data.length - 32)
  const mac = data.subarray(data.length - 32)
  const expected = createHmac('sha256', signing).update(body).digest()
  if (!timingSafeEqual(mac, expected)) {
    throw new HttpError(500, 'Stored token could not be verified — ENCRYPTION_KEY does not match the one used to store it.')
  }
  const iv = body.subarray(9, 25)
  const ciphertext = body.subarray(25)
  const decipher = createDecipheriv('aes-128-cbc', encryption, iv)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
