import { requireContext, requireToolWorkspace } from '@/lib/server/integrations/context'
import { HttpError, handle, readJson } from '@/lib/server/integrations/http'
import { SUPPORTED_NANGO_PROVIDERS, disconnect } from '@/lib/server/integrations/nango'

/** POST /api/integrations/tools/disconnect { provider } — remove the caller's own connection. */
export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const provider = (await readJson<{ provider?: string }>(request)).provider
    if (!provider || !(SUPPORTED_NANGO_PROVIDERS as readonly string[]).includes(provider)) {
      throw new HttpError(400, `Unsupported provider: ${provider ?? ''}`)
    }
    const workspace = await requireToolWorkspace(ctx)
    return disconnect({ provider, workspaceId: workspace.id, userProfileId: ctx.profile.id })
  })
}
