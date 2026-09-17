import { handleCallback } from '@/lib/server/integrations/google/service'

/**
 * GET /api/integrations/google/callback — Google's OAuth redirect target.
 * No session header here (it is a browser redirect from Google); the signed,
 * user-bound state carries identity and is re-validated before anything is stored.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  return Response.redirect(await handleCallback(url.searchParams), 302)
}
