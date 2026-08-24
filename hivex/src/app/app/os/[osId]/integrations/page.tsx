'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Blocks, Plug, Settings2, Table2 } from 'lucide-react'

import { OSTile } from '@/components/common/os-tile'
import { ConnectedAccounts } from '@/components/integrations/connected-accounts'
import { IntegrationBrowser } from '@/components/integrations/integration-browser'
import {
  OSIntegrationChecklist,
  useOSIntegrationProgress,
} from '@/components/integrations/os-integration-checklist'
import { ResourceMappingTable } from '@/components/integrations/resource-mapping-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageBody, PageHeader, PageTransition, SectionHeading } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { usePlatform } from '@/lib/state/platform-provider'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId } from '@/platform/types'

/**
 * A product's own Integrations page — permanent, not just a setup step.
 *
 * Split along the line the data model draws:
 *
 *   Accounts   — the logins. Several per provider is normal.
 *   Resources  — what those logins expose, and which client consumes each one.
 *   Catalog    — everything the platform can connect to.
 *
 * Keeping accounts and resources on separate tabs is the whole point: an
 * account is authorized once and a resource is assigned per client, and merging
 * the two is what stopped the previous design from expressing an agency.
 */
export default function OSIntegrationsPage() {
  const params = useParams<{ osId: OSId }>()
  const os = OS_REGISTRY[params.osId]
  const progress = useOSIntegrationProgress(os.id)
  const { accountsFor, resolvedResources } = usePlatform()

  const accounts = accountsFor(os.id)
  const resources = resolvedResources(os.id)
  const unmapped = resources.filter((r) => !r.mapping && r.resource.available).length

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow={
            <span className="flex items-center gap-2">
              <OSTile os={os} size="sm" />
              {os.name}
            </span>
          }
          title="Integrations"
          description={`Accounts are connected once for your organization and shared by every product — anything you signed into elsewhere is already here. Decide which property, site or ad account feeds which client below. One login can serve every client; a client can also bring its own.`}
          actions={
            progress.required.length > 0 ? (
              <Badge tone={progress.satisfied ? 'success' : 'warning'} dot>
                {progress.connectedRequired}/{progress.required.length} required connected
              </Badge>
            ) : null
          }
        />

        {!progress.satisfied && progress.required.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-medium">
                {os.shortName} is missing a required data source
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                Screens that depend on it will be empty until it is connected.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href={`/app/os/${os.id}/setup`}>
                <Settings2 className="size-3.5" />
                Run setup
              </Link>
            </Button>
          </div>
        ) : null}

        <Tabs defaultValue="accounts">
          <TabsList>
            <TabsTrigger value="accounts">
              <Plug className="size-3.5" />
              Connected accounts
              {accounts.length > 0 ? (
                <span className="ml-1 tabular-nums text-muted-foreground">{accounts.length}</span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="mapping">
              <Table2 className="size-3.5" />
              Resources &amp; mapping
              {unmapped > 0 ? (
                <span className="ml-1 tabular-nums text-warning">{unmapped}</span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="catalog">
              <Blocks className="size-3.5" />
              Catalog
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="mt-4 space-y-8">
            <ConnectedAccounts osId={os.id} />

            <div className="space-y-3">
              <SectionHeading
                title={`What ${os.shortName} needs`}
                description="Required and optional services, and whether any account in your organization already grants them."
              />
              <OSIntegrationChecklist osId={os.id} variant="manage" />
            </div>
          </TabsContent>

          <TabsContent value="mapping" className="mt-4">
            <ResourceMappingTable osId={os.id} />
          </TabsContent>

          <TabsContent value="catalog" className="mt-4 space-y-3">
            <SectionHeading
              title="Everything connectable"
              description="The full platform catalog. Connecting from here adds the account to your organization, so every product that uses the service picks it up."
            />
            <IntegrationBrowser osId={os.id} compact />
          </TabsContent>
        </Tabs>
      </PageBody>
    </PageTransition>
  )
}
