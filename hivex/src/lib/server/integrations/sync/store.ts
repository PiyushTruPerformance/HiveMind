import 'server-only'

import { HttpError } from '@/lib/server/integrations/http'
import { db } from '@/lib/server/integrations/supabase'

/**
 * Database helpers shared by the sync pipeline. Unlike the generic `must`,
 * `unwrap` keeps the database message in the thrown error, because sync
 * failures are reported per source in the result (as the Python `str(e)` is).
 */

export function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) {
    throw new HttpError(500, `${context} failed: ${result.error.message}`)
  }
  return result.data as T
}

export function chunked<T>(items: T[], size = 500): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/** Deletes every row for `table` matching all `filters` (column = value). */
export async function deleteWhere(table: string, filters: Record<string, string>, context: string): Promise<void> {
  let query = db().from(table).delete()
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
  unwrap(await query, context)
}

export async function insertChunked(table: string, records: Record<string, unknown>[], context: string): Promise<void> {
  for (const batch of chunked(records)) {
    unwrap(await db().from(table).insert(batch), context)
  }
}

/** Newest `metric_date` in `table` for the filters, or null when nothing is stored yet. */
export async function lastSyncedDate(table: string, filters: Record<string, string>): Promise<string | null> {
  let query = db().from(table).select('metric_date')
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
  const rows = unwrap(
    await query.order('metric_date', { ascending: false }).limit(1),
    `${table} last synced date lookup`,
  ) as { metric_date: string }[]
  return rows[0] ? rows[0].metric_date.slice(0, 10) : null
}

/**
 * Port of `_clear_open_period_row`: the currently open period gets a new
 * period_end every day until it closes, so delete by period_start first or
 * the upsert (whose conflict key includes period_end) would pile up stale rows.
 */
export async function clearOpenPeriodRow(
  table: string,
  filters: Record<string, string>,
  periodType: string,
  periodStart: string,
): Promise<void> {
  await deleteWhere(table, { period_type: periodType, period_start: periodStart, ...filters }, `${table} open period clear`)
}
