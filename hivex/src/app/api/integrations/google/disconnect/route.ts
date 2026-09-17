import { requireContext } from '@/lib/server/integrations/context'
import { HttpError, handle, readJson } from '@/lib/server/integrations/http'
import { disconnectGoogle } from '@/lib/server/integrations/google/service'

/** POST /api/integrations/google/disconnect { client_id, tools? } */
export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const body = await readJson<{ client_id?: string; tools?: string[] }>(request)
    if (!body.client_id) throw new HttpError(400, 'client_id is required.')
    return disconnectGoogle(ctx, { clientId: body.client_id, tools: body.tools })
  })
}
