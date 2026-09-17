import 'server-only'

/**
 * Small helpers that reproduce the Python semantics the Reporting sync relies
 * on (truthiness, `int()`/`float()` coercion, banker's `round()`), plus civil
 * date math on 'YYYY-MM-DD' strings. Both apps write the same rows, so numbers
 * and dates must come out identical, not merely close.
 */

/** Python truthiness for JSON-ish values. */
export function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

/** `value or fallback`. */
export function or<T>(value: unknown, fallback: T): unknown {
  return truthy(value) ? value : fallback
}

/** `float(value or 0)` — throws like Python on non-numeric input. */
export function toFloat(value: unknown): number {
  if (!truthy(value)) return 0
  if (typeof value === 'boolean') return value ? 1 : 0
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (typeof value === 'string' && (value.trim() === '' || Number.isNaN(n))) {
    throw new TypeError(`could not convert string to float: '${value}'`)
  }
  return n
}

/** `int(float(value or 0))`. */
export function toInt(value: unknown): number {
  return Math.trunc(toFloat(value))
}

/** GA4's `_safe_float`: non-numeric input becomes 0. */
export function safeFloat(value: unknown): number {
  try {
    const n = toFloat(value)
    return Number.isNaN(n) ? 0 : n
  } catch {
    return 0
  }
}

/** GA4's `_safe_int`. */
export function safeInt(value: unknown): number {
  return Math.trunc(safeFloat(value))
}

/**
 * Python's `round(x, digits)`: rounds on the exact binary value and breaks
 * exact ties to even (JS `toFixed` breaks them away from zero).
 */
export function pyRound(x: number, digits: number): number {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e15) return x
  const exact = Math.abs(x).toFixed(100)
  const [intPart, frac] = exact.split('.')
  const isTie = frac[digits] === '5' && /^0*$/.test(frac.slice(digits + 1))
  if (isTie) {
    const lastDigit = digits > 0 ? frac[digits - 1] : intPart[intPart.length - 1]
    if (Number(lastDigit) % 2 === 0) {
      const truncated = Number(`${intPart}.${frac.slice(0, digits) || '0'}`)
      return x < 0 ? -truncated : truncated
    }
  }
  return Number(x.toFixed(digits))
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/* ---------------------------------------------------------------- dates */

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

function toUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(2000, m - 1, d))
  date.setUTCFullYear(y)
  return date
}

function fromUtc(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function makeDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

export function dateParts(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split('-').map(Number)
  return { year, month, day }
}

export function addDays(isoDate: string, days: number): string {
  const date = toUtc(isoDate)
  date.setUTCDate(date.getUTCDate() + days)
  return fromUtc(date)
}

/** `(a - b).days` */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000)
}

/** Python `date.weekday()`: Monday = 0. */
export function weekday(isoDate: string): number {
  return (toUtc(isoDate).getUTCDay() + 6) % 7
}

/** `calendar.monthrange(year, month)[1]` */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const { year, month, day } = dateParts(value)
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDayOfMonth(year, month) && year >= 1
}

/** `f"{iso.year}-W{iso.week:02d}"` from `date.isocalendar()`. */
export function isoYearWeek(isoDate: string): string {
  const date = toUtc(isoDate)
  const thursday = new Date(date)
  thursday.setUTCDate(date.getUTCDate() + 3 - weekday(isoDate))
  const isoYear = thursday.getUTCFullYear()
  const jan4 = makeDate(isoYear, 1, 4)
  const week1Monday = addDays(jan4, -weekday(jan4))
  const week = Math.floor(diffDays(isoDate, week1Monday) / 7) + 1
  return `${isoYear}-W${pad(week)}`
}
