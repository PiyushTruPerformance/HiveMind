'use client'

import { AlertTriangle, Link2Off, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { integrationService } from '@/lib/mock/services/integrationService'
import { usePlatform } from '@/lib/state/platform-provider'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { IntegrationAccount } from '@/platform/types'

/**
 * Disconnect confirmation, with the blast radius stated up front.
 *
 * The count is computed from the live mapping table before the dialog opens, so
 * the user reads "7 resources, 4 clients" while they can still cancel rather
 * than discovering it afterwards from an empty dashboard.
 *
 * Mappings deliberately survive the disconnect. A client that loses its source
 * should say "reconnect required", not quietly forget it was ever wired up —
 * re-authorizing the same account is then a one-click repair.
 */
export function DisconnectAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: IntegrationAccount | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const {
    disconnectImpactFor,
    disconnectAccount,
    removeAccount,
    workspaces,
  } = usePlatform()
  const [busy, setBusy] = useState(false)

  if (!account) return null

  /* Already disconnected: the only thing left to decide is whether to forget
     the mappings too. */
  const alreadyDisconnected = account.status === 'disconnected'
  const impact = disconnectImpactFor(account.id)

  /*
   * Named per product, because an organization login can be feeding clients in
   * several products at once and "4 clients" means little without saying where.
   */
  const affected = impact.affected.map(({ osId, workspaceId }) => {
    const name = (workspaces[osId] ?? []).find((w) => w.id === workspaceId)?.name ?? workspaceId
    return { name, osName: OS_REGISTRY[osId].shortName }
  })
  const affectedNames = affected.map((a) => a.name)
  const crossProduct = impact.affectedOSIds.length > 1

  const confirm = async () => {
    setBusy(true)
    try {
      await integrationService.disconnectAccount(account.id)
      disconnectAccount(account.id)
      toast.info(
        `${account.label} disconnected`,
        affectedNames.length > 0
          ? `${affected.length} ${affected.length === 1 ? 'client' : 'clients'} now show “source unavailable”. Reconnect to restore them.`
          : 'No clients were using it, so it has been removed entirely.',
      )
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  /* Only offered once the user has seen the impact — this is the branch that
     really does throw the client mappings away. */
  const forget = async () => {
    setBusy(true)
    try {
      await integrationService.disconnectAccount(account.id)
      removeAccount(account.id)
      toast.info(
        `${account.label} removed`,
        `${impact.mappedResourceCount} client ${impact.mappedResourceCount === 1 ? 'mapping was' : 'mappings were'} deleted with it.`,
      )
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {alreadyDisconnected ? 'Remove' : 'Disconnect'} {account.label}?
          </DialogTitle>
          <DialogDescription>
            {alreadyDisconnected
              ? 'This account is already disconnected. Removing it deletes the client mappings it was holding open.'
              : 'Access is revoked immediately and everything this login exposes stops syncing.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Resources affected" value={impact.resourceCount} />
            <Stat
              label={crossProduct ? 'Clients affected, across products' : 'Clients affected'}
              value={impact.affected.length}
              tone={impact.affected.length > 0 ? 'warning' : 'neutral'}
            />
          </div>

          {impact.mappedResourceCount > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft/50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0 text-2xs leading-relaxed">
                <p className="font-medium">
                  {impact.mappedResourceCount}{' '}
                  {impact.mappedResourceCount === 1 ? 'resource is' : 'resources are'} currently
                  mapped to {affected.length} {affected.length === 1 ? 'client' : 'clients'}.
                </p>
                <p className="mt-1 text-muted-foreground">
                  {affected
                    .map((a) => (crossProduct ? `${a.name} (${a.osName})` : a.name))
                    .join(', ')}{' '}
                  will show “source unavailable” until you reconnect this account or map a
                  replacement. The account stays in the list and its mappings are kept, so
                  reconnecting restores every client at once.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-2xs text-muted-foreground">
              Nothing from this account is mapped to a client, so no dashboards change and the
              account is removed outright.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep connected
          </Button>
          {impact.mappedResourceCount > 0 || alreadyDisconnected ? (
            <Button
              variant={alreadyDisconnected ? 'destructive' : 'outline'}
              loading={busy && alreadyDisconnected}
              disabled={busy}
              onClick={() => void forget()}
            >
              {!busy ? <Trash2 className="size-4" /> : null}
              {alreadyDisconnected
                ? impact.mappedResourceCount > 0
                  ? 'Remove and delete mappings'
                  : 'Remove account'
                : 'Disconnect and delete mappings'}
            </Button>
          ) : null}
          {!alreadyDisconnected ? (
            <Button variant="destructive" loading={busy} onClick={() => void confirm()}>
              {!busy ? <Link2Off className="size-4" /> : null}
              Disconnect
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-md border bg-surface-sunken/60 px-3 py-2.5">
      <p
        className={`font-display text-xl font-semibold tabular-nums ${
          tone === 'warning' && value > 0 ? 'text-warning' : ''
        }`}
      >
        {value}
      </p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  )
}
