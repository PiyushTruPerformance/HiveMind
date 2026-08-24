'use client'

import { AlertTriangle, Check, Plug, Recycle, RotateCw } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress, Tooltip } from '@/components/ui/misc'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { getIntegration, providerKeyFor } from '@/platform/config/integrations'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { IntegrationDefinition, OSId } from '@/platform/types'

import { ConnectAccountDialog } from './connect-account-dialog'
import { IntegrationIcon } from './integration-icon'
import { StatusPill, isUnhealthy } from './status-pill'

/**
 * A product's integration requirements, in one reusable list.
 *
 * The same component serves two jobs, because they are the same information:
 * the mandatory setup step after checkout, and the summary on the product's own
 * Integrations page. `variant` only changes the framing, not the logic.
 *
 * Which integrations matter comes from the OS registry
 * (`requiredIntegrations` / `optionalIntegrations`), so a product declares its
 * data needs once and both surfaces follow.
 *
 * This list works at the *service* level — "does anything grant GA4?" — and
 * answers it from the connected accounts, wherever in the organization they were
 * added. One Google login satisfies four rows at once, and a product bought
 * later starts with those rows already ticked.
 */

export interface OSIntegrationProgress {
  required: IntegrationDefinition[]
  optional: IntegrationDefinition[]
  connectedRequired: number
  /** True when every required integration is granted by a healthy account. */
  satisfied: boolean
}

export function useOSIntegrationProgress(osId: OSId): OSIntegrationProgress {
  const { serviceStatus } = usePlatform()
  const os = OS_REGISTRY[osId]

  return useMemo(() => {
    const resolve = (ids: string[]) =>
      ids.map((id) => getIntegration(id)).filter((i): i is IntegrationDefinition => Boolean(i))

    const required = resolve(os.requiredIntegrations)
    const optional = resolve(os.optionalIntegrations)
    const connectedRequired = required.filter(
      (i) => serviceStatus(i.id, osId) === 'connected',
    ).length

    return {
      required,
      optional,
      connectedRequired,
      satisfied: connectedRequired === required.length,
    }
  }, [os, osId, serviceStatus])
}

export function OSIntegrationChecklist({
  osId,
  variant = 'setup',
}: {
  osId: OSId
  /** `setup` shows progress and required-first; `manage` shows all equally. */
  variant?: 'setup' | 'manage'
}) {
  const os = OS_REGISTRY[osId]
  const access = useAccess()
  const { serviceStatus } = usePlatform()
  const progress = useOSIntegrationProgress(osId)
  const [connecting, setConnecting] = useState<string | null>(null)

  const canConnect = access.can('integration:connect')
  const total = progress.required.length + progress.optional.length
  const connectedTotal = [...progress.required, ...progress.optional].filter(
    (i) => serviceStatus(i.id, osId) === 'connected',
  ).length

  return (
    <div className="space-y-5">
      {variant === 'setup' && progress.required.length > 0 ? (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-medium">
              {progress.connectedRequired} of {progress.required.length} required{' '}
              {progress.required.length === 1 ? 'source' : 'sources'} connected
            </p>
            <p className="text-2xs text-muted-foreground">
              {connectedTotal} of {total} total
            </p>
          </div>
          <div className="mt-2.5">
            <Progress
              value={(progress.connectedRequired / Math.max(progress.required.length, 1)) * 100}
              tone={progress.satisfied ? 'success' : 'accent'}
            />
          </div>
          {progress.satisfied ? (
            <p className="mt-2 flex items-center gap-1.5 text-2xs text-success">
              <Check className="size-3" aria-hidden />
              Everything {os.shortName} needs is connected.
            </p>
          ) : null}
        </div>
      ) : null}

      {progress.required.length > 0 ? (
        <IntegrationSection
          osId={osId}
          title="Required"
          caption={`${os.shortName} cannot show real data without these.`}
          integrations={progress.required}
          required
          canConnect={canConnect}
          onConnect={setConnecting}
        />
      ) : null}

      {progress.optional.length > 0 ? (
        <IntegrationSection
          osId={osId}
          title={variant === 'setup' ? 'Recommended' : 'Optional'}
          caption="Adds more context. You can connect these at any time."
          integrations={progress.optional}
          canConnect={canConnect}
          onConnect={setConnecting}
        />
      ) : null}

      {total === 0 ? (
        <div className="rounded-xl border border-dashed bg-surface-sunken/60 px-4 py-6 text-center">
          <p className="text-[13px] font-medium">{os.name} needs no external data sources</p>
          <p className="mt-1 text-2xs text-muted-foreground">
            It works on data you create inside it.
          </p>
        </div>
      ) : null}

      <ConnectAccountDialog
        provider={connecting}
        osId={osId}
        open={Boolean(connecting)}
        onOpenChange={(open) => {
          if (!open) setConnecting(null)
        }}
      />
    </div>
  )
}

