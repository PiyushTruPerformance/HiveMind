import { requireContext } from '@/lib/server/integrations/context'
import { googleAccounts } from '@/lib/server/integrations/google/service'
import { handle } from '@/lib/server/integrations/http'

/**
 * GET /api/integrations/google/accounts — every Google account connected for the
 * caller's company, with the resources each one exposes and the clients using it.
 */
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return handle(async () => googleAccounts(await requireContext(request)))
}
