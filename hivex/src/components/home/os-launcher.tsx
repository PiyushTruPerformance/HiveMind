'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { ArrowUpRight, Check, Clock, Info, Pin, PinOff } from 'lucide-react'

import { OSTile } from '@/components/common/os-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/misc'
import { useAccess } from '@/lib/access/useAccess'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { formatRelative } from '@/lib/utils/format'
import { ACTIVATION_COPY, routeForStatus } from '@/platform/config/activation'
import { OS_LIST } from '@/platform/config/os-registry'
import { PLANS, formatPrice, plansForOS, priceFor } from '@/platform/config/plans'
import type { OSActivationStatus, OSProduct } from '@/platform/types'

/**
 * The launcher — product discovery and product access in one grid.
 *
 * A card shows one of four states, and each has exactly one primary action:
 *
 *   active        → Open
 *   mid-funnel    → resume at the stage it stopped at
 *   discoverable  → Explore (the detail page, not the product)
 *   unreleased    → nothing to do yet, and it says so
 *
 * Clicking a product you have not bought never drops you into an empty
 * application; it opens the page that explains what the product is.
 */
export function OSLauncher() {
  const { favorites } = usePlatform()
  const access = useAccess()

  const ordered = [...OS_LIST].sort((a, b) => {
    const rank = (os: OSProduct) => {
      if (favorites.includes(os.id)) return 0
      const status = access.activationStatus(os.id)
      if (status === 'active') return 1
      if (status !== 'discoverable') return 2
      return os.status === 'coming_soon' ? 4 : 3
    }
    return rank(a) - rank(b)
  })

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ordered.map((os, index) => (
        <motion.div
          key={os.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.035, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <OSCard os={os} />
        </motion.div>
      ))}
    </div>
  )
}

const STATE_BADGE: Record<
  OSActivationStatus,
  { tone: 'success' | 'warning' | 'neutral'; pending: boolean } | null
> = {
  active: { tone: 'success', pending: false },
  selected: { tone: 'warning', pending: true },
  payment_required: { tone: 'warning', pending: true },
  setup_required: { tone: 'warning', pending: true },
  discoverable: null,
}

function OSCard({ os }: { os: OSProduct }) {
  const access = useAccess()
  const { isFavorite, toggleFavorite, visit, recents } = usePlatform()

  const status = access.activationStatus(os.id)
  const pinned = isFavorite(os.id)
  const unreleased = os.status === 'coming_soon'
  const isActive = status === 'active'
  const inFunnel = !isActive && status !== 'discoverable'
  const planId = access.planFor(os.id)
  const lastUsed = recents.find((r) => r.osId === os.id)?.at

  const workspaces = isActive ? access.workspacesIn(os.id) : []
  const cheapest = plansForOS(os.id)[0]
  const fromPrice = cheapest ? priceFor(os.id, cheapest, 'monthly') : 0
  const badge = STATE_BADGE[status]

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col rounded-xl border p-5 transition-all',
        unreleased
          ? 'border-dashed bg-surface-sunken/50'
          : 'bg-card shadow-sm hover:border-border-strong hover:shadow-md',
      )}
    >
      {isActive ? (
        <Tooltip content={pinned ? 'Unpin' : 'Pin to the top'}>
          <button
            type="button"
            onClick={() => toggleFavorite(os.id)}
            aria-pressed={pinned}
            aria-label={pinned ? `Unpin ${os.name}` : `Pin ${os.name}`}
            className={cn(
              'absolute right-3 top-3 rounded-md p-1.5 transition-all',
              pinned
                ? 'text-primary'
                : 'text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            {pinned ? <Pin className="size-3.5 fill-current" /> : <PinOff className="size-3.5" />}
          </button>
        </Tooltip>
      ) : null}

      <div className="flex items-start gap-3">
        <OSTile os={os} size="xl" locked={!isActive} />
        <div className="min-w-0 flex-1 pr-6">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[15px] font-semibold leading-tight">{os.name}</h3>
            {unreleased ? (
              <Badge tone="neutral" pending>
                Coming soon
              </Badge>
            ) : badge ? (
              <Badge tone={badge.tone} pending={badge.pending} dot>
                {isActive ? (
                  <>
                    <Check className="size-2.5" aria-hidden /> Active
                  </>
                ) : (
                  ACTIVATION_COPY[status].label
                )}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {os.description}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted-foreground">
        {isActive ? (
          <>
            {planId ? (
              <Badge tone="neutral">{PLANS[planId].name}</Badge>
            ) : null}
            <span className="tabular-nums">
              <span className="font-medium text-foreground">{workspaces.length}</span>{' '}
              {os.workspaceNoun.plural.toLowerCase()}
            </span>
            {lastUsed ? <span>Opened {formatRelative(lastUsed, DEMO_NOW_MS)}</span> : null}
          </>
        ) : unreleased ? (
          <span className="flex items-center gap-1.5">
            <Clock className="size-3" aria-hidden />
            In design — not available yet
          </span>
        ) : inFunnel ? (
          <span className="flex items-center gap-1.5 text-warning">
            <Info className="size-3" aria-hidden />
            {ACTIVATION_COPY[status].hint}
          </span>
        ) : (
          <>
            <span>
              From <span className="font-medium text-foreground">{formatPrice(fromPrice)}</span>
              {fromPrice > 0 ? ' / month' : ''}
            </span>
            <span className="tabular-nums">
              <span className="font-medium text-foreground">{os.navigation.length}</span> modules
            </span>
          </>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {isActive ? (
          <>
            <Button asChild variant="primary" size="sm" onClick={() => visit(os.id)}>
              <Link href={`/app/os/${os.id}`}>
                Open {os.shortName}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/app/os/${os.id}/about`}>Details</Link>
            </Button>
          </>
        ) : unreleased ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/os/${os.id}/about`}>Read more</Link>
          </Button>
        ) : inFunnel ? (
          <>
            <Button asChild variant="primary" size="sm">
              <Link href={routeForStatus(os.id, status)}>{ACTIVATION_COPY[status].cta}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/app/os/${os.id}/about`}>Details</Link>
            </Button>
          </>
        ) : (
          <Button asChild variant="primary" size="sm">
            <Link href={`/app/os/${os.id}/about`}>
              Explore {os.shortName}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
