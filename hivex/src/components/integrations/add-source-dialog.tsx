'use client'

import { Building2, Search, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

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
import { EmptyState } from '@/components/ui/data'
import { Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { getIntegration } from '@/platform/config/integrations'
import type { OSId, ResolvedResource } from '@/platform/types'

import { IntegrationIcon } from './integration-icon'

/**
 * Pick an already-discovered resource to feed one client.
 *
 * Reads from what the connected accounts exposed rather than asking for a
 * property id, and lists resources from every account the client is allowed to
 * draw on — which is how one client ends up served by two agency logins.
 */
export function AddSourceDialog({
  candidates,
  osId,
  workspaceId,
  workspaceName,
  open,
  onOpenChange,
}: {
  candidates: ResolvedResource[]
  osId: OSId
  workspaceId: string
  workspaceName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const { mapResource } = usePlatform()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setPicked(null)
    setBusy(false)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((entry) =>
      `${entry.resource.name} ${entry.resource.subtitle} ${entry.resource.externalId} ${entry.account.label}`
        .toLowerCase()
        .includes(q),
    )
  }, [candidates, query])

  const confirm = async () => {
    if (!picked) return
    const entry = candidates.find((c) => c.resource.id === picked)
    if (!entry) return
    setBusy(true)
    try {
      await mapResource(entry.resource.id, osId, workspaceId)
      toast.success(`${entry.resource.name} added`, `Now feeding ${workspaceName}.`)
      onOpenChange(false)
    } catch (error) {
      toast.error('Source not added', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="lg">
        <DialogHeader>
          <DialogTitle>Add a source to {workspaceName}</DialogTitle>
          <DialogDescription>
            Unmapped resources from every account this client can draw on.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties, sites, ad accounts…"
            aria-label="Search available resources"
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={candidates.length === 0 ? 'Nothing left to map' : 'No matches'}
            description={
              candidates.length === 0
                ? 'Every discovered resource is already assigned to a client. Connect another account to find more.'
                : 'Try a different search term.'
            }
          />
        ) : (
          <ul className="scrollbar-thin max-h-72 space-y-1.5 overflow-y-auto rounded-md border p-1.5">
            {filtered.map((entry) => {
              const definition = getIntegration(entry.resource.service)
              const selected = picked === entry.resource.id
              return (
                <li key={entry.resource.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(entry.resource.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-primary/40 bg-primary-soft/50'
                        : 'border-transparent hover:bg-muted',
                    )}
                  >
                    {definition ? <IntegrationIcon integration={definition} size="md" /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {entry.resource.name}
                      </span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {definition?.name ?? entry.resource.service} · {entry.resource.subtitle}
                      </span>
                    </span>
                    <Badge tone={entry.clientSpecific ? 'accent' : 'neutral'} pending={!entry.clientSpecific}>
                      {entry.clientSpecific ? (
                        <UserRound className="size-3" aria-hidden />
                      ) : (
                        <Building2 className="size-3" aria-hidden />
                      )}
                      <span className="max-w-[11rem] truncate">{entry.account.label}</span>
                    </Badge>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!picked} onClick={() => void confirm()}>
            Add source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
