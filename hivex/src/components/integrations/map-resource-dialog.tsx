'use client'

import { ArrowRight, Building2, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { usePlatform } from '@/lib/state/platform-provider'
import { getIntegration } from '@/platform/config/integrations'
import type { OSId, ResolvedResource } from '@/platform/types'

import { IntegrationIcon } from './integration-icon'

/**
 * Point one resource at one client.
 *
 * A client-owned account can only feed the client that owns it, so the picker
 * locks to that client rather than offering a choice that would then have to be
 * rejected. Shared accounts can feed anything.
 */
export function MapResourceDialog({
  entry,
  osId,
  open,
  onOpenChange,
}: {
  entry: ResolvedResource | null
  osId: OSId
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const { workspaces, mapResource } = usePlatform()
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const clients = workspaces[osId] ?? []
  const locked =
    entry && entry.account.scope.kind === 'client' ? entry.account.scope.workspaceId : null

  useEffect(() => {
    if (!open || !entry) return
    setTarget(locked ?? entry.mapping?.workspaceId ?? '')
  }, [open, entry, locked])

  if (!entry) return null

  const definition = getIntegration(entry.resource.service)
  const clientName = (id: string) => clients.find((w) => w.id === id)?.name ?? id

  const confirm = async () => {
    if (!target) return
    setBusy(true)
    try {
      await mapResource(entry.resource.id, osId, target)
      toast.success(
        `${entry.resource.name} → ${clientName(target)}`,
        'The client picks it up on the next sync.',
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
          <DialogTitle>{entry.mapping ? 'Change client' : 'Map to a client'}</DialogTitle>
          <DialogDescription>
            Decides where this resource&apos;s data appears. It does not grant or restrict access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-surface-sunken/60 p-3">
            <div className="flex items-center gap-2.5">
              {definition ? <IntegrationIcon integration={definition} size="md" /> : null}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{entry.resource.name}</p>
                <p className="truncate text-2xs text-muted-foreground">
                  {entry.resource.subtitle} ·{' '}
                  <code className="font-mono">{entry.resource.externalId}</code>
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2.5 text-2xs text-muted-foreground">
              <span>Comes from</span>
              <Badge tone={entry.clientSpecific ? 'accent' : 'neutral'} pending={!entry.clientSpecific}>
                {entry.clientSpecific ? (
                  <UserRound className="size-3" aria-hidden />
                ) : (
                  <Building2 className="size-3" aria-hidden />
                )}
                {entry.account.label}
              </Badge>
            </div>
          </div>

          {locked ? (
            <div className="rounded-md border border-primary/30 bg-primary-soft/40 px-3 py-2.5">
              <p className="text-[13px] font-medium">{clientName(locked)}</p>
              <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                This login belongs to {clientName(locked)}, so its resources can only feed that
                client. Use a shared account to serve several clients from one login.
              </p>
            </div>
          ) : (
            <Field label="Client" hint="One resource feeds one client. Re-mapping replaces.">
              {(props) => (
                <Select
                  {...props}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Select a client…</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          {entry.mapping && target && entry.mapping.workspaceId !== target ? (
            <p className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
              {clientName(entry.mapping.workspaceId)}
              <ArrowRight className="size-3" aria-hidden />
              <span className="font-medium text-foreground">{clientName(target)}</span>
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!target} onClick={() => void confirm()}>
            {entry.mapping ? 'Move resource' : 'Map resource'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
