'use client'

import { Database, Wrench } from 'lucide-react'
import { useState } from 'react'

import { EmptyState } from '@/components/ui/data'
import { Skeleton } from '@/components/ui/misc'
import { SectionHeading } from '@/components/ui/page'
import { usePlatform } from '@/lib/state/platform-provider'
import { DATA_CONNECTORS, TOOL_CONNECTORS } from '@/platform/config/integrations'
import type { IntegrationDefinition, OSId } from '@/platform/types'

import { ConnectAccountDialog } from './connect-account-dialog'
import { IntegrationCard } from './integration-card'

/**
 * The two kinds of connection, kept apart because they answer different
 * questions:
 *
 *   Data connectors  what the platform *reads* — the Google pipeline behind
 *                    each client's reports.
 *   Tool connectors  what Ask Tru can *do* — the tools it acts in on your behalf.
 *
 * Both grids render the same card component from the catalog, so a provider is
 * described once (platform/config/integrations.ts) and appears here by its
 * connector kind. Status, accounts and actions come from the integrations API
 * through the platform provider; nothing here invents a connected state.
 */
export function ConnectorSections({ focusId }: { focusId?: string }) {
  const [connecting, setConnecting] = useState<{ provider: string; osId: OSId } | null>(null)

  return (
    <div className="space-y-8">
      <ConnectorGroup
        icon={Database}
        title="Data connectors"
        description="Bring client data into the platform. Each client authorizes Google once; the properties, sites and ad accounts it exposes are then assigned to that client and synced into reports."
        integrations={DATA_CONNECTORS}
        focusId={focusId}
        onConnect={(provider, osId) => setConnecting({ provider, osId })}
      />

      <ConnectorGroup
        icon={Wrench}
        title="Tool connectors"
        description="Give Ask Tru access to the tools you work in, so it can read context and act — send a message, draft a mail, pull a meeting. Each connection is your own, not shared with the rest of the organization."
        integrations={TOOL_CONNECTORS}
        focusId={focusId}
        onConnect={(provider, osId) => setConnecting({ provider, osId })}
      />

      <ConnectAccountDialog
        provider={connecting?.provider ?? null}
        osId={connecting?.osId ?? 'reporting'}
        open={Boolean(connecting)}
        onOpenChange={(open) => {
          if (!open) setConnecting(null)
        }}
      />
    </div>
  )
}

function ConnectorGroup({
  icon: Icon,
  title,
  description,
  integrations,
  focusId,
  onConnect,
}: {
  icon: typeof Database
  title: string
  description: string
  integrations: IntegrationDefinition[]
  focusId?: string
  onConnect: (provider: string, osId: OSId) => void
}) {
  const { integrationsMode, integrationContext } = usePlatform()
  const loading = integrationsMode === 'live' && integrationContext.isLoading

  return (
    <section className="space-y-4">
      <SectionHeading
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Icon className="size-3.5" aria-hidden />
            </span>
            {title}
          </span>
        }
        description={description}
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {integrations.slice(0, 3).map((integration) => (
            <Skeleton key={integration.id} className="h-52 w-full" />
          ))}
        </div>
      ) : integrations.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()} available`} description="Nothing is configured for this section yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onConnect={onConnect}
              highlighted={focusId === integration.id}
            />
          ))}
        </div>
      )}
    </section>
  )
}
