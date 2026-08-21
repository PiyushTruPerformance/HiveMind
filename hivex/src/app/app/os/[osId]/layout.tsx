'use client'

import { notFound, useParams, usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'

import { OSGuard } from '@/components/shell/os-guard'
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

  return <OSGuard osId={osId}>{children}</OSGuard>
}
