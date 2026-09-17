import { requireContext, visibleClients } from '@/lib/server/integrations/context'
import { handle } from '@/lib/server/integrations/http'

/** GET /api/integrations/clients — the caller's clients (company + permissions). */
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return handle(async () => {
    const clients = await visibleClients(await requireContext(request))
    return clients.map((c) => ({
      id: c.id,
      name: c.name,
      key: c.key,
      initials: c.initials ?? null,
      created_at: c.created_at ?? null,
    }))
  })
}
