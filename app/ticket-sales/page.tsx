import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { todayAU } from '@/lib/dates'
import { buildTicketSalesBoard, type TicketSalesPace } from '@/lib/ticket-sales-board'
import type { BoardShowLink } from '@/lib/ticket-sales-board'
import type { CapacityBasis } from '@/lib/ticket-sales-sheet'
import TicketSalesBoardClient from './TicketSalesBoardClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ticket Sales & Ads — Queen Forever Tours',
}

type RunJoin = { code: string; status: string } | { code: string; status: string }[] | null

type ShowRow = {
  id: string
  show_date: string | null
  venue_name: string
  venue_city: string | null
  harbour_status: string | null
  runs: RunJoin
}

type SnapshotHeader = {
  id: string
  as_of_date: string
  source_file: string | null
  source_sheet: string | null
}

type SnapshotDbRow = {
  snapshot_id: string
  sheet_row_key: string
  venue_name: string
  venue_city: string | null
  state_territory: string | null
  show_date: string | null
  sold: number | null
  display_capacity: number | null
  capacity_basis: string | null
  pct_sold: number | null
  reported_on_as_of: boolean | null
  update_source: string | null
}

function runOf(runs: RunJoin): { code: string; status: string } | null {
  if (!runs) return null
  return Array.isArray(runs) ? runs[0] ?? null : runs
}

function intOrNull(value: number | null): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function basisOf(value: string | null): CapacityBasis {
  if (value === 'on_sale' || value === 'house' || value === 'missing') return value
  return 'missing'
}

export default async function TicketSalesPage() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect('/runs')
  }

  const [{ data: snaps }, { data: shows }, { data: paces }] = await Promise.all([
    admin
      .from('ticket_sales_snapshots')
      .select('id, as_of_date, source_file, source_sheet')
      .order('as_of_date', { ascending: false })
      .limit(2),
    admin
      .from('shows')
      .select('id, show_date, venue_name, venue_city, harbour_status, runs!inner(code, status)'),
    admin.from('ticket_sales_pace').select('show_id, pace'),
  ])

  const headers = (snaps ?? []) as SnapshotHeader[]
  const latest = headers[0] ?? null
  const previous = headers[1] ?? null
  const ids = headers.map(header => header.id)

  const { data: rawRows } = ids.length
    ? await admin.from('ticket_sales_snapshot_rows').select('snapshot_id, sheet_row_key, venue_name, venue_city, state_territory, show_date, sold, display_capacity, capacity_basis, pct_sold, reported_on_as_of, update_source').in('snapshot_id', ids)
    : { data: [] as SnapshotDbRow[] }

  const mapped = ((rawRows ?? []) as SnapshotDbRow[]).map(row => ({
    snapshotId: row.snapshot_id,
    sheetRowKey: row.sheet_row_key,
    venueName: row.venue_name,
    venueCity: row.venue_city,
    stateTerritory: row.state_territory,
    showDate: row.show_date,
    sold: intOrNull(row.sold),
    displayCapacity: intOrNull(row.display_capacity),
    capacityBasis: basisOf(row.capacity_basis),
    pctSold: intOrNull(row.pct_sold),
    reportedOnAsOf: Boolean(row.reported_on_as_of),
    updateSource: row.update_source,
  }))

  const portalShows: BoardShowLink[] = ((shows ?? []) as ShowRow[]).map(show => {
    const run = runOf(show.runs)
    return {
      id: show.id,
      show_date: show.show_date,
      venue_name: show.venue_name,
      venue_city: show.venue_city,
      harbour_status: show.harbour_status,
      run_status: run?.status ?? null,
      run_code: run?.code ?? '',
    }
  }).filter(show => show.run_code)

  const paceByShowId = new Map<string, TicketSalesPace | null>()
  for (const pace of paces ?? []) {
    const value = pace.pace
    paceByShowId.set(
      pace.show_id as string,
      value === 'clear' || value === 'watch' || value === 'impediment' ? value : null,
    )
  }

  const board = buildTicketSalesBoard({
    today: todayAU(),
    latestRows: latest ? mapped.filter(row => row.snapshotId === latest.id) : [],
    latestAsOf: latest?.as_of_date ?? null,
    previousRows: previous ? mapped.filter(row => row.snapshotId === previous.id) : null,
    previousAsOf: previous?.as_of_date ?? null,
    portalShows,
    paceByShowId,
  })

  return (
    <TicketSalesBoardClient
      board={board}
      sourceFile={latest?.source_file ?? null}
      sourceSheet={latest?.source_sheet ?? null}
    />
  )
}
