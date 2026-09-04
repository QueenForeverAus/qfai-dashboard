/**
 * Run calendar dates — single source of truth is shows.show_date.
 * runs.start_date / runs.end_date are a denormalized cache kept in sync on write.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ShowDateLike = { show_date?: string | null }

/** Normalize a DB date (YYYY-MM-DD or ISO timestamp) to YYYY-MM-DD, or null. */
export function toIsoDateOnly(value: string | null | undefined): string | null {
  if (value == null) return null
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/**
 * Derive a run's calendar range from its shows.
 * Returns min/max of non-null show_date values as ISO date strings (YYYY-MM-DD).
 * Empty / all-null → { start: null, end: null }.
 */
export function runDateRangeFromShows(
  shows: ShowDateLike[] | null | undefined,
): { start: string | null; end: string | null } {
  const dates = (shows ?? [])
    .map(s => toIsoDateOnly(s?.show_date ?? null))
    .filter((d): d is string => d != null)
    .sort()
  if (dates.length === 0) return { start: null, end: null }
  return { start: dates[0], end: dates[dates.length - 1] }
}

/**
 * Recompute runs.start_date / end_date from all shows for that run and UPDATE.
 * Call after any write that may change show_date (or add/remove shows).
 */
export async function syncRunDatesFromShows(
  supabase: SupabaseClient,
  runId: string,
): Promise<{ start: string | null; end: string | null }> {
  const { data: shows, error } = await supabase
    .from('shows')
    .select('show_date')
    .eq('run_id', runId)
  if (error) throw new Error(error.message)

  const range = runDateRangeFromShows(shows)
  const { error: upErr } = await supabase
    .from('runs')
    .update({ start_date: range.start, end_date: range.end })
    .eq('id', runId)
  if (upErr) throw new Error(upErr.message)
  return range
}
