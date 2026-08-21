'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Avatar } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId, Workspace } from '@/platform/types'

/**
 * Workspace switcher.
 *
 * Scoped to the OS you are in — a Reporting client and an SEO project are not
 * interchangeable, so they never share a list. Recents come from platform
 * state, the same source the home screen reads.
 */
export function WorkspaceSwitcher({ osId, current }: { osId: OSId; current?: Workspace }) {
  const router = useRouter()
  const access = useAccess()
  const { recents } = usePlatform()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const os = OS_REGISTRY[osId]
  const workspaces = access.workspacesIn(osId)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return workspaces
    return workspaces.filter((w) => w.name.toLowerCase().includes(q))
  }, [workspaces, query])

  const recentWorkspaces = useMemo(() => {
    const ids = recents.filter((r) => r.osId === osId && r.workspaceId).map((r) => r.workspaceId)
    return ids
      .map((id) => workspaces.find((w) => w.id === id))
      .filter((w): w is Workspace => Boolean(w) && w!.id !== current?.id)
      .slice(0, 3)
  }, [recents, osId, workspaces, current?.id])

  const go = (workspaceId: string) => {
    setOpen(false)
    setQuery('')
    router.push(`/app/os/${osId}/w/${workspaceId}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Switch ${os.workspaceNoun.singular.toLowerCase()}`}
          className={cn(
            'inline-flex h-9 max-w-[15rem] items-center gap-2 rounded-md border px-2 text-left transition-colors',
            open ? 'border-border-strong bg-surface' : 'border-transparent hover:border-border hover:bg-surface',
          )}
        >
          {current ? (
            <Avatar name={current.name} hue={current.accent} size="sm" square />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-md border border-dashed text-muted-foreground">
              <Search className="size-3.5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight">
              {current?.name ?? `Select a ${os.workspaceNoun.singular.toLowerCase()}`}
            </span>
            <span className="block truncate text-2xs leading-tight text-muted-foreground">
              {os.workspaceNoun.singular}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[19rem]">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${os.workspaceNoun.plural.toLowerCase()}…`}
              className="h-8 w-full rounded-md border bg-surface pl-8 pr-2 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:border-border-strong"
            />
          </div>
        </div>

        <div className="scrollbar-thin max-h-80 overflow-y-auto p-1">
          {recentWorkspaces.length > 0 && !query ? (
            <>
              <ListLabel>Recent</ListLabel>
              {recentWorkspaces.map((w) => (
                <WorkspaceRow key={`recent-${w.id}`} workspace={w} onSelect={() => go(w.id)} />
              ))}
              <div className="my-1 h-px bg-border" />
            </>
          ) : null}

          <ListLabel>All {os.workspaceNoun.plural.toLowerCase()}</ListLabel>
          {filtered.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-2xs text-muted-foreground">
              No {os.workspaceNoun.plural.toLowerCase()} match “{query}”.
            </p>
          ) : (
            filtered.map((w) => (
              <WorkspaceRow
                key={w.id}
                workspace={w}
                selected={w.id === current?.id}
                onSelect={() => go(w.id)}
              />
            ))
          )}
        </div>

        <div className="border-t p-1">
          <Button asChild variant="ghost" size="sm" className="w-full justify-start">
            <Link href={`/app/os/${osId}/workspaces`} onClick={() => setOpen(false)}>
              <Plus className="size-4" />
              Manage {os.workspaceNoun.plural.toLowerCase()}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ListLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}

function WorkspaceRow({
  workspace,
  selected,
  onSelect,
}: {
  workspace: Workspace
  selected?: boolean
  onSelect: () => void
}) {
  const healthTone =
    workspace.health === 'healthy' ? 'success' : workspace.health === 'attention' ? 'warning' : 'destructive'

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted"
    >
      <Avatar name={workspace.name} hue={workspace.accent} size="sm" square />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{workspace.name}</span>
        <span className="block truncate text-2xs text-muted-foreground">
          {[
            workspace.memberCount > 0 ? `${workspace.memberCount} members` : null,
            workspace.connectedIntegrations.length > 0
              ? `${workspace.connectedIntegrations.length} data sources`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || workspace.description}
        </span>
      </span>
      {selected ? (
        <Check className="size-4 shrink-0 text-primary" />
      ) : (
        <Badge tone={healthTone} dot className="px-1.5">
          {workspace.healthScore}
        </Badge>
      )}
    </button>
  )
}
