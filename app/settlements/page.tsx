import { createAdminClient } from '@/lib/supabase/server-admin'
import { getSettlementsActor } from '@/lib/settlements-access'
import { SETTLEMENTS_MODULE_LABEL } from '@/lib/settlements'
import SettlementsListClient, { type SettlementListRun } from './SettlementsListClient'
import { runDateRangeFromShows } from '@/lib/run-dates'

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
  const [{ data: runs }, { data: settlements }, { data: bandCosts }] = await Promise.all([
    admin.from('runs').select('id, code, name, status, start_date, end_date, notes, shows(id, venue_name, venue_city, show_date, show_order)').order('start_date', { ascending: true }),
    admin.from('run_settlements').select('run_id, costing_finalised_at'),
    admin.from('band_cost_lines').select('run_id, paid, waived'),
  ])

  const finalisedByRun = new Map((settlements ?? []).map(s => [s.run_id, s.costing_finalised_at as string | null]))
  const openByRun = new Map<string, number>()
  for (const line of bandCosts ?? []) {
    if (line.paid || line.waived) continue
    openByRun.set(line.run_id, (openByRun.get(line.run_id) ?? 0) + 1)
  }

  const list: SettlementListRun[] = (runs ?? []).map(run => {
    const shows = [...((run.shows ?? []) as SettlementListRun['shows'])].sort((a, b) => a.show_order - b.show_order)
    const dates = runDateRangeFromShows(shows)
    return {
      id: run.id,
      code: run.code,
      name: run.name,
      notes: (run.notes as string | null) ?? null,
      status: run.status,
      start_date: dates.start ?? run.start_date,
      end_date: dates.end ?? run.end_date,
      finalised: Boolean(finalisedByRun.get(run.id)),
      finalised_at: finalisedByRun.get(run.id) ?? null,
      band_cost_open: openByRun.get(run.id) ?? 0,
      shows,
    }
  })

  return <SettlementsListClient runs={list} />
}
