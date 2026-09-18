import { requireContext } from '@/lib/server/integrations/context'
import { assignResource, unassignResource } from '@/lib/server/integrations/google/service'
import { HttpError, handle, readJson } from '@/lib/server/integrations/http'

/**
 * POST   /api/integrations/google/assign { account_id, client_id, service, external_id }
 * DELETE /api/integrations/google/assign { client_id, service }
 *
 * Points a client at one resource of a Google account, or stops it using that
 * service. Any account the caller can see may serve any client they can see.
 */
export const dynamic = 'force-dynamic'

const SERVICES = ['ga4', 'gsc', 'google-ads'] as const
type Service = (typeof SERVICES)[number]

function service(value: unknown): Service {
  if (typeof value !== 'string' || !(SERVICES as readonly string[]).includes(value)) {
    throw new HttpError(400, `service must be one of: ${SERVICES.join(', ')}`)
  }
  return value as Service
}

export function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const body = await readJson<{ account_id?: string; client_id?: string; service?: string; external_id?: string }>(request)
    if (!body.account_id || !body.client_id || !body.external_id) {
      throw new HttpError(400, 'account_id, client_id, service and external_id are required.')
    }
    return assignResource(ctx, {
      accountId: body.account_id,
      clientId: body.client_id,
      service: service(body.service),
      externalId: body.external_id,
    })
  })
}

export function DELETE(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const body = await readJson<{ client_id?: string; service?: string }>(request)
    if (!body.client_id) throw new HttpError(400, 'client_id is required.')
    return unassignResource(ctx, { clientId: body.client_id, service: service(body.service) })
  })
}
