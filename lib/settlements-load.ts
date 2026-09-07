import { createAdminClient } from '@/lib/supabase/server-admin'
import { runDateRangeFromShows } from '@/lib/run-dates'
import {
  parseCostingSnapshot,
  type BandCostLine,
  type CostingSnapshotField,
  type RunSettlementRow,
} from '@/lib/settlements'

export type SettlementShow = {
  id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  show_order: number
}

export type SettlementWorkspaceData = {
  run: {
    id: string
    code: string
    name: string
    status: string
    start_date: string | null
    end_date: string | null
  }
  shows: SettlementShow[]
  liveFields: CostingSnapshotField[]
  settlement: RunSettlementRow | null
  bandCosts: BandCostLine[]
}

function asSnapshotFields(rows: Array<Record<string, unknown>>): CostingSnapshotField[] {
  return rows.map(f => ({
    id: String(f.id),
    run_id: String(f.run_id),
    show_id: (f.show_id as string | null) ?? null,
    category: String(f.category ?? ''),
    field_key: String(f.field_key ?? ''),
    label: String(f.label ?? ''),
    value: f.value == null ? null : Number(f.value),
    state: String(f.state ?? 'guess'),
    source: (f.source as string | null) ?? null,
    entries: Array.isArray(f.entries) ? f.entries : [],
    line_items: Array.isArray(f.line_items) ? f.line_items : [],
  }))
}

export async function loadSettlementWorkspace(runCode: string): Promise<SettlementWorkspaceData | null> {
  const admin = createAdminClient()
  const { data: run } = await admin.from('runs').select('*').eq('code', runCode.toUpperCase()).maybeSingle()
  if (!run) return null

  const [{ data: shows }, { data: costFields }, { data: settlementRow }, { data: bandCosts }] = await Promise.all([
    admin.from('shows').select('id, venue_name, venue_city, show_date, show_order').eq('run_id', run.id).order('show_order'),
    admin.from('cost_fields').select('*').eq('run_id', run.id),
    admin.from('run_settlements').select('*').eq('run_id', run.id).maybeSingle(),
    admin.from('band_cost_lines').select('*').eq('run_id', run.id).order('created_at', { ascending: true }),
  ])

  const typedShows = (shows ?? []) as SettlementShow[]
  const dates = runDateRangeFromShows(typedShows)

  const settlement: RunSettlementRow | null = settlementRow
    ? {
        run_id: settlementRow.run_id,
        costing_finalised_at: settlementRow.costing_finalised_at,
        costing_finalised_by: settlementRow.costing_finalised_by,
        costing_snapshot: parseCostingSnapshot(settlementRow.costing_snapshot),
        nudge_due_at: settlementRow.nudge_due_at,
      }
    : null

  return {
    run: {
      id: run.id,
      code: run.code,
      name: run.name,
      status: run.status,
      start_date: dates.start ?? run.start_date,
      end_date: dates.end ?? run.end_date,
    },
    shows: typedShows,
    liveFields: asSnapshotFields((costFields ?? []) as Array<Record<string, unknown>>),
    settlement,
    bandCosts: (bandCosts ?? []) as BandCostLine[],
  }
}
