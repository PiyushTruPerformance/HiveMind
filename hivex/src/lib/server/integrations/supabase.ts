import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { serverEnv } from './env'
import { HttpError } from './http'

/**
 * Service-role Supabase client — the HiveX equivalent of the Reporting
 * backend's `get_supabase_admin()`. It bypasses RLS, exactly like that backend,
 * so every route that uses it enforces ownership itself (see ./context.ts).
 * Server-only; the key never reaches the browser.
 */

const globalForSupabase = globalThis as unknown as { hivexIntegrationsDb?: SupabaseClient }

export function db(): SupabaseClient {
  if (!globalForSupabase.hivexIntegrationsDb) {
    globalForSupabase.hivexIntegrationsDb = createClient(serverEnv.supabaseUrl(), serverEnv.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return globalForSupabase.hivexIntegrationsDb
}

/** Unwraps a Supabase result, turning a database error into a 500 with context. */
export function must<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) {
    console.error(`[integrations] ${context}:`, result.error.message)
    throw new HttpError(500, `${context} failed`)
  }
  return result.data as T
}
