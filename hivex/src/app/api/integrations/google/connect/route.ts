import { requireContext } from '@/lib/server/integrations/context'
import { HttpError, handle, readJson } from '@/lib/server/integrations/http'
import { buildConnectUrl } from '@/lib/server/integrations/google/service'

/**
 * POST /api/integrations/google/connect { client_id, tools?, return_to? }
 * Returns the Google consent URL. The browser navigates there; Google returns to
 * /api/integrations/google/callback, which redirects back into HiveX.
 */
export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const body = await readJson<{ client_id?: string; tools?: string[]; return_to?: string }>(request)
    if (!body.client_id) throw new HttpError(400, 'client_id is required.')
    const url = await buildConnectUrl(ctx, { clientId: body.client_id, tools: body.tools, returnTo: body.return_to })
    return { url }
  })
}
