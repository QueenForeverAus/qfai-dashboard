/**
 * Slice 1 board: one row per on-sale / upcoming sheet show (show date today
 * or later, Australia/Sydney). Played shows stay in the snapshot and are
 * left off the board. Unmatched upcoming rows are listed, not dropped.
 */

import { ticketSalesHorizon, TICKET_SALES_HORIZON_LABEL, type TicketSalesHorizon } from './ticket-sales-horizon.ts'
import type { CapacityBasis } from './ticket-sales-sheet.ts'
import { matchShowByVenueAndDate, type IdentityShow } from './show-identity-match.ts'

export type TicketSalesPace = 'clear' | 'watch' | 'impediment'

export const TICKET_SALES_PACE_VALUES: readonly TicketSalesPace[] = ['clear', 'watch', 'impediment']

export function parseTicketSalesPace(value: unknown): TicketSalesPace | null {
  if (value == null || value === '') return null
  const text = String(value).trim().toLowerCase()
  return (TICKET_SALES_PACE_VALUES as readonly string[]).includes(text) ? text as TicketSalesPace : null
}

export type SnapshotRowLike = {
  sheetRowKey: string
  venueName: string
  venueCity: string | null
  stateTerritory: string | null
  showDate: string | null
  sold: number | null
  displayCapacity: number | null
  capacityBasis: CapacityBasis
  pctSold: number | null
  reportedOnAsOf: boolean
  updateSource: string | null
}

export type BoardShowLink = IdentityShow & { run_code: string }

export type TicketSalesBoardRow = {
  sheetRowKey: string
  showId: string | null
  runCode: string | null
  runHref: string | null
  city: string
  venueName: string
  showDate: string | null
  horizon: TicketSalesHorizon | null
  horizonLabel: string
  sold: number | null
  capacity: number | null
  capacityBasis: CapacityBasis
  pctSold: number | null
  deltaWeek: number | null
  deltaLabel: string
  pace: TicketSalesPace | null
  updateSource: string | null
  asOf: string
}

export type TicketSalesUnmatchedRow = {
  sheetRowKey: string
  city: string
  venueName: string
  showDate: string | null
  sold: number | null
  capacity: number | null
  capacityBasis: CapacityBasis
}

export type TicketSalesBoard = {
  asOf: string | null
  previousAsOf: string | null
  rows: TicketSalesBoardRow[]
  unmatched: TicketSalesUnmatchedRow[]
  /** Sheet rows stored on the latest snapshot, including past shows left off the board. */
  snapshotRowCount: number
}

export function isTicketSalesBoardCandidate(
  row: Pick<SnapshotRowLike, 'venueName' | 'showDate' | 'sold' | 'displayCapacity'>,
  today: string,
): boolean {
  const venue = row.venueName.trim()
  if (!venue) return false
  const upper = venue.toUpperCase()
  if (upper === 'TBC' || upper === 'TBA' || upper === 'PLACEHOLDER' || upper.startsWith('RETIRED')) return false
  if (!row.showDate) return false
  if (row.sold == null && row.displayCapacity == null) return false
  return row.showDate >= today
}

export function formatWeekDelta(current: number | null, previous: number | null, hasPrevious: boolean): { delta: number | null; label: string } {
  if (!hasPrevious || current == null || previous == null) return { delta: null, label: '—' }
  const delta = current - previous
  if (delta > 0) return { delta, label: `+${delta}` }
  return { delta, label: String(delta) }
}

function cityLine(row: Pick<SnapshotRowLike, 'venueCity' | 'stateTerritory' | 'venueName'>): string {
  const city = row.venueCity?.trim()
  const state = row.stateTerritory?.trim()
  if (city && state) return `${city}, ${state}`
  return city || state || row.venueName
}

export function buildTicketSalesBoard(opts: {
  today: string
  latestRows: SnapshotRowLike[]
  latestAsOf: string | null
  previousRows: SnapshotRowLike[] | null
  previousAsOf: string | null
  portalShows: BoardShowLink[]
  paceByShowId: ReadonlyMap<string, TicketSalesPace | null>
}): TicketSalesBoard {
  const previousByKey = new Map((opts.previousRows ?? []).map(row => [row.sheetRowKey, row]))
  const hasPreviousSnapshot = opts.previousRows != null
  const rows: TicketSalesBoardRow[] = []
  const unmatched: TicketSalesUnmatchedRow[] = []

  const candidates = opts.latestRows
    .filter(row => isTicketSalesBoardCandidate(row, opts.today))
    .sort((a, b) => (a.showDate ?? '').localeCompare(b.showDate ?? '') || a.venueName.localeCompare(b.venueName))

  for (const row of candidates) {
    const matched = matchShowByVenueAndDate(
      { show_date: row.showDate, venue_name: row.venueName, venue_city: row.venueCity },
      opts.portalShows,
    )
    const link = matched ? opts.portalShows.find(show => show.id === matched.id) ?? null : null
    if (!link) {
      unmatched.push({
        sheetRowKey: row.sheetRowKey,
        city: cityLine(row),
        venueName: row.venueName,
        showDate: row.showDate,
        sold: row.sold,
        capacity: row.displayCapacity,
        capacityBasis: row.capacityBasis,
      })
      continue
    }

    const prior = previousByKey.get(row.sheetRowKey)
    const delta = formatWeekDelta(row.sold, prior?.sold ?? null, hasPreviousSnapshot && prior != null)
    const horizon = ticketSalesHorizon(row.showDate, opts.today)
    rows.push({
      sheetRowKey: row.sheetRowKey,
      showId: link.id,
      runCode: link.run_code,
      runHref: `/runs/${link.run_code.toLowerCase()}`,
      city: cityLine(row),
      venueName: row.venueName,
      showDate: row.showDate,
      horizon,
      horizonLabel: horizon ? TICKET_SALES_HORIZON_LABEL[horizon] : '—',
      sold: row.sold,
      capacity: row.displayCapacity,
      capacityBasis: row.capacityBasis,
      pctSold: row.pctSold,
      deltaWeek: delta.delta,
      deltaLabel: delta.label,
      pace: opts.paceByShowId.get(link.id) ?? null,
      updateSource: row.updateSource,
      asOf: opts.latestAsOf ?? '',
    })
  }

  return {
    asOf: opts.latestAsOf,
    previousAsOf: opts.previousAsOf,
    rows,
    unmatched,
    snapshotRowCount: opts.latestRows.length,
  }
}
