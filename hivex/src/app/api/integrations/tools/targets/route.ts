import { requireContext, requireToolWorkspace } from '@/lib/server/integrations/context'
import { HttpError, handle, readJson } from '@/lib/server/integrations/http'
import { SUPPORTED_NANGO_PROVIDERS, listTargets } from '@/lib/server/integrations/nango'

/** GET /api/integrations/tools/targets?provider= — live targets (channels, folders, …) from the caller's connection. */
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const provider = new URL(request.url).searchParams.get('provider')
    if (!provider || !(SUPPORTED_NANGO_PROVIDERS as readonly string[]).includes(provider)) {
      throw new HttpError(400, `Unsupported provider: ${provider ?? ''}`)
    }
    const workspace = await requireToolWorkspace(ctx)
    return { targets: await listTargets({ provider, workspaceId: workspace.id, userProfileId: ctx.profile.id }) }
  })
}