function IntegrationSection({
  osId,
  title,
  caption,
  integrations,
  required,
  canConnect,
  onConnect,
}: {
  osId: OSId
  title: string
  caption: string
  integrations: IntegrationDefinition[]
  required?: boolean
  canConnect: boolean
  onConnect: (provider: string) => void
}) {
  const { serviceStatus, accountsForService } = usePlatform()

  return (
    <section className="space-y-2">
      <div>
        <h3 className="font-display text-[13px] font-semibold">
          {title}
          {required ? <span className="ml-1.5 text-destructive">*</span> : null}
        </h3>
        <p className="text-2xs text-muted-foreground">{caption}</p>
      </div>

      <ul className="space-y-2">
        {integrations.map((integration) => {
          const status = serviceStatus(integration.id, osId)
          const accounts = accountsForService(integration.id, osId)
          const isConnected = status === 'connected'
          const needsAttention = isUnhealthy(status)
          const broken = accounts.find((a) => a.error)
          const healthy = accounts.filter((a) => a.status === 'connected')
          const reusedFrom =
            healthy.length > 0 && healthy.every((a) => a.connectedIn !== osId)
              ? healthy[0]!.connectedIn
              : null

          return (
            <li
              key={integration.id}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-xs transition-colors',
                isConnected && 'border-success/30',
                needsAttention && 'border-warning/40',
              )}
            >
              <span className="relative">
                <IntegrationIcon integration={integration} size="md" />
                {isConnected ? (
                  <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-card bg-success text-success-foreground">
                    <Check className="size-2.5" aria-hidden />
                  </span>
                ) : null}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{integration.name}</p>
                <p className="truncate text-2xs text-muted-foreground">
                  {accounts.length > 0
                    ? accounts.map((a) => a.label).join(', ')
                    : integration.description}
                </p>
              </div>

              {/* The row was satisfied by a login added in another product —
                  worth saying, because the user never connected it here. */}
              {isConnected && reusedFrom ? (
                <Tooltip content="Connected once for your organization. No second sign-in needed.">
                  <Badge tone="success" className="shrink-0">
                    <Recycle className="size-3" aria-hidden />
                    From {OS_REGISTRY[reusedFrom].shortName}
                  </Badge>
                </Tooltip>
              ) : null}

              {broken?.error ? (
                <Tooltip content={broken.error}>
                  <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden />
                </Tooltip>
              ) : null}

              <StatusPill status={status} />

              {accounts.length > 1 ? (
                <Badge tone="neutral" className="shrink-0">
                  {accounts.length} accounts
                </Badge>
              ) : null}

              {isConnected ? null : (
                <Button
                  variant={needsAttention ? 'outline' : 'primary'}
                  size="sm"
                  disabled={!canConnect || status === 'connecting'}
                  loading={status === 'connecting'}
                  onClick={() => onConnect(providerKeyFor(integration.id))}
                >
                  {status !== 'connecting' ? (
                    needsAttention ? (
                      <RotateCw className="size-3.5" />
                    ) : (
                      <Plug className="size-3.5" />
                    )
                  ) : null}
                  {needsAttention ? 'Connect another' : 'Connect'}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
