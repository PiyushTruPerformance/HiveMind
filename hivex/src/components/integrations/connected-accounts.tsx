'use client'

import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Link2Off,
  Plus,
  Recycle,
  RefreshCw,
  RotateCw,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/data'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu'
import { Tooltip } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { integrationService } from '@/lib/mock/services/integrationService'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { formatRelative } from '@/lib/utils/format'
import {
  GOOGLE_PROVIDER,
  getIntegration,
  serviceIdsForOS,
  providerIconIntegration,
  providerName,
  providersForOS,
} from '@/platform/config/integrations'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { IntegrationAccount, OSId } from '@/platform/types'

import { ConnectAccountDialog } from './connect-account-dialog'
import { DisconnectAccountDialog } from './disconnect-account-dialog'
import { IntegrationIcon } from './integration-icon'
import { StatusPill, isUnhealthy } from './status-pill'

/**
 * Connected accounts — the *authorization* level of the integration system.
 *
 * One row per login, not per service: a single Google account grants GA4,
 * Search Console, Ads and Business Profile, and showing it four times would
 * imply four things to manage. Several accounts of the same provider are
 * ordinary here, which is the whole point — an agency runs more than one.
 *
 * What each account *exposes* and who consumes it lives in the mapping table;
 * this component only ever counts it.
 *
 * Accounts are organization-wide, so this list is mostly the same in every
 * product — that is the point. Rows carry where they were added so a login that
 * appears in a freshly-bought product reads as "already yours" rather than as
 * something the user does not remember connecting.
 */
