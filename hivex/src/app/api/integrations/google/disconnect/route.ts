import { requireContext } from '@/lib/server/integrations/context'
import { HttpError, handle, readJson } from '@/lib/server/integrations/http'
import { disconnectAccount, disconnectGoogle } from '@/lib/server/integrations/google/service'

/** POST /api/integrations/google/disconnect { account_id } or { client_id, tools? } */
export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const body = await readJson<{ account_id?: string; client_id?: string; tools?: string[] }>(request)
    if (body.account_id) return disconnectAccount(ctx, body.account_id)
    if (!body.client_id) throw new HttpError(400, 'account_id or client_id is required.')
    return disconnectGoogle(ctx, { clientId: body.client_id, tools: body.tools })
  })
}
