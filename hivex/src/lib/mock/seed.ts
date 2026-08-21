/**
 * Deterministic fixtures.
 *
 * Every date and every generated number in the demo derives from these two
 * helpers rather than from Date.now() or Math.random(). That keeps the server
 * render and the client render byte-identical (no hydration drift) and makes a
 * client walkthrough reproducible — the same numbers appear every time.
 *
 * When the mock services are replaced by real API calls this file is deleted.
 */

/** The "today" every fixture is anchored to. */
export const DEMO_NOW = new Date('2026-08-21T09:00:00.000Z')

export const DEMO_NOW_MS = DEMO_NOW.getTime()

const DAY = 24 * 60 * 60 * 1000

export function daysAgo(n: number): string {
  return new Date(DEMO_NOW_MS - n * DAY).toISOString()
}

export function hoursAgo(n: number): string {
  return new Date(DEMO_NOW_MS - n * 60 * 60 * 1000).toISOString()
}

export function minutesAgo(n: number): string {
  return new Date(DEMO_NOW_MS - n * 60 * 1000).toISOString()
}

export function daysAhead(n: number): string {
  return new Date(DEMO_NOW_MS + n * DAY).toISOString()
}

/** Mulberry32 — small, fast, and stable across runtimes. */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable numeric seed from any string key. */
export function seedFrom(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export interface SeriesPoint {
  date: string
  label: string
  value: number
  previous: number
}

/**
 * A believable metric series: a base level, a slow trend, a weekly rhythm and
 * a little noise. `previous` is the same shape shifted back one period so every
 * chart can show a comparison without a second generator.
 */
export function buildSeries(options: {
  key: string
  days: number
  base: number
  trend?: number
  weekly?: number
  noise?: number
  integer?: boolean
}): SeriesPoint[] {
  const { key, days, base, trend = 0.15, weekly = 0.18, noise = 0.08, integer = true } = options
  const rng = makeRng(seedFrom(key))
  const points: SeriesPoint[] = []

  for (let i = days - 1; i >= 0; i -= 1) {
    const t = (days - 1 - i) / Math.max(days - 1, 1)
    const date = new Date(DEMO_NOW_MS - i * DAY)
    const dow = date.getUTCDay()
    const weekendDip = dow === 0 || dow === 6 ? 1 - weekly : 1 + weekly * 0.18
    const drift = 1 + trend * t
    const jitter = 1 + (rng() - 0.5) * 2 * noise

    const raw = base * drift * weekendDip * jitter
    const prevRaw = base * (1 + trend * Math.max(t - 0.35, 0)) * weekendDip * (1 + (rng() - 0.5) * 2 * noise) * 0.88

    points.push({
      date: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(date),
      value: integer ? Math.round(raw) : Number(raw.toFixed(2)),
      previous: integer ? Math.round(prevRaw) : Number(prevRaw.toFixed(2)),
    })
  }
  return points
}

export function sumSeries(points: SeriesPoint[], field: 'value' | 'previous' = 'value'): number {
  return points.reduce((acc, p) => acc + p[field], 0)
}

export function deltaOf(points: SeriesPoint[]): number {
  const current = sumSeries(points, 'value')
  const previous = sumSeries(points, 'previous')
  if (previous === 0) return 0
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

/** Simulated network latency so loading states are real, not decorative. */
export function latency(ms = 260): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]
}
