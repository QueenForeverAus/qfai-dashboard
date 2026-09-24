/**
 * Replace dated ticket-sales snapshots. Pace rows are not touched.
 * Service role only — the route checks owner/admin before calling this.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { matchShowByVenueAndDate, type IdentityShow } from './show-identity-match.ts'
import {
  latestSnapshotDates,
  snapshotRowsAsOf,
  type ParsedTicketWorkbook,
} from './ticket-sales-sheet.ts'

export type IngestedSnapshot = {
  asOf: string
  rows: number
  matched: number
}

type MatchableRow = {
  showDate: string | null
  venueName: string
  venueCity: string | null
}

/**
 * Attach Portal `show_id` before a snapshot insert.
 * A raw insert that omits this column stores NULL even when venue + date match.
 */
export function withMatchedShowIds<T extends MatchableRow>(
  rows: T[],
  portalShows: IdentityShow[],
): { rows: Array<T & { showId: string | null }>; matched: number } {
  let matched = 0
  const linked = rows.map(row => {
    const showId = matchShowByVenueAndDate(
      { show_date: row.showDate, venue_name: row.venueName, venue_city: row.venueCity },
      portalShows,
    )?.id ?? null
    if (showId) matched += 1
    return { ...row, showId }
  })
  return { rows: linked, matched }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function replaceTicketSalesSnapshots(
  admin: SupabaseClient,
  opts: {
    parsed: ParsedTicketWorkbook
    sourceFile: string
    ingestedBy: string | null
    portalShows: IdentityShow[]
    /** Default: every weekly date in the sheet. */
    dates?: string[]
  },
): Promise<IngestedSnapshot[]> {
  const dates = (opts.dates ?? opts.parsed.weekDates).slice().sort()
  if (dates.length === 0) {
    throw new Error('Workbook has no weekly dates to snapshot')
  }

  const results: IngestedSnapshot[] = []
  for (const asOf of dates) {
    const drafts = snapshotRowsAsOf(opts.parsed.shows, asOf)
    const { data: existing, error: existingError } = await admin
      .from('ticket_sales_snapshots')
      .select('id')
      .eq('as_of_date', asOf)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)

    let snapshotId = existing?.id as string | undefined
    if (snapshotId) {
      const { error: deleteError } = await admin
        .from('ticket_sales_snapshot_rows')
        .delete()
        .eq('snapshot_id', snapshotId)
      if (deleteError) throw new Error(deleteError.message)
      const { error: updateError } = await admin
        .from('ticket_sales_snapshots')
        .update({
          source_file: opts.sourceFile,
          source_sheet: opts.parsed.sheetName,
          ingested_at: new Date().toISOString(),
          ingested_by: opts.ingestedBy,
        })
        .eq('id', snapshotId)
      if (updateError) throw new Error(updateError.message)
    } else {
      const { data: inserted, error: insertError } = await admin
        .from('ticket_sales_snapshots')
        .insert({
          as_of_date: asOf,
          source_file: opts.sourceFile,
          source_sheet: opts.parsed.sheetName,
          ingested_by: opts.ingestedBy,
        })
        .select('id')
        .single()
      if (insertError) throw new Error(insertError.message)
      snapshotId = inserted.id as string
    }

    const linked = withMatchedShowIds(drafts, opts.portalShows)
    const matched = linked.matched
    const payload = linked.rows.map(row => {
      return {
        snapshot_id: snapshotId,
        show_id: row.showId,
        sheet_row_key: row.sheetRowKey,
        venue_name: row.venueName,
        venue_city: row.venueCity,
        state_territory: row.stateTerritory,
        show_date: row.showDate,
        sold: row.sold,
        comps: row.comps,
        total_with_comps: row.totalWithComps,
        house_capacity: row.houseCapacity,
        on_sale_capacity: row.onSaleCapacity,
        capacity_basis: row.capacityBasis,
        display_capacity: row.displayCapacity,
        pct_sold: row.pctSold,
        reported_on_as_of: row.reportedOnAsOf,
        update_source: row.updateSource,
        final_figure: row.finalFigure,
      }
    })

    for (const part of chunk(payload, 200)) {
      const { error } = await admin.from('ticket_sales_snapshot_rows').insert(part)
      if (error) throw new Error(error.message)
    }

    results.push({ asOf, rows: payload.length, matched })
  }
  return results
}

export function snapshotDatesForScope(weekDates: string[], scope: string | null | undefined): string[] {
  if ((scope ?? 'all').toLowerCase() === 'latest2') return latestSnapshotDates(weekDates, 2)
  return [...weekDates].sort()
}