export function ConnectedAccounts({
  osId,
  workspaceId,
  workspaceName,
  /** Hides the shared-vs-client legend when the caller already explains it. */
  compact,
}: {
  osId: OSId
  /** When set, only this client's own logins are listed and added. */
  workspaceId?: string
  workspaceName?: string
  compact?: boolean
}) {
  const access = useAccess()
  const { accountsFor, resourcesForAccount, mappings } = usePlatform()

  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<IntegrationAccount | null>(null)

  const canConnect = access.can('integration:connect')
  const canDisconnect = access.can('integration:disconnect')

  const accounts = useMemo(() => {
    const all = accountsFor(osId, workspaceId)
    const scoped = workspaceId ? all.filter((a) => a.scope.kind === 'client') : all
    /* Unhealthy first — the list exists to surface what needs attention. */
    return [...scoped].sort((a, b) => {
      const rank = (account: IntegrationAccount) => (isUnhealthy(account.status) ? 0 : 1)
      return rank(a) - rank(b) || a.label.localeCompare(b.label)
    })
  }, [accountsFor, osId, workspaceId])

  /* Logins the user first added somewhere else — the ones they would otherwise
     be asked to authorize a second time. */
  const reused = accounts.filter(
    (account) => account.scope.kind === 'organization' && account.connectedIn !== osId,
  )

  /* Google leads because it is the one authorization that unlocks four
     services; the rest of the catalog sits behind a menu rather than twenty
     buttons. */
  /*
   * Counted inside this product. An account can be mapped to nine Reporting
   * clients and to nothing in SEO, and telling an SEO user "9 mapped" would be
   * describing somebody else's screen.
   */
  const countsFor = (accountId: string) => {
    const owned = resourcesForAccount(accountId)
    const usable = serviceIdsForOS(osId)
    const relevant = owned.filter((r) => usable.has(r.service))
    return {
      resourceCount: relevant.length,
      mappedCount: relevant.filter((r) =>
        mappings.some((m) => m.resourceId === r.id && m.osId === osId),
      ).length,
    }
  }

  const providers = providersForOS(osId)
  const primary = providers.includes(GOOGLE_PROVIDER) ? GOOGLE_PROVIDER : providers[0]
  const others = providers.filter((p) => p !== primary)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-[14px] font-semibold">
            {workspaceId ? 'Client-owned logins' : 'Connected accounts'}
          </h3>
          <p className="text-2xs text-muted-foreground">
            {workspaceId
              ? `Accounts that belong to ${workspaceName ?? 'this client'} alone.`
              : `Organization logins, shared by every client and every product. Add as many as you need.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {primary ? (
            <Button
              variant="primary"
              size="sm"
              disabled={!canConnect}
              onClick={() => setConnecting(primary)}
            >
              <Plus className="size-3.5" />
              Add {providerName(primary)} account
            </Button>
          ) : null}

          {others.length > 0 ? (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!canConnect}>
                  Other providers
                  <ChevronDown className="size-3.5" />
                </Button>
              </MenuTrigger>
              <MenuContent align="end" className="max-h-80 overflow-y-auto">
                <MenuLabel>Connect an account</MenuLabel>
                {others.map((provider) => (
                  <MenuItem key={provider} onSelect={() => setConnecting(provider)}>
                    {providerName(provider)}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
        </div>
      </div>

      {reused.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success-soft/40 px-3 py-2.5">
          <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          <p className="text-2xs leading-relaxed">
            <span className="font-medium">
              {reused.length} {reused.length === 1 ? 'account is' : 'accounts are'} already
              connected from your other products.
            </span>{' '}
            {OS_REGISTRY[osId].shortName} can use{' '}
            {reused.length === 1 ? 'it' : 'them'} straight away — you do not need to sign in again.
          </p>
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={workspaceId ? 'No client-owned login' : 'No accounts connected yet'}
          description={
            workspaceId
              ? 'This client draws entirely on the shared accounts above. Connect a login here only if the client insists on their own.'
              : 'Connect a provider account to discover the properties, sites and ad accounts it can see.'
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              osId={osId}
              {...countsFor(account.id)}
              canConnect={canConnect}
              canDisconnect={canDisconnect}
              onDisconnect={() => setDisconnecting(account)}
            />
          ))}
        </ul>
      )}

      {!compact && !workspaceId && accounts.length > 0 ? (
        <p className="text-2xs leading-relaxed text-muted-foreground">
          Connecting an account here adds it to the organization, so any product you add later
          picks it up automatically. It does not expose anything to a client on its own — a
          resource has to be mapped first. Mapping controls where data appears in this interface;
          it is not an access-control boundary.
        </p>
      ) : null}

      <ConnectAccountDialog
        provider={connecting}
        osId={osId}
        {...(workspaceId ? { workspaceId } : {})}
        {...(workspaceName ? { workspaceName } : {})}
        open={Boolean(connecting)}
        onOpenChange={(open) => {
          if (!open) setConnecting(null)
        }}
      />

      <DisconnectAccountDialog
        account={disconnecting}
        open={Boolean(disconnecting)}
        onOpenChange={(open) => {
          if (!open) setDisconnecting(null)
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function AccountRow({
  account,
  osId,
  resourceCount,
  mappedCount,
  canConnect,
  canDisconnect,
  onDisconnect,
}: {
  account: IntegrationAccount
  osId: OSId
  resourceCount: number
  mappedCount: number
  canConnect: boolean
  canDisconnect: boolean
  onDisconnect: () => void
}) {
  const toast = useToast()
  const { upsertAccount, restoreResources } = usePlatform()
  const [syncing, setSyncing] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  const unhealthy = isUnhealthy(account.status)
  const icon = providerIconIntegration(account.provider)
  const clientScoped = account.scope.kind === 'client'
  const reusedHere = !clientScoped && account.connectedIn !== osId

  const sync = async () => {
    setSyncing(true)
    try {
      const { syncedAt } = await integrationService.syncAccount(account.id)
      upsertAccount({ ...account, lastSyncAt: syncedAt })
      toast.success(`${account.label} synced`)
    } finally {
      setSyncing(false)
    }
  }

  /*
   * Re-authorizing keeps the account id, so every existing mapping survives —
   * the client's dashboards come back rather than needing to be rebuilt.
   *
   * No rediscovery here on purpose: the same login sees the same resources, and
   * they are already in the table. Discovery belongs to first connection.
   */
  const reconnect = async () => {
    setReconnecting(true)
    try {
      const restored = await integrationService.reconnectAccount(account)
      upsertAccount(restored)
      restoreResources(restored.id)
      toast.success(
        `${account.label} reconnected`,
        'Existing client mappings were kept, so their dashboards are back.',
      )
    } finally {
      setReconnecting(false)
    }
  }

  return (
    <li
      className={cn(
        'rounded-xl border bg-card p-3.5 shadow-xs transition-colors',
        unhealthy && 'border-warning/40',
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <IntegrationIcon integration={icon} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[14px] font-medium">{account.label}</p>
            <Badge tone={clientScoped ? 'accent' : 'neutral'} pending={!clientScoped}>
              {clientScoped ? (
                <>
                  <UserRound className="size-3" aria-hidden />
                  Client-owned
                </>
              ) : (
                <>
                  <Building2 className="size-3" aria-hidden />
                  Organization
                </>
              )}
            </Badge>
            {reusedHere ? (
              <Tooltip content="Authorized once for the organization. Every product that uses these services reads the same login.">
                <Badge tone="success">
                  <Recycle className="size-3" aria-hidden />
                  Reused from {OS_REGISTRY[account.connectedIn].shortName}
                </Badge>
              </Tooltip>
            ) : null}
            <StatusPill status={account.status} />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {account.services.map((service) => {
              const definition = getIntegration(service)
              if (!definition) return null
              return (
                <Tooltip key={service} content={definition.description}>
                  <span className="flex items-center gap-1 rounded-md border bg-surface px-1.5 py-0.5 text-2xs text-muted-foreground">
                    <IntegrationIcon integration={definition} size="sm" />
                    {definition.name}
                  </span>
                </Tooltip>
              )
            })}
          </div>

          {account.error ? (
            <p className="mt-2 flex items-start gap-1.5 text-2xs leading-relaxed text-warning">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
              {account.error}
            </p>
          ) : null}

          <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-2xs">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">
                Resources {OS_REGISTRY[osId].shortName} can use
              </dt>
              <dd className="font-medium tabular-nums">{resourceCount}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Mapped here</dt>
              <dd className="font-medium tabular-nums">
                {mappedCount}
                {resourceCount > mappedCount ? (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({resourceCount - mappedCount} unused)
                  </span>
                ) : null}
              </dd>
            </div>
            {account.lastSyncAt ? (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Last sync</dt>
                <dd className="font-medium">{formatRelative(account.lastSyncAt, DEMO_NOW_MS)}</dd>
              </div>
            ) : null}
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Added by</dt>
              <dd className="font-medium">
                {account.connectedBy}
                {!clientScoped ? (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    in {OS_REGISTRY[account.connectedIn].shortName}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center gap-1">
          {unhealthy ? (
            <Button
              variant="outline"
              size="sm"
              loading={reconnecting}
              disabled={!canConnect}
              onClick={() => void reconnect()}
            >
              {!reconnecting ? <RotateCw className="size-3.5" /> : null}
              Reconnect
            </Button>
          ) : (
            <Tooltip content="Sync now">
              <Button
                variant="ghost"
                size="icon-sm"
                loading={syncing}
                onClick={() => void sync()}
                aria-label={`Sync ${account.label}`}
              >
                {!syncing ? <RefreshCw /> : null}
              </Button>
            </Tooltip>
          )}

          {canDisconnect ? (
            <Tooltip content={account.status === 'disconnected' ? 'Remove account' : 'Disconnect'}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDisconnect}
                aria-label={`${account.status === 'disconnected' ? 'Remove' : 'Disconnect'} ${account.label}`}
              >
                {account.status === 'disconnected' ? <Trash2 /> : <Link2Off />}
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </li>
  )
}
