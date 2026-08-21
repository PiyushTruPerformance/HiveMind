'use client'

import { AlertTriangle, Link2Off, Plug, RefreshCw, RotateCw } from 'lucide-react'
import { useState } from 'react'

import { OSTile } from '@/components/common/os-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { integrationService } from '@/lib/mock/services/integrationService'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { formatRelative } from '@/lib/utils/format'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import { PHASE_META } from '@/platform/config/integrations'
import type { IntegrationConnection, IntegrationDefinition } from '@/platform/types'

import { IntegrationIcon } from './integration-icon'
import { StatusPill } from './status-pill'

export function IntegrationCard({
  integration,
  connection,
  onConnect,
  highlighted,
}: {
  integration: IntegrationDefinition
  connection?: IntegrationConnection
  onConnect: (integration: IntegrationDefinition) => void
  highlighted?: boolean
}) {
  const toast = useToast()
  const access = useAccess()
  const { removeConnection, upsertConnection } = usePlatform()
  const [syncing, setSyncing] = useState(false)

  const status = connection?.status ?? 'not_connected'
  const isConnected = status === 'connected'
  const needsAttention = status === 'error' || status === 'reconnect_required'
  const canManage = access.can('integration:connect')

  const sync = async () => {
    setSyncing(true)
    try {
      const { syncedAt } = await integrationService.sync(integration.id)
      if (connection) upsertConnection({ ...connection, lastSyncAt: syncedAt })
      toast.success(`${integration.name} synced`)
    } finally {
      setSyncing(false)
    }
  }

  const disconnect = async () => {
    await integrationService.disconnect(integration.id)
    removeConnection(integration.id)
    toast.info(`${integration.name} disconnected`)
  }

  return (
    <div
      id={`integration-${integration.id}`}
      className={cn(
        'flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm transition-all',
        'hover:border-border-strong hover:shadow-md',
        highlighted && 'border-primary ring-1 ring-primary',
        needsAttention && 'border-warning/40',
      )}
    >
      <div className="flex items-start gap-3">
        <IntegrationIcon integration={integration} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-display text-[14px] font-semibold">{integration.name}</p>
            {integration.phase > 0 ? (
              <Tooltip content={PHASE_META[integration.phase]?.note}>
                <Badge tone="neutral" pending className="shrink-0">
                  {PHASE_META[integration.phase]?.label}
                </Badge>
              </Tooltip>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-muted-foreground">
            {integration.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill status={status} />
        {integration.authType === 'api_key' ? (
          <Badge tone="neutral" pending>
            API key
          </Badge>
        ) : null}
        {!integration.confirmed ? (
          <Tooltip content={integration.docsNote}>
            <Badge tone="warning" dot>
              Unverified slug
            </Badge>
          </Tooltip>
        ) : null}
      </div>

      {connection?.error ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-2xs leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          {connection.error}
        </p>
      ) : null}

      {isConnected ? (
        <dl className="mt-3 space-y-1 border-t pt-3 text-2xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Account</dt>
            <dd className="truncate font-medium">{connection?.accountLabel}</dd>
          </div>
          {connection?.selectedResources.length ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Mapped</dt>
              <dd className="font-medium tabular-nums">
                {connection.selectedResources.length} resources
              </dd>
            </div>
          ) : null}
          {connection?.lastSyncAt ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Last sync</dt>
              <dd className="font-medium">{formatRelative(connection.lastSyncAt, DEMO_NOW_MS)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-1">
          <span className="text-2xs text-muted-foreground">Used by</span>
          <div className="flex -space-x-1">
            {integration.usedBy.map((osId) => (
              <Tooltip key={osId} content={OS_REGISTRY[osId].name}>
                <span className="rounded-md ring-2 ring-card">
                  <OSTile os={OS_REGISTRY[osId]} size="sm" />
                </span>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isConnected ? (
            <>
              <Tooltip content="Sync now">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void sync()}
                  loading={syncing}
                  aria-label={`Sync ${integration.name}`}
                >
                  {!syncing ? <RefreshCw /> : null}
                </Button>
              </Tooltip>
              {access.can('integration:disconnect') ? (
                <Tooltip content="Disconnect">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void disconnect()}
                    aria-label={`Disconnect ${integration.name}`}
                  >
                    <Link2Off />
                  </Button>
                </Tooltip>
              ) : null}
            </>
          ) : needsAttention ? (
            <Button variant="outline" size="sm" onClick={() => onConnect(integration)} disabled={!canManage}>
              <RotateCw className="size-3.5" />
              Reconnect
            </Button>
          ) : (
            <Button
              variant={status === 'connecting' ? 'subtle' : 'outline'}
              size="sm"
              onClick={() => onConnect(integration)}
              loading={status === 'connecting'}
              disabled={!canManage}
            >
              {status !== 'connecting' ? <Plug className="size-3.5" /> : null}
              Connect
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
