'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { IntegrationBrowser } from '@/components/integrations/integration-browser'
import { Skeleton } from '@/components/ui/misc'
import { PageBody, PageHeader, PageTransition } from '@/components/ui/page'

/**
 * Organization-wide integrations.
 *
 * One catalog, one connection per provider, shared by every product — which is
 * the whole point of a unified platform: connect Google once, not once per OS.
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
          <FocusedBrowser />
        </Suspense>
      </PageBody>
    </PageTransition>
  )
}

function FocusedBrowser() {
  const params = useSearchParams()
  return <IntegrationBrowser focusId={params.get('focus') ?? undefined} />
}
