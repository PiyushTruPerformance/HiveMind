import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { ConnectionStatus } from '@/platform/types'

/**
 * Every connection state the UI must be able to show, mapped once.
 *
 * Pending-shaped states (not connected, connecting) use the dashed pill;
 * decided states use a filled one — the shape rule from the design system.
 */
const STATUS_META: Record<ConnectionStatus, { label: string; tone: BadgeTone; pending: boolean }> = {
  not_connected: { label: 'Not connected', tone: 'neutral', pending: true },
  connecting: { label: 'Connecting…', tone: 'info', pending: true },
  connected: { label: 'Connected', tone: 'success', pending: false },
  error: { label: 'Connection error', tone: 'destructive', pending: false },
  reconnect_required: { label: 'Reconnect required', tone: 'warning', pending: false },
}

export function StatusPill({ status }: { status: ConnectionStatus }) {
  const meta = STATUS_META[status]
  return (
    <Badge tone={meta.tone} pending={meta.pending} dot>
      {meta.label}
    </Badge>
  )
}

export function statusLabel(status: ConnectionStatus): string {
  return STATUS_META[status].label
}
