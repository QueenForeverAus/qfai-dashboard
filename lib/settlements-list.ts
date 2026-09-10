/**
 * Settlements index — completed **runs** only, in three lifecycle buckets.
 *
 * Grain is the run: one list card per run. Multi-show weekends (Gosford+Richmond,
 * Auckland+Hamilton, and every future pairing) are a single Settlements entry.
 * Nested venue rows are roster, not separate settlements.
 *
 * The list is post-show close. Proposed, BOOKED-future, in-progress, and
 * not-yet-complete runs stay on Tour Desk (Advancing / Run Costings).
 *
 * Completion is calendar-based (`showHasOccurred`, Sydney day), not a
 * guessed RunStatus. `proposed` is never a Settlements-list run even if
 * a leftover date is in the past. A `run_settlements` row and
 * `costing_finalised_at` are **not** required for index visibility —
 * seeded Col3 Actuals are enough (26R01 / 26R02 on staging).
 *
 * The main index drops SAMPLE/DEMO codes (`isSettlementsDemoRun`) and
 * runs whose active shows are all cancelled/retired (`partitionRunsActiveVsCancelled`).
 *
 * Buckets:
 *   1. not_settled — occurred, no venue settlement in, remittance not accepted
 *   2. settled — settlement in (Col3 venue actuals and/or status=settled); remittance open / rectify
 *   3. settled_remitted — remittance_status = accepted
 */

import { partitionRunsActiveVsCancelled, type CancelledShowLike } from './run-list-cancelled.ts'
import { isSettlementsDemoRun, showHasOccurred } from './settlements-sheet.ts'

export const SETTLEMENTS_LIST_BUCKETS = ['not_settled', 'settled', 'settled_remitted'] as const
export type SettlementsListBucket = (typeof SETTLEMENTS_LIST_BUCKETS)[number]

export const SETTLEMENTS_LIST_BUCKET_LABELS: Record<SettlementsListBucket, string> = {
  not_settled: 'Not settled',
  settled: 'Settled',
  settled_remitted: 'Settled & remitted',
}

export const SETTLEMENTS_LIST_EMPTY =
  'No completed shows to settle yet. Proposed, BOOKED future, and in-progress runs stay on Tour Desk.'

export const SETTLEMENTS_LIST_BUCKET_EMPTY =
  'No completed shows in this bucket.'

export type SettlementsListShowInput = CancelledShowLike & {
  show_date?: string | null
}

export type SettlementsListClassifyInput = {
  status?: string | null
  remittanceStatus?: string | null
  hasVenueSettlementActuals?: boolean
}

export type SettlementsIndexRunInput = {
  code?: string | null
  name?: string | null
  notes?: string | null
  status?: string | null
  end_date?: string | null
  /** Col3 venue_settlement actuals — enough to list; no run_settlements row required. */
  hasVenueSettlementActuals?: boolean
  shows: SettlementsListShowInput[]
}

/** A Settlements-list run: every show has occurred; proposed never qualifies. */
export function isSettlementsListCompletedRun(opts: {
  status?: string | null
  shows: SettlementsListShowInput[] | null | undefined
  end_date?: string | null
  today?: string
}): boolean {
  const status = String(opts.status ?? '').trim().toLowerCase()
  if (status === 'proposed') return false
  const shows = opts.shows ?? []
  if (shows.length === 0) {
    return showHasOccurred(opts.end_date, opts.today)
  }
  return shows.every(show => showHasOccurred(show.show_date, opts.today))
}

/**
 * Index visibility: completed calendar (or past end_date) and/or seeded
 * venue Actuals. Does not read `run_settlements` or costing_finalised.
 */
export function isSettlementsIndexEligibleRun(
  run: SettlementsIndexRunInput,
  today?: string,
): boolean {
  if (run.hasVenueSettlementActuals === true) return true
  return isSettlementsListCompletedRun({
    status: run.status,
    shows: run.shows,
    end_date: run.end_date,
    today,
  })
}

/**
 * Venue settlement has come in when Col3 has venue_settlement actuals
 * or the run is already marked settled. Remittance accepted implies settled.
 */
export function hasSettlementIn(opts: SettlementsListClassifyInput): boolean {
  const remit = normalizeRemittanceStatus(opts.remittanceStatus)
  if (remit === 'accepted') return true
  if (opts.hasVenueSettlementActuals === true) return true
  return String(opts.status ?? '').trim().toLowerCase() === 'settled'
}

export function classifySettlementsListBucket(
  opts: SettlementsListClassifyInput,
): SettlementsListBucket {
  if (normalizeRemittanceStatus(opts.remittanceStatus) === 'accepted') {
    return 'settled_remitted'
  }
  if (hasSettlementIn(opts)) return 'settled'
  return 'not_settled'
}

export function filterSettlementsListRuns<T extends {
  status?: string | null
  end_date?: string | null
  shows: SettlementsListShowInput[]
}>(runs: T[], today?: string): T[] {
  return runs.filter(run => isSettlementsListCompletedRun({
    status: run.status,
    shows: run.shows,
    end_date: run.end_date,
    today,
  }))
}

/**
 * Settlements menu / index: drop SAMPLE/DEMO and fully-retired runs, then
 * keep completed live runs and/or runs that already have venue Actuals.
 */
export function filterSettlementsIndexRuns<T extends SettlementsIndexRunInput>(
  runs: T[],
  today?: string,
): T[] {
  const live = runs.filter(run => !isSettlementsDemoRun(run))
  const { activeRuns } = partitionRunsActiveVsCancelled(live)
  return activeRuns.filter(run => isSettlementsIndexEligibleRun(run, today))
}

export function groupSettlementsListRuns<T extends { bucket: SettlementsListBucket }>(
  runs: T[],
): Record<SettlementsListBucket, T[]> {
  const grouped: Record<SettlementsListBucket, T[]> = {
    not_settled: [],
    settled: [],
    settled_remitted: [],
  }
  for (const run of runs) grouped[run.bucket].push(run)
  return grouped
}

/**
 * Land on Settled when any live settled run exists (26R01/26R02), so
 * SAMPLE-dominated Not settled is not the first tab Gareth sees.
 */
export function defaultSettlementsListBucket(
  counts: Record<SettlementsListBucket, number>,
): SettlementsListBucket {
  if (counts.settled > 0) return 'settled'
  for (const bucket of SETTLEMENTS_LIST_BUCKETS) {
    if (counts[bucket] > 0) return bucket
  }
  return 'not_settled'
}

function normalizeRemittanceStatus(value: string | null | undefined): string {
  return String(value ?? 'open').trim().toLowerCase()
}
