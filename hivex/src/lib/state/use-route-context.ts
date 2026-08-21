'use client'

import { usePathname } from 'next/navigation'
import { useMemo } from 'react'

import { OS_REGISTRY, isOSId } from '@/platform/config/os-registry'
import type { OSId, OSProduct, Workspace } from '@/platform/types'

import { usePlatform } from './platform-provider'

export interface RouteContext {
  /** '/app/os/reporting/w/ws_northwind/dashboard' */
  pathname: string
  osId?: OSId
  os?: OSProduct
  workspaceId?: string
  workspace?: Workspace
  /** Segment after the workspace id, or after the OS id at OS level. */
  sectionId: string
  scope: 'platform' | 'os' | 'workspace'
}

/**
 * Parses the current URL into the platform hierarchy.
 *
 * Route grammar:
 *   /app                                          platform
 *   /app/os/{osId}[/{section}]                    OS
 *   /app/os/{osId}/w/{workspaceId}[/{section}]    workspace
 *
 * The `/w/` marker keeps workspace ids from colliding with OS-level section
 * names, which is what lets both levels grow independently.
 */
export function useRouteContext(): RouteContext {
  const pathname = usePathname() ?? '/'
  /* Workspaces come from platform state, not fixtures: HR OS loads its
     workspaces from services/hr-os, so a static lookup would miss them. */
  const { workspaces } = usePlatform()

  return useMemo(() => {
    const parts = pathname.split('/').filter(Boolean)
    const osIndex = parts.indexOf('os')
    const rawOs = osIndex >= 0 ? parts[osIndex + 1] : undefined

    if (!isOSId(rawOs)) {
      return { pathname, sectionId: parts[1] ?? '', scope: 'platform' as const }
    }

    const os = OS_REGISTRY[rawOs]
    const wIndex = parts.indexOf('w', osIndex)

    if (wIndex >= 0 && parts[wIndex + 1]) {
      const workspaceId = parts[wIndex + 1]
      return {
        pathname,
        osId: os.id,
        os,
        workspaceId,
        workspace: (workspaces[os.id] ?? []).find((w) => w.id === workspaceId),
        sectionId: parts.slice(wIndex + 2).join('/'),
        scope: 'workspace' as const,
      }
    }

    return {
      pathname,
      osId: os.id,
      os,
      sectionId: parts.slice(osIndex + 2).join('/'),
      scope: 'os' as const,
    }
  }, [pathname, workspaces])
}
