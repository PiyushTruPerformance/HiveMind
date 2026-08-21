'use client'

import Link from 'next/link'
import { Clock } from 'lucide-react'
import { useMemo } from 'react'

import { OSTile } from '@/components/common/os-tile'
import { Avatar } from '@/components/ui/misc'
import { Delta, EmptyState } from '@/components/ui/data'
import { useAccess } from '@/lib/access/useAccess'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { usePlatform } from '@/lib/state/platform-provider'
import { formatRelative } from '@/lib/utils/format'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId, Workspace } from '@/platform/types'

/**
 * Recently opened workspaces, across every product.
 *
 * Falls back to the most recently updated workspaces the viewer can access, so
 * a first-time user still gets a useful row rather than an empty state.
 */
export function RecentWorkspaces({ limit = 4 }: { limit?: number }) {
  const { recents } = usePlatform()
  const access = useAccess()

  const items = useMemo(() => {
    const fromHistory = recents
      .filter((r) => r.workspaceId)
      .map((r) => {
        const workspace = access.workspacesIn(r.osId).find((w) => w.id === r.workspaceId)
        return workspace ? { osId: r.osId, workspace, at: r.at } : null
      })
      .filter((x): x is { osId: OSId; workspace: Workspace; at: string } => Boolean(x))

    if (fromHistory.length >= limit) return fromHistory.slice(0, limit)

    const seen = new Set(fromHistory.map((x) => x.workspace.id))
    const fallback = access.accessibleOS
      .flatMap((osId) =>
        access.workspacesIn(osId).map((workspace) => ({ osId, workspace, at: workspace.updatedAt })),
      )
      .filter((x) => !seen.has(x.workspace.id))
      .sort((a, b) => b.at.localeCompare(a.at))

    return [...fromHistory, ...fallback].slice(0, limit)
  }, [recents, access, limit])

  if (items.length === 0) {
    return (
      <EmptyState
        compact
        icon={Clock}
        title="No workspaces yet"
        description="Open a product to create your first workspace."
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ osId, workspace, at }) => {
        const os = OS_REGISTRY[osId]
        const primary = workspace.stats[0]
        return (
          <Link
            key={`${osId}-${workspace.id}`}
            href={`/app/os/${osId}/w/${workspace.id}`}
            className="group flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-border-strong hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <Avatar name={workspace.name} hue={workspace.accent} size="md" square />
              <OSTile os={os} size="sm" />
            </div>
            <p className="mt-3 truncate text-[13px] font-medium">{workspace.name}</p>
            <p className="mt-0.5 truncate text-2xs text-muted-foreground">
              {os.shortName} · {os.workspaceNoun.singular}
            </p>

            {primary ? (
              <div className="mt-3 flex items-baseline gap-2 border-t pt-3">
                <span className="font-display text-base font-semibold tabular-nums">
                  {primary.value}
                </span>
                {typeof primary.delta === 'number' ? <Delta value={primary.delta} /> : null}
              </div>
            ) : null}
            {primary ? (
              <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                {primary.label}
              </p>
            ) : null}

            <p className="mt-2 text-[10px] text-muted-foreground/80">
              {formatRelative(at, DEMO_NOW_MS)}
            </p>
          </Link>
        )
      })}
    </div>
  )
}
