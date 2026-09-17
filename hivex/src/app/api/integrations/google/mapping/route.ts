import { requireContext } from '@/lib/server/integrations/context'
import { HttpError, handle, readJson } from '@/lib/server/integrations/http'
import { saveMapping } from '@/lib/server/integrations/google/service'

/** POST /api/integrations/google/mapping — assign discovered resources to the client. */
export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireContext(request)
    const body = await readJson<{
      client_id?: string
      ga4_property_id?: string
      ga4_property_name?: string
      gsc_site_url?: string
      google_ads_customer_id?: string
      google_ads_customer_name?: string
    }>(request)
    if (!body.client_id) throw new HttpError(400, 'client_id is required.')
    return saveMapping(ctx, {
      clientId: body.client_id,
      ga4PropertyId: body.ga4_property_id,
      ga4PropertyName: body.ga4_property_name,
      gscSiteUrl: body.gsc_site_url,
      googleAdsCustomerId: body.google_ads_customer_id,
      googleAdsCustomerName: body.google_ads_customer_name,
    })
  })
}
