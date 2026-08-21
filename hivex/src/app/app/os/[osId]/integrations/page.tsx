'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Blocks, Settings2 } from 'lucide-react'

import { OSTile } from '@/components/common/os-tile'
import { IntegrationBrowser } from '@/components/integrations/integration-browser'
import {
  OSIntegrationChecklist,
  useOSIntegrationProgress,
} from '@/components/integrations/os-integration-checklist'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageBody, PageHeader, PageTransition, SectionHeading } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId } from '@/platform/types'

/**
 * A product's own Integrations page — permanent, not just a setup step.
 *
 * Two views of the same shared integration system:
 *   "This product" — the required/optional list from the OS registry, using the
 *                    same checklist the setup step runs on.
 *   "All"          — the full organization catalog, because a connection is
 *                    organization-wide and connecting Slack here should be the
 *                    same act as connecting it anywhere else.
 */
export default function OSIntegrationsPage() {
  const params = useParams<{ osId: OSId }>()
  const os = OS_REGISTRY[params.osId]
  const progress = useOSIntegrationProgress(os.id)

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
          description={`Connections are organization-wide — connect once and every product that uses the source picks it up. ${os.shortName} reads the ones below.`}
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

        <Tabs defaultValue="product">
          <TabsList>
            <TabsTrigger value="product">
              <Blocks className="size-3.5" />
              Used by {os.shortName}
            </TabsTrigger>
            <TabsTrigger value="all">All integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="product" className="mt-4">
            <OSIntegrationChecklist osId={os.id} variant="manage" />
          </TabsContent>

          <TabsContent value="all" className="mt-4 space-y-3">
            <SectionHeading
              title="Organization catalog"
              description="Everything the platform can connect to, across every product."
            />
            <IntegrationBrowser compact />
          </TabsContent>
        </Tabs>
      </PageBody>
    </PageTransition>
  )
}
