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
 * a leftover date is in the past.
 *
 * Buckets:
 *   1. not_settled — occurred, no venue settlement in, remittance not accepted
 *   2. settled — settlement in (Col3 venue actuals and/or status=settled); remittance open / rectify
 *   3. settled_remitted — remittance_status = accepted
 */

import { showHasOccurred } from './settlements-sheet.ts'

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

export type SettlementsListShowInput = {
  show_date?: string | null
}

export type SettlementsListClassifyInput = {
  status?: string | null
  remittanceStatus?: string | null
  hasVenueSettlementActuals?: boolean
}

/** A Settlements-list run: every show has occurred; proposed never qualifies. */
export function isSettlementsListCompletedRun(opts: {
  status?: string | null
  shows: SettlementsListShowInput[] | null | undefined
  today?: string
}): boolean {
  const status = String(opts.status ?? '').trim().toLowerCase()
  if (status === 'proposed') return false
  const shows = opts.shows ?? []
  if (shows.length === 0) return false
  return shows.every(show => showHasOccurred(show.show_date, opts.today))
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
  shows: SettlementsListShowInput[]
}>(runs: T[], today?: string): T[] {
  return runs.filter(run => isSettlementsListCompletedRun({
    status: run.status,
    shows: run.shows,
    today,
  }))
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

export function defaultSettlementsListBucket(
  counts: Record<SettlementsListBucket, number>,
): SettlementsListBucket {
  for (const bucket of SETTLEMENTS_LIST_BUCKETS) {
    if (counts[bucket] > 0) return bucket
  }
  return 'not_settled'
}

function normalizeRemittanceStatus(value: string | null | undefined): string {
  return String(value ?? 'open').trim().toLowerCase()
}
