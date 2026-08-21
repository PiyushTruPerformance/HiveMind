/** Formatting helpers, mirroring the Reporting OS `lib/utils/format.ts` surface. */

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value)
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatCurrency(value: number, currency = 'USD', maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).format(value)
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return `${value.toFixed(maximumFractionDigits)}%`
}

export function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

export function formatDate(input: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export function formatDateTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

/**
 * Relative time against a caller-supplied `now`. The caller passes `now` so
 * server and client renders agree — computing Date.now() inside a component
 * body is the classic source of hydration drift.
 */
export function formatRelative(input: string | Date, now: number): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const diff = date.getTime() - now
  const abs = Math.abs(diff)
  if (abs < 45_000) return 'just now'
  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit)
  }
  return formatter.format(Math.round(diff / 1000), 'second')
}

export function initialsOf(name: string): string {
  // Skip connector tokens so "Growth & Marketing" reads GM, not G&.
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word))
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}
