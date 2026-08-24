'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Blocks, FolderPlus, Users } from 'lucide-react'

import { AssistantLauncher } from '@/components/assistant/assistant-launcher'
import { OSTile } from '@/components/common/os-tile'
import { ActivityFeed } from '@/components/home/activity-feed'
import { IntegrationIcon } from '@/components/integrations/integration-icon'
import { StatusPill } from '@/components/integrations/status-pill'
import { WorkspaceGrid } from '@/components/os/workspace-grid'
import { WorkspaceSourceStatus } from '@/components/os/workspace-source-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/ui/data'
import { PageBody, PageHeader, PageTransition, SectionHeading } from '@/components/ui/page'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { getIntegration } from '@/platform/config/integrations'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId } from '@/platform/types'

/**
 * OS overview.
 *
 * Generic by construction: the header, stats, workspace grid and data-source
 * panel are all driven by the registry entry, so every product gets the same
 * quality of landing page without a bespoke implementation.
 */
export default function OSOverviewPage() {
  const params = useParams<{ osId: OSId }>()
  const os = OS_REGISTRY[params.osId]
  const access = useAccess()
  const { serviceStatus } = usePlatform()

  const workspaces = access.workspacesIn(os.id)
  const dataSources = [...os.requiredIntegrations, ...os.optionalIntegrations]
  const connectedSources = dataSources.filter(
    (id) => serviceStatus(id, os.id) === 'connected',
  ).length
  const members = workspaces.reduce((acc, w) => acc + w.memberCount, 0)
  const avgHealth = workspaces.length
    ? Math.round(workspaces.reduce((acc, w) => acc + w.healthScore, 0) / workspaces.length)
    : 0

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow={
            <span className="flex items-center gap-2">
              Product
              <Badge tone={os.status === 'live' ? 'success' : 'info'} dot>
                {os.status === 'live' ? 'Live' : 'Beta'}
              </Badge>
            </span>
          }
          title={
            <span className="flex items-center gap-3">
              <OSTile os={os} size="lg" />
              {os.name}
            </span>
          }
          description={os.description}
          actions={
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/os/${os.id}/integrations`}>
                  <Blocks className="size-4" />
                  Integrations
                </Link>
              </Button>
              {access.can('workspace:create') ? (
                <Button asChild variant="primary" size="sm">
                  <Link href={`/app/os/${os.id}/workspaces`}>
                    <FolderPlus className="size-4" />
                    New {os.workspaceNoun.singular.toLowerCase()}
                  </Link>
                </Button>
              ) : null}
            </>
          }
        />

        <WorkspaceSourceStatus osId={os.id} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={os.workspaceNoun.plural}
            value={workspaces.length}
            hint={`${os.workspaceNoun.plural} you can access`}
          />
          <StatCard label="People" value={members} icon={Users} hint="Across all workspaces" />
          <StatCard
            label="Connected sources"
            value={`${connectedSources}/${dataSources.length}`}
            icon={Blocks}
            hint="Feeding this product"
          />
          <StatCard
            label="Average health"
            value={avgHealth || '—'}
            hint="Weighted across workspaces"
          />
        </div>

        <AssistantLauncher title={`Ask Tru about ${os.shortName}`} />

        {os.supportsWorkspaces ? (
          <section className="space-y-3">
            <SectionHeading
              title={os.workspaceNoun.plural}
              description={`Every ${os.workspaceNoun.singular.toLowerCase()} keeps its own data, members and settings.`}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/app/os/${os.id}/workspaces`}>View all</Link>
                </Button>
              }
            />
            <WorkspaceGrid os={os} limit={6} />
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed osId={os.id} limit={5} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dataSources.slice(0, 6).map((id) => {
                const integration = getIntegration(id)
                if (!integration) return null
                const required = os.requiredIntegrations.includes(id)
                return (
                  <div key={id} className="flex items-center gap-2.5">
                    <IntegrationIcon integration={integration} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{integration.name}</span>
                      {required ? (
                        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                          Required
                        </span>
                      ) : null}
                    </span>
                    <StatusPill status={serviceStatus(id, os.id)} />
                  </div>
                )
              })}
              <Button asChild variant="outline" size="sm" className="mt-1 w-full">
                <Link href={`/app/os/${os.id}/integrations`}>Manage integrations</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </PageTransition>
  )
}
