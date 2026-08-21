'use client'

import { Sparkles, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Sparkline } from '@/components/ui/charts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, StatCard } from '@/components/ui/data'
import { cn } from '@/lib/utils/cn'
import { formatCompact, formatCurrency, formatNumber, formatPercent } from '@/lib/utils/format'
import { PERIOD_OPTIONS, type MetricSummary, type PeriodKey } from '@/lib/mock/data/reporting'

/**
 * Shared building blocks for OS screens.
 *
 * These exist so Reporting, SEO and HR render metrics, filters and section
 * shells identically. A product that needs something different builds it in its
 * own folder; it does not fork these.
 */

export function formatMetric(metric: MetricSummary): string {
  switch (metric.format) {
    case 'currency':
      return formatCurrency(metric.value)
    case 'percent':
      return formatPercent(metric.value)
    default:
      return metric.value >= 10_000 ? formatCompact(metric.value) : formatNumber(metric.value)
  }
}

const INVERTED_METRICS = new Set(['cpa', 'position', 'cost'])

export function MetricRow({ metrics, loading }: { metrics: MetricSummary[]; loading?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <StatCard
          key={metric.id}
          label={metric.label}
          value={loading ? '—' : formatMetric(metric)}
          delta={loading ? undefined : metric.delta}
          invertedDelta={INVERTED_METRICS.has(metric.id)}
          hint={metric.hint}
          loading={loading}
        >
          <Sparkline data={metric.series} />
        </StatCard>
      ))}
    </div>
  )
}

export function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodKey
  onChange: (value: PeriodKey) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          className={cn(
            'rounded-sm px-2.5 py-1 text-2xs font-medium transition-colors',
            value === option.key
              ? 'bg-surface text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? (
            <p className="mt-0.5 text-2xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className={bodyClassName}>{children}</CardContent>
    </Card>
  )
}

/**
 * Placeholder for a module that is scoped but not yet built.
 *
 * Used deliberately rather than hiding the nav item: the navigation is the
 * product roadmap, and a stated "not built yet" is more honest in a client demo
 * than a link that silently does nothing.
 */
export function ModulePlaceholder({
  title,
  description,
  icon,
  bullets,
}: {
  title: string
  description: string
  icon?: LucideIcon
  bullets?: string[]
}) {
  return (
    <div className="space-y-4">
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={
          <Badge tone="neutral" pending>
            <Sparkles className="size-3" />
            Planned module
          </Badge>
        }
      />
      {bullets && bullets.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>What this will contain</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 text-[13px] text-muted-foreground">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {bullet}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
