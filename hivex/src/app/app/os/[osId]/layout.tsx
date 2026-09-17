'use client'

import { notFound, useParams, usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'

import { OSGuard } from '@/components/shell/os-guard'
// TEMPORARY REPORTING OS EMBED — remove these two imports when restoring native Reporting OS.
import { isEmbeddedReportingSection } from '@/os/reporting/embed'
import { ReportingOSIframe } from '@/os/reporting/reporting-os-iframe'
import { usePlatform } from '@/lib/state/platform-provider'
import { isPreActivationSection } from '@/platform/config/activation'
import { isOSId } from '@/platform/config/os-registry'

/**
 * OS-level layout.
 *
 * Validates the product id, then decides whether this route needs the product
 * to be active. The purchase funnel (about → pricing → checkout → setup) lives
 * *inside* the product's URL space but must stay reachable before activation —
 * otherwise the guard would redirect the very pages that exist to get past it.
 */
export default function OSLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ osId: string }>()
  const pathname = usePathname() ?? ''
  const { visit } = usePlatform()
  const osId = params?.osId

  useEffect(() => {
    if (isOSId(osId)) visit(osId)
  }, [osId, visit])

  if (!isOSId(osId)) notFound()

  const section = pathname.split('/')[4] ?? ''
  if (isPreActivationSection(section)) return <>{children}</>

  // TEMPORARY REPORTING OS EMBED
  //
  // The native HiveX Reporting OS (overview, workspaces and every workspace
  // section — see src/os/reporting/views.tsx and src/os/registry.ts) is
  // intentionally not rendered while the deployed Tru Reporting OS is embedded
  // via iframe. The product still goes through OSGuard, so activation and access
  // rules are unchanged; Ask Tru and Integrations stay native (see embed.ts).
  //
  // DO NOT DELETE OR REFACTOR THE NATIVE REPORTING OS. To restore it, delete this
  // block and the two imports above it (or unset NEXT_PUBLIC_REPORTING_OS_URL,
  // which falls back to the native pages without a code change).
  if (osId === 'reporting' && isEmbeddedReportingSection(section)) {
    // Native rendering, temporarily disabled for Reporting OS only:
    // return <OSGuard osId={osId}>{children}</OSGuard>
    return (
      <OSGuard osId={osId}>
        <ReportingOSIframe />
      </OSGuard>
    )
  }

  return <OSGuard osId={osId}>{children}</OSGuard>
}
