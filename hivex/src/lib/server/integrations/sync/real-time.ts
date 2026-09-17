import 'server-only'

/**
 * Port of `app/utils/real_time.py`. "Today" comes from Google's own Date
 * header rather than the host clock, and is expressed as the calendar date in
 * the report's timezone so "yesterday" matches what Google's UI means by it.
 */

/**
 * Search Console always buckets search analytics by Pacific Time, regardless
 * of the site's own timezone — fixed by Google, so safe to hardcode.
 */
export const GSC_TIMEZONE = 'America/Los_Angeles'

/** Calendar date ('YYYY-MM-DD') of `instant` in IANA `timeZone`; throws RangeError on an unknown zone. */
export function calendarDateIn(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`
}

/** Falls back to the local clock when the HEAD request or its Date header fails. */
export async function getRealToday(timeZone = 'UTC'): Promise<string> {
  // Validate the zone first so a bad name fails like ZoneInfo() would, not after a network call.
  calendarDateIn(new Date(), timeZone)

  let now: Date
  try {
    const response = await fetch('https://www.google.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    const header = response.headers.get('date')
    if (!header) throw new Error('missing Date header')
    now = new Date(header)
    if (Number.isNaN(now.getTime())) throw new Error('invalid Date header')
  } catch {
    now = new Date()
  }
  return calendarDateIn(now, timeZone)
}
