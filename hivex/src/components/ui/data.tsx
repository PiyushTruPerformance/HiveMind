'use client'

import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'
import { Skeleton } from './misc'

/* -------------------------------------------------------------------------- */
/* Table — structural radius, solid surface, real borders.                     */
/* Dense tabular data reads as a grid, not another floating panel.             */
/* -------------------------------------------------------------------------- */

export function TableShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('overflow-hidden rounded-md border bg-card shadow-xs', className)}>
      <div className="scrollbar-thin overflow-x-auto">{children}</div>
    </div>
  )
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b bg-surface-sunken', className)} {...props} />
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b transition-colors hover:bg-muted/45 data-[state=selected]:bg-muted', className)}
      {...props}
    />
  )
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-9 whitespace-nowrap px-3 text-left align-middle text-2xs font-semibold uppercase tracking-wider text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle text-[13px]', className)} {...props} />
}

/* -------------------------------------------------------------------------- */
/* Delta                                                                       */
/* -------------------------------------------------------------------------- */

export function Delta({
  value,
  /** Set when a decrease is the good outcome (cost per lead, avg. position). */
  inverted = false,
  className,
  showIcon = true,
}: {
  value: number
  inverted?: boolean
  className?: string
  showIcon?: boolean
}) {
  const flat = Math.abs(value) < 0.05
  const good = inverted ? value < 0 : value > 0
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-2xs font-medium tabular-nums',
        flat ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive',
        className,
      )}
    >
      {showIcon ? <Icon className="size-3" aria-hidden /> : null}
      {flat ? '0.0%' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Stat card                                                                   */
/* -------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  delta,
  invertedDelta,
  hint,
  icon: Icon,
  loading,
  children,
  className,
}: {
  label: string
  value: ReactNode
  delta?: number
  invertedDelta?: boolean
  hint?: string
  icon?: LucideIcon
  loading?: boolean
  children?: ReactNode
  className?: string
}) {
  if (loading) {
    return (
      <div className={cn('rounded-xl border bg-card p-4 shadow-sm', className)}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-28" />
        <Skeleton className="mt-3 h-3 w-16" />
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden /> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {typeof delta === 'number' ? <Delta value={delta} inverted={invertedDelta} /> : null}
      </div>
      {hint ? <p className="mt-1 text-2xs text-muted-foreground">{hint}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed bg-surface-sunken/60 text-center',
        compact ? 'gap-2 px-6 py-8' : 'gap-3 px-8 py-14',
        className,
      )}
    >
      {Icon ? (
        <div className="flex size-10 items-center justify-center rounded-full border bg-surface text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-display text-sm font-semibold">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Error state                                                                 */
/* -------------------------------------------------------------------------- */

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft/60 p-4',
        className,
      )}
      role="alert"
    >
      <p className="font-display text-sm font-semibold text-destructive">{title}</p>
      {description ? (
        <p className="text-[13px] leading-relaxed text-destructive/85">{description}</p>
      ) : null}
      {action}
    </div>
  )
}
