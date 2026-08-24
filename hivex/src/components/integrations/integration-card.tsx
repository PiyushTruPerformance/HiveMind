'use client'

import { AlertTriangle, Plug, Plus, RotateCw } from 'lucide-react'

import { OSTile } from '@/components/common/os-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/misc'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import { PHASE_META, providerKeyFor } from '@/platform/config/integrations'
import type { IntegrationDefinition, OSId } from '@/platform/types'

import { IntegrationIcon } from './integration-icon'
import { StatusPill, isUnhealthy } from './status-pill'

/**
 * One catalog entry.
 *
 * A card describes a *service*, so its status is the health of the accounts
 * that grant it and its detail line is how many of those accounts exist —
 * management of an individual login belongs on the owning product's
 * Connected accounts list, not here.
 */
export function IntegrationCard({
  integration,
  /** Narrows status and connect scope to one product; omitted = any product. */
  osId,
  onConnect,
  highlighted,
}: {
  integration: IntegrationDefinition
  osId?: OSId
  onConnect: (provider: string, osId: OSId) => void
  highlighted?: boolean
}) {
  const access = useAccess()
  const { serviceStatus, accountsForService } = usePlatform()

  const status = serviceStatus(integration.id, osId)
  const accounts = accountsForService(integration.id, osId)
  const isConnected = status === 'connected'
  const needsAttention = isUnhealthy(status)
  const canManage = access.can('integration:connect')
  const broken = accounts.find((a) => a.error)

  /* Connections belong to a product, so a card opened from the org-wide catalog
     defaults to the integration's primary consumer. */
  const targetOS = osId ?? integration.usedBy[0]

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

      {broken?.error ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-2xs leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          {broken.error}
        </p>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t pt-3 text-2xs">
          {accounts.slice(0, 3).map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{account.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {account.scope.kind === 'client'
                  ? `${OS_REGISTRY[account.scope.osId].shortName} · client`
                  : `added in ${OS_REGISTRY[account.connectedIn].shortName}`}
              </span>
            </li>
          ))}
          {accounts.length > 3 ? (
            <li className="text-muted-foreground">+{accounts.length - 3} more</li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-1">
          <span className="text-2xs text-muted-foreground">Used by</span>
          <div className="flex -space-x-1">
            {integration.usedBy.map((id) => (
              <Tooltip key={id} content={OS_REGISTRY[id].name}>
                <span className="rounded-md ring-2 ring-card">
                  <OSTile os={OS_REGISTRY[id]} size="sm" />
                </span>
              </Tooltip>
            ))}
          </div>
        </div>

        {targetOS ? (
          <Button
            variant={isConnected ? 'ghost' : needsAttention ? 'outline' : 'outline'}
            size="sm"
            onClick={() => onConnect(providerKeyFor(integration.id), targetOS)}
            loading={status === 'connecting'}
            disabled={!canManage}
          >
            {status === 'connecting' ? null : isConnected ? (
              <Plus className="size-3.5" />
            ) : needsAttention ? (
              <RotateCw className="size-3.5" />
            ) : (
              <Plug className="size-3.5" />
            )}
            {isConnected ? 'Add account' : needsAttention ? 'Reconnect' : 'Connect'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
