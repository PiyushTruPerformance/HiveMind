'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { ArrowUpRight, FolderPlus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { IntegrationIcon } from '@/components/integrations/integration-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Delta, EmptyState } from '@/components/ui/data'
import { Avatar, Tooltip } from '@/components/ui/misc'
import { Input } from '@/components/ui/field'
import { useAccess } from '@/lib/access/useAccess'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { formatRelative } from '@/lib/utils/format'
import { getIntegration } from '@/platform/config/integrations'
import { formatLimit } from '@/platform/config/plans'
import type { OSProduct, Workspace, WorkspaceHealth } from '@/platform/types'

const HEALTH_TONE: Record<WorkspaceHealth, 'success' | 'warning' | 'destructive'> = {
  healthy: 'success',
  attention: 'warning',
  at_risk: 'destructive',
}

const HEALTH_LABEL: Record<WorkspaceHealth, string> = {
  healthy: 'Healthy',
  attention: 'Needs attention',
  at_risk: 'At risk',
}

/**
 * Workspace grid — used on every OS overview and on the workspace management
 * page. The noun ("Client", "Project", "Team") comes from the OS registry, so
 * the same component reads correctly in every product.
 */
export function WorkspaceGrid({
  os,
  searchable = false,
  limit,
  onCreate,
}: {
  os: OSProduct
  searchable?: boolean
  limit?: number
  onCreate?: () => void
}) {
  const access = useAccess()
  const [query, setQuery] = useState('')

  const all = access.workspacesIn(os.id)
  const workspaceLimit = access.limitFor(os.id, 'workspacesPerOS', all.length)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? all.filter((w) => w.name.toLowerCase().includes(q)) : all
    return limit ? list.slice(0, limit) : list
  }, [all, query, limit])

  if (all.length === 0) {
    return (
      <EmptyState
        icon={FolderPlus}
        title={`No ${os.workspaceNoun.plural.toLowerCase()} yet`}
        description={`A ${os.workspaceNoun.singular.toLowerCase()} holds its own data, members and settings inside ${os.name}.`}
        action={
          onCreate && access.can('workspace:create') ? (
            <Button variant="primary" size="sm" onClick={onCreate}>
              <FolderPlus className="size-4" />
              Create a {os.workspaceNoun.singular.toLowerCase()}
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      {searchable ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${os.workspaceNoun.plural.toLowerCase()}…`}
              aria-label={`Search ${os.workspaceNoun.plural.toLowerCase()}`}
              className="pl-9"
            />
          </div>
          <p className="text-2xs text-muted-foreground">
            {all.length} of {formatLimit(workspaceLimit.limit)} used on this plan
          </p>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={Search}
          title="Nothing matches that search"
          description={`No ${os.workspaceNoun.plural.toLowerCase()} named “${query}”.`}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((workspace, index) => (
            <motion.div
              key={workspace.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.18 }}
            >
              <WorkspaceCard os={os} workspace={workspace} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkspaceCard({ os, workspace }: { os: OSProduct; workspace: Workspace }) {
  return (
    <Link
      href={`/app/os/${os.id}/w/${workspace.id}`}
      className="group flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-border-strong hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <Avatar name={workspace.name} hue={workspace.accent} size="lg" square />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-display text-[14px] font-semibold">{workspace.name}</p>
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-muted-foreground">
            {workspace.description}
          </p>
        </div>
      </div>

      {workspace.stats.length > 0 ? (
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
          {workspace.stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="mt-0.5 flex items-baseline gap-1">
                <span className="truncate font-display text-[15px] font-semibold tabular-nums">
                  {stat.value}
                </span>
              </dd>
              {typeof stat.delta === 'number' ? (
                <Delta value={stat.delta} showIcon={false} className="text-[10px]" />
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-1.5">
          <Badge tone={HEALTH_TONE[workspace.health]} dot>
            {HEALTH_LABEL[workspace.health]}
          </Badge>
          {workspace.memberCount > 0 ? (
            <span className="text-2xs text-muted-foreground">{workspace.memberCount} members</span>
          ) : null}
        </div>
        <div className="flex -space-x-1">
          {workspace.connectedIntegrations.slice(0, 4).map((id) => {
            const integration = getIntegration(id)
            if (!integration) return null
            return (
              <Tooltip key={id} content={integration.name}>
                <span className="rounded-md ring-2 ring-card">
                  <IntegrationIcon integration={integration} size="sm" className="!size-6 !text-[9px]" />
                </span>
              </Tooltip>
            )
          })}
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground/80">
        Updated {formatRelative(workspace.updatedAt, DEMO_NOW_MS)}
      </p>
    </Link>
  )
}
