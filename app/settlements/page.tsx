import { createAdminClient } from '@/lib/supabase/server-admin'
import { getSettlementsActor } from '@/lib/settlements-access'
import { SETTLEMENTS_MODULE_LABEL } from '@/lib/settlements'
import SettlementsListClient, { type SettlementListRun } from './SettlementsListClient'
import { runDateRangeFromShows } from '@/lib/run-dates'
import {
  classifySettlementsListBucket,
  filterSettlementsIndexRuns,
} from '@/lib/settlements-list'

export const dynamic = 'force-dynamic'

export default async function SettlementsIndexPage() {
  const actor = await getSettlementsActor()
  if (!actor) {
    return (
      <div className="p-6">
        <h1 className="text-white text-2xl font-bold mb-2">{SETTLEMENTS_MODULE_LABEL}</h1>
        <p className="text-slate-400 text-sm">Settlements is available to admin and owner only in v1.</p>
      </div>
    )
  }

  const admin = createAdminClient()
  const [{ data: runs }, { data: settlements }, { data: bandCosts }, { data: actuals }] = await Promise.all([
    admin.from('runs').select('id, code, name, status, start_date, end_date, notes, shows(id, venue_name, venue_city, show_date, show_order, harbour_status)').order('start_date', { ascending: true }),
    admin.from('run_settlements').select('run_id, costing_finalised_at, remittance_status'),
    admin.from('band_cost_lines').select('run_id, paid, waived'),
    admin.from('settlement_actual_lines').select('run_id, line_kind'),
  ])

  const settlementByRun = new Map((settlements ?? []).map(s => [s.run_id, s]))
  const venueActualsByRun = new Set(
    (actuals ?? [])
      .filter(row => row.line_kind === 'venue_settlement')
      .map(row => row.run_id as string),
  )
  const openByRun = new Map<string, number>()
  for (const line of bandCosts ?? []) {
    if (line.paid || line.waived) continue
    openByRun.set(line.run_id, (openByRun.get(line.run_id) ?? 0) + 1)
  }

  const candidates = (runs ?? []).map(run => {
    const shows = [...((run.shows ?? []) as SettlementListRun['shows'])].sort((a, b) => a.show_order - b.show_order)
    return {
      id: run.id,
      code: run.code,
      name: run.name,
      notes: (run.notes as string | null) ?? null,
      status: run.status,
      start_date: run.start_date as string | null,
      end_date: run.end_date as string | null,
      shows,
      hasVenueSettlementActuals: venueActualsByRun.has(run.id),
    }
  })

  // Demo + fully-retired dropped here. Visibility is calendar completion
  // and/or seeded Actuals — no run_settlements / costing_finalised gate.
  const list: SettlementListRun[] = []
  for (const run of filterSettlementsIndexRuns(candidates)) {
    const settlement = settlementByRun.get(run.id)
    const dates = runDateRangeFromShows(run.shows)
    const bucket = classifySettlementsListBucket({
      status: run.status,
      remittanceStatus: (settlement?.remittance_status as string | undefined) ?? 'open',
      hasVenueSettlementActuals: run.hasVenueSettlementActuals,
    })

    list.push({
      id: run.id,
      code: run.code,
      name: run.name,
      notes: run.notes,
      status: String(run.status ?? ''),
      start_date: dates.start ?? run.start_date,
      end_date: dates.end ?? run.end_date,
      finalised: Boolean(settlement?.costing_finalised_at),
      finalised_at: (settlement?.costing_finalised_at as string | null) ?? null,
      remittance_status: (settlement?.remittance_status as string | undefined) ?? 'open',
      bucket,
      band_cost_open: openByRun.get(run.id) ?? 0,
      shows: run.shows,
    })
  }

  return <SettlementsListClient runs={list} />
}
