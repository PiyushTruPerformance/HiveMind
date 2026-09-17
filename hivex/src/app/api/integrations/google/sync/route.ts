import { requireClient, requireContext } from '@/lib/server/integrations/context'
import { HttpError, handle, readJson } from '@/lib/server/integrations/http'
import { hasPermission } from '@/lib/server/integrations/permissions'
import { syncClient } from '@/lib/server/integrations/sync'

/**
 * POST /api/integrations/google/sync { client_id } — run the GA4 / Search Console /
 * Google Ads sync and period rollups for one client (port of
 * POST /connectors/sync/{client_id}). Gated like Reporting: `feature.sync` at
 * write level, on a client in the caller's company.
 */
export const dynamic = 'force-dynamic'
/* A full sync makes many Google calls; allow it time where the host permits. */
export const maxDuration = 300

export function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const { client_id: clientId } = await readJson<{ client_id?: string }>(request)
    if (!clientId) throw new HttpError(400, 'client_id is required.')
    if (!hasPermission(ctx.profile, 'feature.sync', { clientId, minLevel: 'write' })) {
      throw new HttpError(403, "You don't have permission to trigger a data sync for this client")
    }
    await requireClient(ctx, clientId)
    return syncClient(clientId, { days: 90 })
  })
}
