'use client'

import { Building2, Link2Off, Search, Sparkles, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, TBody, TD, TH, THead, TR, Table, TableShell } from '@/components/ui/data'
import { Input, Select } from '@/components/ui/field'
import { Tooltip } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { getIntegration } from '@/platform/config/integrations'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId, ResolvedResource } from '@/platform/types'

import { IntegrationIcon } from './integration-icon'
import { MapResourceDialog } from './map-resource-dialog'
import { isUnhealthy } from './status-pill'

/**
 * Resources and their client mapping — the *resource* level of the system.
 *
 * One row per property, site, ad account or location, joined to the login that
 * exposes it and the client that consumes it. Two rows can name the same client
 * and come from different accounts; that is normal, and the Source column is
 * what makes it legible.
 *
 * The filters exist because an agency's real numbers are in the hundreds: an
 * unmapped GA4 property is invisible without one.
 */

type MappingFilter = 'all' | 'mapped' | 'unmapped' | 'unavailable'

export function ResourceMappingTable({ osId }: { osId: OSId }) {
  const toast = useToast()
  const access = useAccess()
  const { resolvedResources, workspaces, unmapResource } = usePlatform()

  const [query, setQuery] = useState('')
  const [service, setService] = useState('all')
  const [accountId, setAccountId] = useState('all')
  const [client, setClient] = useState('all')
  const [mapped, setMapped] = useState<MappingFilter>('all')
  const [editing, setEditing] = useState<ResolvedResource | null>(null)

  const canManage = access.can('integration:connect')
  const entries = resolvedResources(osId)
  const clients = workspaces[osId] ?? []
  const clientName = (id: string) => clients.find((w) => w.id === id)?.name ?? id

  const services = useMemo(
    () => [...new Set(entries.map((e) => e.resource.service))].sort(),
    [entries],
  )
  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>()
    entries.forEach((e) => seen.set(e.account.id, e.account.label))
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  }, [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries
      .filter((entry) => {
        if (service !== 'all' && entry.resource.service !== service) return false
        if (accountId !== 'all' && entry.account.id !== accountId) return false
        if (client !== 'all' && entry.mapping?.workspaceId !== client) return false

        if (mapped === 'mapped' && !entry.mapping) return false
        if (mapped === 'unmapped' && entry.mapping) return false
        if (mapped === 'unavailable' && entry.resource.available) return false

        if (!q) return true
        const haystack = [
          entry.resource.name,
          entry.resource.subtitle,
          entry.resource.externalId,
          entry.account.label,
          entry.mapping ? clientName(entry.mapping.workspaceId) : '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      /* Unavailable first, then unmapped — both are things to act on. */
      .sort((a, b) => {
        const rank = (e: ResolvedResource) =>
          !e.resource.available ? 0 : e.mapping ? 2 : 1
        return (
          rank(a) - rank(b) ||
          a.resource.service.localeCompare(b.resource.service) ||
          a.resource.name.localeCompare(b.resource.name)
        )
      })
  }, [entries, query, service, accountId, client, mapped, clients])

  const unmappedCount = entries.filter((e) => !e.mapping && e.resource.available).length

  const unmap = async (entry: ResolvedResource) => {
    try {
      await unmapResource(entry.resource.id, osId)
    } catch (error) {
      toast.error(`${entry.resource.name} was not unmapped`, error instanceof Error ? error.message : undefined)
      return
    }
    toast.info(
      `${entry.resource.name} unmapped`,
      `${clientName(entry.mapping!.workspaceId)} no longer reads it. The connection is untouched.`,
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-[14px] font-semibold">Resources &amp; mapping</h3>
          <p className="text-2xs text-muted-foreground">
            Every property, site and ad account the connected logins can see, and the client each
            one feeds.
          </p>
        </div>
        {unmappedCount > 0 ? (
          <Badge tone="warning" pending dot>
            {unmappedCount} unmapped
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties, accounts, clients…"
            aria-label="Search resources"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select
            value={service}
            onChange={(e) => setService(e.target.value)}
            aria-label="Filter by service"
          >
            <option value="all">All services</option>
            {services.map((id) => (
              <option key={id} value={id}>
                {getIntegration(id)?.name ?? id}
              </option>
            ))}
          </Select>

          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="Filter by account"
          >
            <option value="all">All accounts</option>
            {accountOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            aria-label="Filter by client"
          >
            <option value="all">All clients</option>
            {clients.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </Select>

          <Select
            value={mapped}
            onChange={(e) => setMapped(e.target.value as MappingFilter)}
            aria-label="Filter by mapping status"
          >
            <option value="all">Any status</option>
            <option value="mapped">Mapped</option>
            <option value="unmapped">Unmapped</option>
            <option value="unavailable">Unavailable</option>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={entries.length === 0 ? 'Nothing discovered yet' : 'No resources match those filters'}
          description={
            entries.length === 0
              ? `Connect an account on the previous tab — ${OS_REGISTRY[osId].shortName} lists whatever that login can see.`
              : 'Try a different search term, or reset the service, account and client filters.'
          }
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TR>
                <TH>Resource</TH>
                <TH>Service</TH>
                <TH>Source account</TH>
                <TH>Client</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((entry) => {
                const definition = getIntegration(entry.resource.service)
                const accountBroken = isUnhealthy(entry.account.status)
                return (
                  <TR key={entry.resource.id}>
                    <TD>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'truncate text-[13px] font-medium',
                            !entry.resource.available && 'text-muted-foreground line-through',
                          )}
                        >
                          {entry.resource.name}
                        </p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {entry.resource.subtitle} ·{' '}
                          <code className="font-mono">{entry.resource.externalId}</code>
                        </p>
                      </div>
                    </TD>

                    <TD>
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-2xs">
                        {definition ? <IntegrationIcon integration={definition} size="sm" /> : null}
                        {definition?.name ?? entry.resource.service}
                      </span>
                    </TD>

                    <TD>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Tooltip
                          content={
                            entry.clientSpecific
                              ? 'A login owned by this client'
                              : `Organization login, added in ${OS_REGISTRY[entry.account.connectedIn].shortName}`
                          }
                        >
                          {entry.clientSpecific ? (
                            <UserRound className="size-3 shrink-0 text-primary" aria-hidden />
                          ) : (
                            <Building2 className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                          )}
                        </Tooltip>
                        <span className="truncate text-2xs">{entry.account.label}</span>
                        {accountBroken ? (
                          <Badge tone="warning" className="shrink-0">
                            Needs reconnect
                          </Badge>
                        ) : null}
                      </div>
                    </TD>

                    <TD>
                      {entry.mapping ? (
                        <span className="whitespace-nowrap text-[13px]">
                          {clientName(entry.mapping.workspaceId)}
                        </span>
                      ) : (
                        <Badge tone="neutral" pending>
                          Unmapped
                        </Badge>
                      )}
                    </TD>

                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant={entry.mapping ? 'ghost' : 'outline'}
                          size="sm"
                          disabled={!canManage}
                          onClick={() => setEditing(entry)}
                        >
                          {entry.mapping ? 'Change' : (
                            <>
                              <Sparkles className="size-3.5" />
                              Map
                            </>
                          )}
                        </Button>
                        {entry.mapping ? (
                          <Tooltip content="Remove mapping">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={!canManage}
                              onClick={() => void unmap(entry)}
                              aria-label={`Unmap ${entry.resource.name}`}
                            >
                              <Link2Off />
                            </Button>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </TableShell>
      )}

      <MapResourceDialog
        entry={editing}
        osId={osId}
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />
    </div>
  )
}
