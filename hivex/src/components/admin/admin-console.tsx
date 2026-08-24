'use client'

import Link from 'next/link'
import {
  Building2,
  Globe2,
  LayoutGrid,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { OSTile } from '@/components/common/os-tile'
import { isUnhealthy } from '@/components/integrations/status-pill'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, StatCard, TBody, TD, TH, THead, TR, Table, TableShell } from '@/components/ui/data'
import { Avatar, Tooltip } from '@/components/ui/misc'
import { useAccess } from '@/lib/access/useAccess'
import { DEMO_ACTIVITY } from '@/lib/mock/data/activity'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { formatDate, formatRelative } from '@/lib/utils/format'
import { OS_LIST } from '@/platform/config/os-registry'
import { PLANS } from '@/platform/config/plans'
import { ORG_ROLE_META } from '@/platform/config/roles'

/**
 * Administration console.
 *
 * Two audiences, one screen set: an organization admin sees their own
 * organization; a superadmin additionally sees the cross-organization view.
 * The distinction is a capability check, not a separate application — which is
 * what keeps a future real superadmin backend from needing new UI.
 */

export interface AdminSection {
  id: string
  label: string
  icon: LucideIcon
  description: string
  superadminOnly?: boolean
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    description: 'Platform-wide state across products, workspaces and people.',
  },
  {
    id: 'organizations',
    label: 'Organizations',
    icon: Globe2,
    description: 'Every organization on the platform.',
    superadminOnly: true,
  },
  {
    id: 'workspaces',
    label: 'All workspaces',
    icon: Building2,
    description: 'Every workspace in every product, with its data sources.',
  },
  {
    id: 'members',
    label: 'People',
    icon: Users,
    description: 'Membership, roles and pending approvals.',
  },
  {
    id: 'audit',
    label: 'Audit log',
    icon: ScrollText,
    description: 'What happened, when, and who did it.',
  },
]

/** Other organizations exist only in the superadmin view. */
const PLATFORM_ORGS = [
  { id: 'org_truperformance', name: 'TruPerformance', domain: 'truperformance.us', plan: 'gold', members: 8, workspaces: 9 },
  { id: 'org_northstar', name: 'Northstar Digital', domain: 'northstar.agency', plan: 'platinum', members: 34, workspaces: 26 },
  { id: 'org_bluewave', name: 'Bluewave Media', domain: 'bluewave.co', plan: 'silver', members: 6, workspaces: 4 },
  { id: 'org_orbit', name: 'Orbit Growth', domain: 'orbitgrowth.io', plan: 'free', members: 2, workspaces: 1 },
]

export function AdminConsole({ section }: { section: AdminSection }) {
  const access = useAccess()

  if (section.superadminOnly && !access.can('superadmin:console')) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Superadmin only"
        description="This view spans organizations, so it is limited to platform operators. Preview as Superadmin from the account menu to see it."
      />
    )
  }

  switch (section.id) {
    case 'organizations':
      return <OrganizationsView />
    case 'workspaces':
      return <AllWorkspacesView />
    case 'members':
      return <PeopleView />
    case 'audit':
      return <AuditView />
    default:
      return <OverviewView />
  }
}

/* -------------------------------------------------------------------------- */

