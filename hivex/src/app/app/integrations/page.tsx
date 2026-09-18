'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { ConnectorSections } from '@/components/integrations/connector-sections'
import { GoogleAccountsSection } from '@/components/integrations/google-accounts-section'
import { IntegrationBrowser } from '@/components/integrations/integration-browser'
import { Skeleton } from '@/components/ui/misc'
import { PageBody, PageHeader, PageTransition, SectionHeading } from '@/components/ui/page'
import { CATALOG_ONLY } from '@/platform/config/integrations'

/**
 * Organization-wide integrations.
 *
 * Google accounts come first: they are the identities everything Google-shaped
 * hangs off, and one login can feed many clients. Then the two connector kinds,
 * separately: data connectors feed the products, tool
 * connectors let Ask Tru act. Below them the rest of the catalog stays
 * browsable — those providers have no backend connector yet, so they are listed
 * rather than presented as working connections.
 */
export default function IntegrationsPage() {
  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow="Platform"
          title="Integrations"
          description="Connect the systems your organization already runs on. A connection made here is available to every product that uses it, and to Ask Tru within your permissions."
        />
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <Connectors />
        </Suspense>
      </PageBody>
    </PageTransition>
  )
}

function Connectors() {
  const params = useSearchParams()
  const focusId = params.get('focus') ?? undefined

  return (
    <div className="space-y-10">
      <GoogleAccountsSection />

      <ConnectorSections focusId={focusId} />

      <section className="space-y-4">
        <SectionHeading
          title="Rest of the catalog"
          description="Providers on the roadmap. They are not connectable yet — the platform has no connector for them."
        />
        <IntegrationBrowser focusId={focusId} catalog={CATALOG_ONLY} compact />
      </section>
    </div>
  )
}
