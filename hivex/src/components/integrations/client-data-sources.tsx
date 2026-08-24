'use client'

import { AlertTriangle, Building2, Link2Off, Plus, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/data'
import { Tooltip } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { getIntegration } from '@/platform/config/integrations'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId, ResolvedResource } from '@/platform/types'

import { AddSourceDialog } from './add-source-dialog'
import { ConnectedAccounts } from './connected-accounts'
import { IntegrationIcon } from './integration-icon'
import { MapResourceDialog } from './map-resource-dialog'
import { isUnhealthy } from './status-pill'

/**
 * Where one client's data actually comes from.
 *
 * The point of this screen is attribution: a client can draw on several
 * accounts at once — organic from one agency login, paid from another, and
 * occasionally a login the client owns themselves — and nobody can debug a
 * wrong number without seeing which is which. So every row names its source
 * account and says whether that account is shared or client-owned.
 */
export function ClientDataSources({
  osId,
  workspaceId,
  workspaceName,
}: {
  osId: OSId
  workspaceId: string
  workspaceName: string
}) {
  const toast = useToast()
  const access = useAccess()
  const { resolvedResources, unmapResource } = usePlatform()

  const [adding, setAdding] = useState(false)
  const [changing, setChanging] = useState<ResolvedResource | null>(null)

  const canManage = access.can('integration:connect')
  const all = resolvedResources(osId)

  const mine = useMemo(
    () =>
      all
        .filter((entry) => entry.mapping?.workspaceId === workspaceId)
        .sort((a, b) => a.resource.service.localeCompare(b.resource.service)),
    [all, workspaceId],
  )

  /* Available to add: anything unmapped that this client is allowed to use —
     shared resources, plus resources from this client's own login. */
  const available = useMemo(
    () =>
      all.filter(
        (entry) =>
          !entry.mapping &&
          entry.resource.available &&
          (entry.account.scope.kind === 'organization' ||
            entry.account.scope.workspaceId === workspaceId),
      ),
    [all, workspaceId],
  )

  const broken = mine.filter((entry) => !entry.resource.available || isUnhealthy(entry.account.status))
  const sourceAccounts = new Set(mine.map((entry) => entry.account.id))

  const remove = async (entry: ResolvedResource) => {
    await unmapResource(entry.resource.id, osId)
    toast.info(
      `${entry.resource.name} removed`,
      `${workspaceName} no longer reads it. ${entry.account.label} stays connected.`,
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Data sources</CardTitle>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {mine.length === 0
                ? `Nothing is feeding ${workspaceName} yet.`
                : `${mine.length} ${mine.length === 1 ? 'resource' : 'resources'} from ${sourceAccounts.size} ${
                    sourceAccounts.size === 1 ? 'account' : 'accounts'
                  }.`}
            </p>
          </div>
          {available.length > 0 && canManage ? (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              Add a source
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-3">
          {broken.length > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft/50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              <p className="text-2xs leading-relaxed">
                {broken.length} of {workspaceName}&apos;s sources cannot be read right now. The
                mapping is intact — reconnect the account on the{' '}
                {OS_REGISTRY[osId].shortName} integrations page and the data returns.
              </p>
            </div>
          ) : null}

          {mine.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No sources mapped"
              description={`Map a property from a shared account, or connect a login that belongs to ${workspaceName}.`}
            />
          ) : (
            <ul className="space-y-2">
              {mine.map((entry) => (
                <SourceRow
                  key={entry.resource.id}
                  entry={entry}
                  canManage={canManage}
                  onChange={() => setChanging(entry)}
                  onRemove={() => void remove(entry)}
                />
              ))}
            </ul>
          )}

          {available.length > 0 ? (
            <p className="text-2xs text-muted-foreground">
              {available.length} more {available.length === 1 ? 'resource is' : 'resources are'}{' '}
              discovered but unmapped and could be added here.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <AddSourceDialog
        candidates={available}
        osId={osId}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        open={adding}
        onOpenChange={setAdding}
      />

      <MapResourceDialog
        entry={changing}
        osId={osId}
        open={Boolean(changing)}
        onOpenChange={(open) => {
          if (!open) setChanging(null)
        }}
      />

      <Card>
        <CardContent className="pt-5">
          <ConnectedAccounts
            osId={osId}
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            compact
          />
          <p className="mt-4 border-t pt-3 text-2xs leading-relaxed text-muted-foreground">
            Organization accounts are managed once for the whole account — they serve every client
            and every product, and are not listed here. What you see above are logins that exist
            only for {workspaceName}.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function SourceRow({
  entry,
  canManage,
  onChange,
  onRemove,
}: {
  entry: ResolvedResource
  canManage: boolean
  onChange: () => void
  onRemove: () => void
}) {
  const definition = getIntegration(entry.resource.service)
  const unavailable = !entry.resource.available || isUnhealthy(entry.account.status)

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-xs',
        unavailable && 'border-warning/40',
      )}
    >
      {definition ? <IntegrationIcon integration={definition} size="md" /> : null}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{entry.resource.name}</p>
        <p className="truncate text-2xs text-muted-foreground">
          {definition?.name ?? entry.resource.service} · {entry.resource.subtitle}
        </p>
      </div>

      <Tooltip
        content={
          entry.clientSpecific
            ? 'This client authorized this login themselves'
            : 'An organization login, also usable by other clients and products'
        }
      >
        <span className="flex items-center gap-1.5 rounded-md border bg-surface px-2 py-1 text-2xs">
          {entry.clientSpecific ? (
            <UserRound className="size-3 text-primary" aria-hidden />
          ) : (
            <Building2 className="size-3 text-muted-foreground" aria-hidden />
          )}
          <span className="max-w-[14rem] truncate">{entry.account.label}</span>
        </span>
      </Tooltip>

      {unavailable ? (
        <Badge tone="warning" dot>
          Source unavailable
        </Badge>
      ) : null}

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={!canManage} onClick={onChange}>
          Change
        </Button>
        <Tooltip content="Remove from this client">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canManage}
            onClick={onRemove}
            aria-label={`Remove ${entry.resource.name}`}
          >
            <Link2Off />
          </Button>
        </Tooltip>
      </div>
    </li>
  )
}
