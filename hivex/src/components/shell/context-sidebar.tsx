'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Blocks,
  ChevronLeft,
  Clock,
  Home,
  Lock,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'

import { OSTile } from '@/components/common/os-tile'
import { Avatar } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import { useAccess } from '@/lib/access/useAccess'
import { ASK_TRU_NAME } from '@/platform/config/ask-tru'
import { usePlatform } from '@/lib/state/platform-provider'
import { useRouteContext } from '@/lib/state/use-route-context'
import { cn } from '@/lib/utils/cn'
import { OS_LIST, groupedNavigation } from '@/platform/config/os-registry'
import type { OSId } from '@/platform/types'

/**
 * The contextual sidebar.
 *
 * One component, three states, chosen by where you are in the hierarchy:
 *   platform  → products, recents, platform services
 *   OS        → OS sections and the workspace list
 *   workspace → the OS navigation from the registry, filtered by scoped role
 *
 * Nothing here is written per-OS. `groupedNavigation()` reads the registry, and
 * `access.navigationFor()` removes items the member's role cannot reach — which
 * is why adding an OS requires no change in this file.
 */
export function ContextSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const route = useRouteContext()

  if (route.scope === 'workspace' && route.os && route.workspaceId) {
    return <WorkspaceNav onNavigate={onNavigate} />
  }
  if (route.scope === 'os' && route.os) {
    return <OSNav onNavigate={onNavigate} />
  }
  return <PlatformNav onNavigate={onNavigate} />
}

/* -------------------------------------------------------------------------- */

function SidebarShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="scrollbar-thin flex h-full w-full flex-col gap-5 overflow-y-auto px-3 py-4">
      {children}
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  locked,
  onNavigate,
  children,
}: {
  href: string
  label: string
  icon?: LucideIcon
  active?: boolean
  badge?: string
  locked?: boolean
  onNavigate?: () => void
  children?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors',
        active
          ? 'bg-primary-soft font-medium text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children ?? (Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null)}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {locked ? <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden /> : null}
      {badge ? (
        <Badge tone="neutral" className="px-1.5">
          {badge}
        </Badge>
      ) : null}
    </Link>
  )
}

/* -------------------------------------------------------------------------- */
/* Platform scope                                                              */
/* -------------------------------------------------------------------------- */

function PlatformNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? ''
  const access = useAccess()
  const { recents, workspaces } = usePlatform()

  const recentWorkspaces = useMemo(
    () =>
      recents
        .filter((r) => r.workspaceId)
        .map((r) => ({
          osId: r.osId,
          workspace: (workspaces[r.osId] ?? []).find((w) => w.id === r.workspaceId),
        }))
        .filter((r) => r.workspace)
        .slice(0, 4),
    [recents, workspaces],
  )

  return (
    <SidebarShell>
      <div>
        <NavLink
          href="/app"
          label="Home"
          icon={Home}
          active={pathname === '/app'}
          onNavigate={onNavigate}
        />
        <NavLink
          href="/app/assistant"
          label={ASK_TRU_NAME}
          icon={Sparkles}
          active={pathname.startsWith('/app/assistant')}
          onNavigate={onNavigate}
        />
        <NavLink
          href="/app/integrations"
          label="Integrations"
          icon={Blocks}
          active={pathname.startsWith('/app/integrations')}
          onNavigate={onNavigate}
        />
      </div>

      <div>
        <GroupLabel>Products</GroupLabel>
        {OS_LIST.map((os) => {
          const verdict = access.osAccess(os.id)
          return (
            <NavLink
              key={os.id}
              href={`/app/os/${os.id}`}
              label={os.name}
              active={pathname.startsWith(`/app/os/${os.id}`)}
              locked={!verdict.allowed}
              onNavigate={onNavigate}
            >
              <OSTile os={os} size="sm" locked={!verdict.allowed} />
            </NavLink>
          )
        })}
      </div>

      {recentWorkspaces.length > 0 ? (
        <div>
          <GroupLabel>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3" /> Recent
            </span>
          </GroupLabel>
          {recentWorkspaces.map(({ osId, workspace }) => (
            <NavLink
              key={`${osId}-${workspace!.id}`}
              href={`/app/os/${osId}/w/${workspace!.id}`}
              label={workspace!.name}
              active={pathname.includes(workspace!.id)}
              onNavigate={onNavigate}
            >
              <Avatar name={workspace!.name} hue={workspace!.accent} size="sm" square />
            </NavLink>
          ))}
        </div>
      ) : null}

      <div className="mt-auto">
        {access.can('admin:console') || access.can('superadmin:console') ? (
          <NavLink
            href="/app/admin"
            label="Administration"
            icon={ShieldCheck}
            active={pathname.startsWith('/app/admin')}
            onNavigate={onNavigate}
          />
        ) : null}
        <NavLink
          href="/app/settings"
          label="Settings"
          icon={Settings}
          active={pathname.startsWith('/app/settings')}
          onNavigate={onNavigate}
        />
      </div>
    </SidebarShell>
  )
}