function OverviewView() {
  const access = useAccess()
  const { members, workspaces, accounts } = usePlatform()
  const isSuperadmin = access.can('superadmin:console')

  const totalWorkspaces = Object.values(workspaces).flat().length
  const connected = accounts.filter((a) => a.status === 'connected').length
  const attention = accounts.filter((a) => isUnhealthy(a.status)).length

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isSuperadmin ? (
          <StatCard label="Organizations" value={PLATFORM_ORGS.length} icon={Globe2} />
        ) : (
          <StatCard label="Products live" value={OS_LIST.filter((o) => o.status === 'live').length} />
        )}
        <StatCard label="Workspaces" value={totalWorkspaces} icon={Building2} />
        <StatCard label="People" value={members.length} icon={Users} />
        <StatCard
          label="Connections"
          value={`${connected}`}
          hint={attention > 0 ? `${attention} need attention` : 'All healthy'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {OS_LIST.map((os) => {
            const verdict = access.osAccess(os.id)
            const count = (workspaces[os.id] ?? []).length
            return (
              <div key={os.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5">
                <OSTile os={os} size="sm" locked={!verdict.allowed} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{os.name}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {count} {os.workspaceNoun.plural.toLowerCase()} · {os.navigation.length} modules
                  </p>
                </div>
                <Badge
                  tone={os.status === 'live' ? 'success' : 'neutral'}
                  pending={os.status !== 'live'}
                  dot
                >
                  {os.status === 'live' ? 'Live' : 'Coming soon'}
                </Badge>
                <Button asChild variant="ghost" size="xs">
                  <Link href={`/app/os/${os.id}`}>Open</Link>
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function OrganizationsView() {
  const { organization } = usePlatform()

  return (
    <>
      <div className="mb-4 rounded-md border border-dashed bg-surface-sunken/60 px-3 py-2.5">
        <p className="text-2xs leading-relaxed text-muted-foreground">
          Cross-organization data is fixture data in this build. In production this view is served
          by a platform-operator endpoint that is separate from tenant-scoped APIs.
        </p>
      </div>

      <TableShell>
        <Table>
          <THead>
            <TR>
              <TH>Organization</TH>
              <TH>Domain</TH>
              <TH>Plan</TH>
              <TH className="text-right">Members</TH>
              <TH className="text-right">Workspaces</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {PLATFORM_ORGS.map((org) => {
              const isCurrent = org.id === organization?.id
              return (
                <TR key={org.id} className={cn(isCurrent && 'bg-primary-soft/30')}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={org.name} size="sm" square />
                      <span className="font-medium">{org.name}</span>
                      {isCurrent ? <Badge tone="accent">Current</Badge> : null}
                    </div>
                  </TD>
                  <TD className="font-mono text-2xs text-muted-foreground">{org.domain}</TD>
                  <TD>
                    <Badge tone="neutral">{PLANS[org.plan as keyof typeof PLANS].name}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{org.members}</TD>
                  <TD className="text-right tabular-nums">{org.workspaces}</TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="xs" disabled={isCurrent}>
                      Impersonate
                    </Button>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </TableShell>
    </>
  )
}

/* -------------------------------------------------------------------------- */

function AllWorkspacesView() {
  const { workspaces } = usePlatform()
  const rows = OS_LIST.flatMap((os) => (workspaces[os.id] ?? []).map((w) => ({ os, workspace: w })))

  if (rows.length === 0) {
    return <EmptyState title="No workspaces" description="Nothing has been created yet." />
  }

  return (
    <TableShell>
      <Table>
        <THead>
          <TR>
            <TH>Workspace</TH>
            <TH>Product</TH>
            <TH className="text-right">Members</TH>
            <TH className="text-right">Sources</TH>
            <TH className="text-right">Health</TH>
            <TH>Updated</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map(({ os, workspace }) => (
            <TR key={`${os.id}-${workspace.id}`}>
              <TD>
                <div className="flex items-center gap-2.5">
                  <Avatar name={workspace.name} hue={workspace.accent} size="sm" square />
                  <span className="font-medium">{workspace.name}</span>
                </div>
              </TD>
              <TD>
                <div className="flex items-center gap-2">
                  <OSTile os={os} size="sm" />
                  <span className="text-muted-foreground">{os.shortName}</span>
                </div>
              </TD>
              <TD className="text-right tabular-nums">{workspace.memberCount}</TD>
              <TD className="text-right tabular-nums">{workspace.connectedIntegrations.length}</TD>
              <TD className="text-right">
                <Badge
                  tone={
                    workspace.health === 'healthy'
                      ? 'success'
                      : workspace.health === 'attention'
                        ? 'warning'
                        : 'destructive'
                  }
                  dot
                >
                  {workspace.healthScore}
                </Badge>
              </TD>
              <TD className="whitespace-nowrap text-muted-foreground">
                {formatRelative(workspace.updatedAt, DEMO_NOW_MS)}
              </TD>
              <TD className="text-right">
                <Button asChild variant="ghost" size="xs">
                  <Link href={`/app/os/${os.id}/w/${workspace.id}`}>Open</Link>
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableShell>
  )
}

/* -------------------------------------------------------------------------- */

function PeopleView() {
  const { members } = usePlatform()

  return (
    <TableShell>
      <Table>
        <THead>
          <TR>
            <TH>Person</TH>
            <TH>Role</TH>
            <TH>Product roles</TH>
            <TH>Workspace grants</TH>
            <TH>Joined</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {members.map((member) => {
            const grants = Object.values(member.workspaceAccess).flat().length
            return (
              <TR key={member.id}>
                <TD>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={member.user.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{member.user.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{member.user.email}</p>
                    </div>
                  </div>
                </TD>
                <TD>{ORG_ROLE_META[member.role].label}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(member.osRoles).length === 0 ? (
                      <span className="text-2xs text-muted-foreground">Inherits org role</span>
                    ) : (
                      Object.entries(member.osRoles).map(([osId, role]) => (
                        <Tooltip key={osId} content={`${osId}: ${role}`}>
                          <Badge tone="neutral">
                            {osId}·{role}
                          </Badge>
                        </Tooltip>
                      ))
                    )}
                  </div>
                </TD>
                <TD className="tabular-nums text-muted-foreground">
                  {grants === 0 ? 'All accessible' : `${grants} scoped`}
                </TD>
                <TD className="whitespace-nowrap text-muted-foreground">
                  {formatDate(member.joinedAt)}
                </TD>
                <TD>
                  <Badge
                    tone={member.status === 'approved' ? 'success' : 'warning'}
                    pending={member.status !== 'approved'}
                    dot
                    className="capitalize"
                  >
                    {member.status}
                  </Badge>
                </TD>
              </TR>
            )
          })}
        </TBody>
      </Table>
    </TableShell>
  )
}

/* -------------------------------------------------------------------------- */

function AuditView() {
  return (
    <TableShell>
      <Table>
        <THead>
          <TR>
            <TH>Event</TH>
            <TH>Detail</TH>
            <TH>Actor</TH>
            <TH>Scope</TH>
            <TH>When</TH>
          </TR>
        </THead>
        <TBody>
          {DEMO_ACTIVITY.map((event) => (
            <TR key={event.id}>
              <TD className="font-medium">{event.title}</TD>
              <TD className="max-w-[24rem] truncate text-muted-foreground">{event.detail}</TD>
              <TD>{event.actor}</TD>
              <TD>
                <Badge tone="neutral" className="capitalize">
                  {event.osId ?? 'platform'}
                </Badge>
              </TD>
              <TD className="whitespace-nowrap text-muted-foreground">
                {formatRelative(event.at, DEMO_NOW_MS)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableShell>
  )
}

export function AdminNav({ current, children }: { current: string; children?: ReactNode }) {
  const access = useAccess()
  return (
    <nav aria-label="Administration sections">
      <ul className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col">
        {ADMIN_SECTIONS.filter(
          (section) => !section.superadminOnly || access.can('superadmin:console'),
        ).map((section) => {
          const active = section.id === current
          return (
            <li key={section.id}>
              <Link
                href={`/app/admin/${section.id}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] transition-colors',
                  active
                    ? 'bg-primary-soft font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <section.icon className="size-4 shrink-0" aria-hidden />
                {section.label}
              </Link>
            </li>
          )
        })}
      </ul>
      {children}
    </nav>
  )
}
