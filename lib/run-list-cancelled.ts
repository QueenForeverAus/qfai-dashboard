/**
 * Tour Desk list partition — cancelled / rescheduled (soft-retired) shows.
 *
 * Used by Run Costings (`/runs`) and Advancing Shows (`/advancing`) so both
 * desks hide retired dates from the main list and surface them in a bottom
 * section. Read-only classification — does not write, delete, or archive.
 *
 * Markers used (no other in-repo cancelled/rescheduled vocabulary exists):
 *   - `harbour_status` case-insensitive equal to `RETIRED`
 *   - `venue_name` starting with `RETIRED` (case-insensitive; Import Schedule
 *     title-cases sheet venues to "Retired …")
 *
 * Staging harbour_status values today are HELD / CONFIRMED / 2P / EOI —
 * those stay on the main list.
 */

import { runDateRangeFromShows, type ShowDateLike } from './run-dates.ts'

export const CANCELLED_OR_RESCHEDULED_HEADING = 'Cancelled / rescheduled runs'

/** Show columns the Costings / Advancing list pages need for this partition. */
export const RUN_LIST_SHOW_SELECT = 'id, show_date, venue_name, harbour_status'

export type CancelledShowLike = {
  harbour_status?: string | null
  venue_name?: string | null
}

export function isCancelledOrRescheduledShow(
  show: CancelledShowLike | null | undefined,
): boolean {
  if (!show) return false
  const status = String(show.harbour_status ?? '').trim().toUpperCase()
  if (status === 'RETIRED') return true
  const venue = String(show.venue_name ?? '').trim()
  return venue.toUpperCase().startsWith('RETIRED')
}

export function partitionShowsActiveVsCancelled<T extends CancelledShowLike>(
  shows: T[] | null | undefined,
): { active: T[]; cancelled: T[] } {
  const active: T[] = []
  const cancelled: T[] = []
  for (const show of shows ?? []) {
    if (isCancelledOrRescheduledShow(show)) cancelled.push(show)
    else active.push(show)
  }
  return { active, cancelled }
}

export type PartitionedRuns<T> = {
  activeRuns: T[]
  cancelledRuns: T[]
}

/**
 * Run-list granularity: keep a run on the main list when it still has any
 * active show (main copy carries only those shows). Retired shows appear
 * only on the bottom-section copy. A run whose shows are all retired goes
 * only to the bottom. Runs with no shows stay on the main list.
 */
export function partitionRunsActiveVsCancelled<
  T extends { shows?: CancelledShowLike[] | null },
>(runs: T[]): PartitionedRuns<T> {
  const activeRuns: T[] = []
  const cancelledRuns: T[] = []

  for (const run of runs) {
    const { active, cancelled } = partitionShowsActiveVsCancelled(run.shows)
    if (active.length > 0) {
      activeRuns.push({ ...run, shows: active })
    } else if (cancelled.length === 0) {
      activeRuns.push({ ...run, shows: run.shows ?? [] })
    }
    if (cancelled.length > 0) {
      cancelledRuns.push({ ...run, shows: cancelled })
    }
  }

  return { activeRuns, cancelledRuns }
}

/** End date for tab buckets after retired shows have been stripped. */
export function runListEndDate(run: {
  end_date?: string | null
  shows?: ShowDateLike[] | null
}): string | null {
  return runDateRangeFromShows(run.shows).end ?? run.end_date ?? null
}
