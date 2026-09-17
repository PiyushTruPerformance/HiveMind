import 'server-only'

import { addDays, dateParts, lastDayOfMonth, makeDate, pyRound, truthy } from '../py'

/**
 * Period math and small payload helpers shared by the three report builders
 * (each Python builder repeats these verbatim).
 */

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly'

export interface PreviousRange {
  prevStart: string
  prevEnd: string
}

/** `dict.get(key, fallback)`: a present key wins even when its value is null. */
export function dictGet(obj: Record<string, unknown>, key: string, fallback: unknown = 0): unknown {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : fallback
}

/** `_growth` in the GSC/Ads builders (`if not previous`). */
export function growthFalsy(current: unknown, previous: unknown): number {
  if (!truthy(previous)) return 0
  const p = Number(previous)
  return pyRound(((Number(current) - p) / p) * 100, 2)
}

export function previousWeekly(start: string): PreviousRange {
  return { prevStart: addDays(start, -7), prevEnd: addDays(start, -1) }
}

export function previousMonthly(start: string): PreviousRange {
  const { year, month } = dateParts(start)
  const [py, pm] = month === 1 ? [year - 1, 12] : [year, month - 1]
  return { prevStart: makeDate(py, pm, 1), prevEnd: makeDate(py, pm, lastDayOfMonth(py, pm)) }
}

export function previousQuarterly(start: string): PreviousRange {
  const { year, month } = dateParts(start)
  const q = Math.floor((month - 1) / 3) + 1
  const py = q === 1 ? year - 1 : year
  const pq = q === 1 ? 4 : q - 1
  return { prevStart: makeDate(py, (pq - 1) * 3 + 1, 1), prevEnd: makeDate(py, pq * 3, lastDayOfMonth(py, pq * 3)) }
}

export function previousHalfYearly(start: string): PreviousRange {
  const { year, month } = dateParts(start)
  const py = month === 1 ? year - 1 : year
  const pm = month === 1 ? 7 : 1
  return { prevStart: makeDate(py, pm, 1), prevEnd: makeDate(py, pm + 5, lastDayOfMonth(py, pm + 5)) }
}

export function previousYearly(start: string): PreviousRange {
  const { year } = dateParts(start)
  return { prevStart: makeDate(year - 1, 1, 1), prevEnd: makeDate(year - 1, 12, 31) }
}

/** Python `sorted(items, key=k, reverse=True)` (stable, equal keys keep order). */
export function sortDesc<T>(items: T[], key: (item: T) => number): T[] {
  return [...items].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka === kb ? 0 : ka < kb ? 1 : -1
  })
}
