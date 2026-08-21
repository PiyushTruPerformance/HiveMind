'use client'

import { Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/ui/data'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/field'
import { Progress } from '@/components/ui/misc'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { INTEGRATIONS, INTEGRATION_CATEGORY_META } from '@/platform/config/integrations'
import { OS_LIST } from '@/platform/config/os-registry'
import { formatLimit } from '@/platform/config/plans'
import type { IntegrationCategory, IntegrationDefinition, OSId } from '@/platform/types'

import { ConnectDialog } from './connect-dialog'
import { IntegrationCard } from './integration-card'

type StatusFilter = 'all' | 'connected' | 'available' | 'attention'

/**
 * Integration browser — the same component powers the onboarding step and the
 * standalone Integrations page. It reads the catalog, so a provider added to
 * config/integrations.ts appears here with no code change.
 */
export function IntegrationBrowser({
  focusId,
  compact,
}: {
  focusId?: string
  compact?: boolean
}) {
  const { connections, subscriptions } = usePlatform()
  const access = useAccess()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<IntegrationCategory | 'all'>('all')
  const [osFilter, setOsFilter] = useState<OSId | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [active, setActive] = useState<IntegrationDefinition | null>(null)

  const connectionMap = useMemo(
    () => Object.fromEntries(connections.map((c) => [c.integrationId, c])),
    [connections],
  )

  const connectedCount = connections.filter((c) => c.status === 'connected').length
  /*
   * Connections are organization-wide but plans are per product, so the cap is
   * the most generous tier the organization holds anywhere — charging the
   * strictest one would punish owning a Free product alongside a paid one.
   */
  const held = Object.values(subscriptions).filter(Boolean)
  const capOwner = held.reduce<OSId | null>((best, subscription) => {
    if (!subscription) return best
    if (!best) return subscription.osId
    const bestLimit = access.limitFor(best, 'integrations', connectedCount).limit
    const thisLimit = access.limitFor(subscription.osId, 'integrations', connectedCount).limit
    if (bestLimit === -1) return best
    if (thisLimit === -1 || thisLimit > bestLimit) return subscription.osId
    return best
  }, null)
  const limit = access.limitFor(capOwner ?? 'reporting', 'integrations', connectedCount)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return INTEGRATIONS.filter((integration) => {
      if (category !== 'all' && integration.category !== category) return false
      if (osFilter !== 'all' && !integration.usedBy.includes(osFilter)) return false

      const status = connectionMap[integration.id]?.status ?? 'not_connected'
      if (statusFilter === 'connected' && status !== 'connected') return false
      if (statusFilter === 'available' && status === 'connected') return false
      if (statusFilter === 'attention' && status !== 'error' && status !== 'reconnect_required') {
        return false
      }

      if (!q) return true
      return `${integration.name} ${integration.description} ${integration.providerSlug} ${integration.category}`
        .toLowerCase()
        .includes(q)
    })
  }, [query, category, osFilter, statusFilter, connectionMap])

  const categories = useMemo(() => {
    const present = new Set(INTEGRATIONS.map((i) => i.category))
    return (Object.keys(INTEGRATION_CATEGORY_META) as IntegrationCategory[]).filter((c) =>
      present.has(c),
    )
  }, [])

  return (
    <div className="space-y-5">
      {/* Usage against the plan limit — a real constraint, not decoration. */}
      {!compact ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-medium">
              {connectedCount} of {formatLimit(limit.limit, 'tools')} connected
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Set by the most generous plan you hold. Upgrade a product to raise it.
            </p>
          </div>
          {!limit.unlimited ? (
            <div className="w-full sm:w-52">
              <Progress
                value={(limit.ratio ?? 0) * 100}
                tone={limit.ratio && limit.ratio > 0.85 ? 'warning' : 'accent'}
              />
            </div>
          ) : (
            <Badge tone="success">Unlimited</Badge>
          )}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search integrations…"
              aria-label="Search integrations"
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-1 rounded-md border bg-surface p-1">
            <SlidersHorizontal className="ml-1.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {(
              [
                ['all', 'All'],
                ['connected', 'Connected'],
                ['available', 'Available'],
                ['attention', 'Needs attention'],
              ] as [StatusFilter, string][]
            ).map(([value, label]) => (
              <FilterChip
                key={value}
                active={statusFilter === value}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <FilterChip active={category === 'all' && osFilter === 'all'} onClick={() => { setCategory('all'); setOsFilter('all') }}>
            Everything
          </FilterChip>
          <span className="mx-1 w-px shrink-0 bg-border" />
          {OS_LIST.map((os) => (
            <FilterChip
              key={os.id}
              active={osFilter === os.id}
              onClick={() => setOsFilter(osFilter === os.id ? 'all' : os.id)}
            >
              {os.shortName}
            </FilterChip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-border" />
          {categories.map((c) => (
            <FilterChip
              key={c}
              active={category === c}
              onClick={() => setCategory(category === c ? 'all' : c)}
            >
              {INTEGRATION_CATEGORY_META[c].label}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No integrations match those filters"
          description="Try a different search term, or clear the category and product filters."
        />
      ) : (
        <div
          className={cn(
            'grid gap-4',
            compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3',
          )}
        >
          {filtered.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              connection={connectionMap[integration.id]}
              onConnect={setActive}
              highlighted={focusId === integration.id}
            />
          ))}
        </div>
      )}

      <ConnectDialog
        integration={active}
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setActive(null)
        }}
      />
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-2xs font-medium transition-colors',
        active
          ? 'bg-primary-soft text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
