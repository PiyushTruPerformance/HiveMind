import 'server-only'

import { HttpError } from '@/lib/server/integrations/http'
import { db } from '@/lib/server/integrations/supabase'

import { truthy } from './py'
import { unwrap } from './store'

/**
 * Port of `ClientPropertiesService` — the `client_properties` row maps a
 * reporting client to its Google integration and mapped GA4/GSC/Ads resources.
 */

export interface ClientProperties {
  client_name: string | null
  integration_id: string | null
  ga4_property_id: string | null
  ga4_timezone: string | null
  gsc_property_url: string | null
  google_ads_customer_id: string | null
}

type ClientPropertiesRow = Partial<ClientProperties> & Record<string, unknown>

async function isIntegrationConnected(integrationId: string): Promise<boolean> {
  const rows = unwrap(
    await db().from('integrations').select('id').eq('id', integrationId).eq('status', 'connected'),
    'Integration status lookup',
  ) as { id: string }[]
  return rows.length > 0
}

/**
 * Fallback only: workspaces.connected_to == client_id -> the most recently
 * updated connected 'google' integration. Used when the stored integration_id
 * is missing or no longer connected.
 */
async function resolveLiveIntegrationId(clientId: string): Promise<string | null> {
  const workspaces = unwrap(
    await db().from('workspaces').select('id').eq('connected_to', clientId),
    'Workspace lookup',
  ) as { id: string }[]
  if (!workspaces.length) return null

  const integrations = unwrap(
    await db()
      .from('integrations')
      .select('id,updated_at')
      .in(
        'workspace_id',
        workspaces.map((workspace) => workspace.id),
      )
      .eq('provider', 'google')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1),
    'Live integration lookup',
  ) as { id: string }[]
  return integrations[0]?.id ?? null
}

export async function getClientProperties(clientId: string): Promise<ClientProperties> {
  const rows = unwrap(
    await db().from('client_properties').select('*').eq('client_id', clientId),
    'client_properties lookup',
  ) as ClientPropertiesRow[]

  if (!rows.length) {
    throw new HttpError(
      400,
      `No client_properties row found for client_id='${clientId}'. Add one with at least integration_id set before syncing.`,
    )
  }

  const row = rows[0]
  const stored = row.integration_id ?? null

  // The mapping UI writes integration_id on every save, so a value that still
  // points at a connected integration is the user's deliberate choice — trust it first.
  let integrationId: string | null
  if (truthy(stored) && (await isIntegrationConnected(stored as string))) {
    integrationId = stored
  } else {
    const live = await resolveLiveIntegrationId(clientId)
    integrationId = truthy(live) ? live : stored
  }

  return {
    client_name: row.client_name ?? null,
    integration_id: integrationId,
    ga4_property_id: row.ga4_property_id ?? null,
    ga4_timezone: row.ga4_timezone ?? null,
    gsc_property_url: row.gsc_property_url ?? null,
    google_ads_customer_id: row.google_ads_customer_id ?? null,
  }
}

export async function saveGa4Timezone(clientId: string, timezoneName: string): Promise<void> {
  unwrap(
    await db().from('client_properties').update({ ga4_timezone: timezoneName }).eq('client_id', clientId),
    'client_properties ga4_timezone save',
  )
}