/* -------------------------------------------------------------------------- */
/* OS scope                                                                    */
/* -------------------------------------------------------------------------- */

function OSNav({ onNavigate }: { onNavigate?: () => void }) {
  const route = useRouteContext()
  const access = useAccess()
  const os = route.os!
  const workspaces = access.workspacesIn(os.id)

  return (
    <SidebarShell>
      <BackToPlatform onNavigate={onNavigate} />

      <div className="flex items-center gap-2.5 rounded-lg border bg-surface px-2.5 py-2">
        <OSTile os={os} size="md" />
        <div className="min-w-0">
          <p className="truncate font-display text-[13px] font-semibold">{os.name}</p>
          <p className="truncate text-2xs text-muted-foreground">{os.tagline}</p>
        </div>
      </div>

      <div>
        {os.sections.map((section) => (
          <NavLink
            key={section.id || 'root'}
            href={section.id ? `/app/os/${os.id}/${section.id}` : `/app/os/${os.id}`}
            label={section.label}
            icon={section.icon}
            active={route.sectionId === section.id}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {os.supportsWorkspaces && workspaces.length > 0 ? (
        <div>
          <GroupLabel>{os.workspaceNoun.plural}</GroupLabel>
          {workspaces.map((w) => (
            <NavLink
              key={w.id}
              href={`/app/os/${os.id}/w/${w.id}`}
              label={w.name}
              onNavigate={onNavigate}
            >
              <Avatar name={w.name} hue={w.accent} size="sm" square />
            </NavLink>
          ))}
        </div>
      ) : null}
    </SidebarShell>
  )
}

/* -------------------------------------------------------------------------- */
/* Workspace scope                                                             */
/* -------------------------------------------------------------------------- */

function WorkspaceNav({ onNavigate }: { onNavigate?: () => void }) {
  const route = useRouteContext()
  const access = useAccess()
  const os = route.os!
  const workspaceId = route.workspaceId!

  const allowed = new Set(access.navigationFor(os.id).map((item) => item.id))
  const groups = groupedNavigation(os)
    .map((group) => ({ ...group, items: group.items.filter((item) => allowed.has(item.id)) }))
    .filter((group) => group.items.length > 0)

  const base = `/app/os/${os.id}/w/${workspaceId}`

  return (
    <SidebarShell>
      <Link
        href={`/app/os/${os.id}`}
        onClick={onNavigate}
        className="flex items-center gap-2 px-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        All {os.workspaceNoun.plural.toLowerCase()}
      </Link>

      {route.workspace ? (
        <div className="flex items-center gap-2.5 rounded-lg border bg-surface px-2.5 py-2">
          <Avatar name={route.workspace.name} hue={route.workspace.accent} size="md" square />
          <div className="min-w-0">
            <p className="truncate font-display text-[13px] font-semibold">{route.workspace.name}</p>
            <p className="truncate text-2xs text-muted-foreground">
              {os.shortName} · {os.workspaceNoun.singular}
            </p>
          </div>
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.group}>
          <GroupLabel>{group.group}</GroupLabel>
          {group.items.map((item) => (
            <NavLink
              key={item.id || 'root'}
              href={item.id ? `${base}/${item.id}` : base}
              label={item.label}
              icon={item.icon}
              badge={item.badge}
              active={route.sectionId === item.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}

      <div className="mt-auto rounded-lg border border-dashed bg-surface-sunken/60 p-3">
        <p className="text-2xs font-medium">Your role here</p>
        <p className="mt-0.5 text-2xs capitalize text-muted-foreground">
          {(access.scopedRole(os.id) ?? 'none').replace('_', ' ')}
        </p>
      </div>
    </SidebarShell>
  )
}

function BackToPlatform({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/app"
      onClick={onNavigate}
      className="flex items-center gap-2 px-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      All products
    </Link>
  )
}

export function isOSIdActive(pathname: string, osId: OSId) {
  return pathname.startsWith(`/app/os/${osId}`)
}
