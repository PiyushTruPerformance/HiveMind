'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  Blocks,
  FileBarChart,
  FolderKanban,
  RefreshCw,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/data'
import { DEMO_ACTIVITY } from '@/lib/mock/data/activity'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { useAccess } from '@/lib/access/useAccess'
import { formatRelative } from '@/lib/utils/format'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { ActivityEvent, ActivityKind, OSId } from '@/platform/types'

const KIND_META: Record<ActivityKind, { icon: LucideIcon; tone: string }> = {
  sync: { icon: RefreshCw, tone: 'text-info' },
  report: { icon: FileBarChart, tone: 'text-success' },
  member: { icon: UserPlus, tone: 'text-dead-end' },
  integration: { icon: Blocks, tone: 'text-warning' },
  workspace: { icon: FolderKanban, tone: 'text-muted-foreground' },
  assistant: { icon: Sparkles, tone: 'text-primary' },
  alert: { icon: AlertTriangle, tone: 'text-destructive' },
}

/**
 * Cross-product activity, filtered by what the viewer may see.
 *
 * The filter runs through the access layer rather than a local role check, so
 * previewing as a different role visibly changes this list.
 */
export function ActivityFeed({ osId, limit = 6 }: { osId?: OSId; limit?: number }) {
  const access = useAccess()

  const events = DEMO_ACTIVITY.filter((event) => {
    if (osId && event.osId !== osId) return false
    if (!event.osId) return true
    if (!access.canOpenOS(event.osId)) return false
    if (event.workspaceId && !access.canOpenWorkspace(event.osId, event.workspaceId)) return false
    return true
  }).slice(0, limit)

  if (events.length === 0) {
    return (
      <EmptyState
        compact
        title="Nothing recent"
        description="Activity from the products you can access will appear here."
      />
    )
  }

  return (
    <ul className="space-y-1">
      {events.map((event) => (
        <ActivityRow key={event.id} event={event} />
      ))}
    </ul>
  )
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const meta = KIND_META[event.kind]
  const Icon = meta.icon
  const os = event.osId ? OS_REGISTRY[event.osId] : null
  const href =
    event.osId && event.workspaceId
      ? `/app/os/${event.osId}/w/${event.workspaceId}`
      : event.osId
        ? `/app/os/${event.osId}`
        : null

  const content = (
    <>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-surface">
        <Icon className={`size-3.5 ${meta.tone}`} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium leading-snug">{event.title}</span>
          {os ? (
            <Badge tone="neutral" className="shrink-0">
              {os.shortName}
            </Badge>
          ) : null}
        </span>
        <span className="mt-0.5 block text-2xs leading-relaxed text-muted-foreground">
          {event.detail}
        </span>
        <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground/80">
          {event.actor} · {formatRelative(event.at, DEMO_NOW_MS)}
        </span>
      </span>
    </>
  )

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
        >
          {content}
        </Link>
      ) : (
        <div className="flex gap-3 px-2 py-2.5">{content}</div>
      )}
    </li>
  )
}
