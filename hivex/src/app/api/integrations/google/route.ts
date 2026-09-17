import { requireContext } from '@/lib/server/integrations/context'
import { statusForClients } from '@/lib/server/integrations/google/service'
import { handle } from '@/lib/server/integrations/http'

/** GET /api/integrations/google — Google connection status for each of the caller's clients. */
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return handle(async () => statusForClients(await requireContext(request)))
}
