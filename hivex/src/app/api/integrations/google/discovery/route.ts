import { requireContext } from '@/lib/server/integrations/context'
import { HttpError, handle, readJson } from '@/lib/server/integrations/http'
import { discoveryForClient, rediscover } from '@/lib/server/integrations/google/service'

/**
 * GET  /api/integrations/google/discovery?client_id= — resources found on the client's Google connection.
 * POST /api/integrations/google/discovery { client_id } — re-run discovery against Google.
 */
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return handle(async () => {
    const clientId = new URL(request.url).searchParams.get('client_id')
    if (!clientId) throw new HttpError(400, 'client_id is required.')
    return discoveryForClient(await requireContext(request), clientId)
  })
}

export function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const { client_id: clientId } = await readJson<{ client_id?: string }>(request)
    if (!clientId) throw new HttpError(400, 'client_id is required.')
    return rediscover(ctx, clientId)
  })
}
