'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'
import { formatCompact } from '@/lib/utils/format'

/**
 * Chart wrappers.
 *
 * All colour comes from CSS variables, so charts follow the theme without a
 * second palette to maintain. Axes are quiet, grids are horizontal only, and
 * the tooltip is the same surface as every other popover in the product.
 */

const AXIS = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[]
  label?: string | number
  valueFormatter?: (value: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-2xs shadow-pop">
      {label ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-muted-foreground">
            <span
              className="size-1.5 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="capitalize">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {typeof entry.value === 'number' && valueFormatter
                ? valueFormatter(entry.value)
                : String(entry.value ?? '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartFrame({
  height = 240,
  children,
  className,
}: {
  height?: number
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      {children}
    </div>
  )
}

export interface TrendPoint {
  label: string
  value: number
  previous?: number
}

export function AreaTrend({
  data,
  height = 240,
  color = 'hsl(var(--primary))',
  showPrevious = true,
  valueFormatter = formatCompact,
}: {
  data: TrendPoint[]
  height?: number
  color?: string
  showPrevious?: boolean
  valueFormatter?: (v: number) => string
}) {
  const gradientId = `grad-${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" {...AXIS} minTickGap={28} />
          <YAxis {...AXIS} width={52} tickFormatter={(v: number) => valueFormatter(v)} />
          <RTooltip
            cursor={{ stroke: 'hsl(var(--border-strong))', strokeWidth: 1 }}
            content={<ChartTooltip valueFormatter={valueFormatter} />}
          />
          {showPrevious ? (
            <Area
              type="monotone"
              dataKey="previous"
              name="previous"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="4 4"
              fill="none"
              dot={false}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="value"
            name="current"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export function Sparkline({
  data,
  color = 'hsl(var(--primary))',
  height = 36,
}: {
  data: { value: number }[]
  color?: string
  height?: number
}) {
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export function HorizontalBars({
  data,
  height = 240,
  color = 'hsl(var(--primary))',
  valueFormatter = formatCompact,
}: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
  valueFormatter?: (v: number) => string
}) {
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" {...AXIS} tickFormatter={(v: number) => valueFormatter(v)} />
          <YAxis type="category" dataKey="label" {...AXIS} width={112} />
          <RTooltip
            cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
            content={<ChartTooltip valueFormatter={valueFormatter} />}
          />
          <Bar dataKey="value" name="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/** Sequential ramp derived from one hue — categorical without a second palette. */
export const SERIES_COLORS = [
  'hsl(var(--info))',
  'hsl(var(--success))',
  'hsl(var(--primary))',
  'hsl(var(--dead-end))',
  'hsl(var(--warning))',
  'hsl(var(--muted-foreground))',
]

export function Donut({
  data,
  height = 220,
  valueFormatter = formatCompact,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number }[]
  height?: number
  valueFormatter?: (v: number) => string
  centerLabel?: string
  centerValue?: string
}) {
  return (
    <div className="relative">
      <ChartFrame height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="hsl(var(--background))"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
              ))}
            </Pie>
            <RTooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
          </PieChart>
        </ResponsiveContainer>
      </ChartFrame>
      {centerValue ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-semibold tabular-nums">{centerValue}</span>
          {centerLabel ? (
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">
              {centerLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; value?: string }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={item.label} className="flex items-center gap-2 text-[13px]">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
          {item.value ? <span className="font-medium tabular-nums">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  )
}
