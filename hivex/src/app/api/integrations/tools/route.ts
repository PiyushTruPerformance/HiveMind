import { requireContext, requireToolWorkspace } from '@/lib/server/integrations/context'
import { handle } from '@/lib/server/integrations/http'
import { SUPPORTED_NANGO_PROVIDERS, connectedProviders } from '@/lib/server/integrations/nango'

/** GET /api/integrations/tools — the caller's own connected tools (user-scoped). */
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const workspace = await requireToolWorkspace(ctx)
    return {
      supported: SUPPORTED_NANGO_PROVIDERS,
      connected_providers: await connectedProviders({ workspaceId: workspace.id, userProfileId: ctx.profile.id }),
    }
  })
}
