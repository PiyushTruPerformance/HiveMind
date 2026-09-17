import 'server-only'

import { HttpError } from './http'

/**
 * Server-only configuration for the HiveX integrations API.
 *
 * Names match the Tru Reporting backend's settings (server/app/config.py) so
 * both apps can be configured from the same values — they share one database,
 * and ENCRYPTION_KEY in particular MUST be identical or neither app can read
 * the other's stored OAuth tokens.
 */

function read(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export function requireEnv(name: string): string {
  const value = read(name)
  if (!value) throw new HttpError(503, `${name} is not configured on the server.`)
  return value
}

export const serverEnv = {
  supabaseUrl: () => read('SUPABASE_URL') ?? read('NEXT_PUBLIC_SUPABASE_URL') ?? requireEnv('SUPABASE_URL'),
  supabaseServiceKey: () => requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  clerkSecretKey: () => requireEnv('CLERK_SECRET_KEY'),
  encryptionKey: () => requireEnv('ENCRYPTION_KEY'),
  googleClientId: () => requireEnv('GOOGLE_CLIENT_ID'),
  googleClientSecret: () => requireEnv('GOOGLE_CLIENT_SECRET'),
  googleAdsDeveloperToken: () => read('GOOGLE_ADS_DEVELOPER_TOKEN'),
  googleAdsLoginCustomerId: () => read('GOOGLE_ADS_LOGIN_CUSTOMER_ID')?.replace(/-/g, ''),
  /**
   * Public origin of this HiveX deployment, used to build the Google OAuth
   * redirect URI (`{APP_URL}/api/integrations/google/callback`), which must be
   * registered on the Google OAuth client.
   */
  appUrl: () => requireEnv('APP_URL').replace(/\/+$/, ''),
  nangoSecretKey: () => requireEnv('NANGO_SECRET_KEY'),
  nangoBaseUrl: () => (read('NANGO_BASE_URL') ?? 'https://api.nango.dev').replace(/\/+$/, ''),
  nangoConnectBaseUrl: () => (read('NANGO_CONNECT_BASE_URL') ?? 'https://connect.nango.dev').replace(/\/+$/, ''),
  /** Nango integration id per provider (defaults match the provider key). */
  nangoIntegrationId: (provider: string) =>
    read(`NANGO_${provider.toUpperCase().replace(/-/g, '_')}_INTEGRATION_ID`) ?? provider,
}
