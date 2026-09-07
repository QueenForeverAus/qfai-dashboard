import { createAdminClient } from '@/lib/supabase/server-admin'
import { runDateRangeFromShows } from '@/lib/run-dates'
import {
  parseCostingSnapshot,
  type BandCostLine,
  type CostingSnapshotField,
  type RunSettlementRow,
} from '@/lib/settlements'
import type { AgentSettlementLine, RemittanceChallenge, RemittanceChallengeItem, RemittanceLine, RemittanceStatus } from '@/lib/remittance'
import { isRightsPayer } from '@/lib/remittance'
import type { RightsPayer } from '@/lib/remittance-variance'

export type SettlementShow = {
  id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  show_order: number
  rights_payer: RightsPayer
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
  remittanceLines: RemittanceLine[]
  agentSettlementLines: AgentSettlementLine[]
  challenges: RemittanceChallenge[]
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
  const byCode = await admin.from('runs').select('*').eq('code', runCode.toUpperCase()).maybeSingle()
  const run = byCode.data
    ?? (await admin.from('runs').select('*').eq('id', runCode).maybeSingle()).data
  if (!run) return null

  const [
    { data: shows },
    { data: costFields },
    { data: settlementRow },
    { data: bandCosts },
    { data: remittanceLines },
    { data: agentLines },
    { data: challenges },
  ] = await Promise.all([
    admin.from('shows').select('id, venue_name, venue_city, show_date, show_order, rights_payer').eq('run_id', run.id).order('show_order'),
    admin.from('cost_fields').select('*').eq('run_id', run.id),
    admin.from('run_settlements').select('*').eq('run_id', run.id).maybeSingle(),
    admin.from('band_cost_lines').select('*').eq('run_id', run.id).order('created_at', { ascending: true }),
    admin.from('remittance_lines').select('*').eq('run_id', run.id).order('created_at', { ascending: true }),
    admin.from('agent_settlement_lines').select('*').eq('run_id', run.id).order('created_at', { ascending: true }),
    admin.from('remittance_challenges').select('*, remittance_challenge_items(*)').eq('run_id', run.id).order('created_at', { ascending: false }),
  ])

  const typedShows: SettlementShow[] = (shows ?? []).map(s => ({
    id: s.id,
    venue_name: s.venue_name,
    venue_city: s.venue_city,
    show_date: s.show_date,
    show_order: s.show_order,
    rights_payer: isRightsPayer(s.rights_payer) ? s.rights_payer : 'tbd',
  }))
  const dates = runDateRangeFromShows(typedShows)

  const remittanceStatus = (settlementRow?.remittance_status ?? 'open') as RemittanceStatus
  const settlement: RunSettlementRow | null = settlementRow
    ? {
        run_id: settlementRow.run_id,
        costing_finalised_at: settlementRow.costing_finalised_at,
        costing_finalised_by: settlementRow.costing_finalised_by,
        costing_snapshot: parseCostingSnapshot(settlementRow.costing_snapshot),
        nudge_due_at: settlementRow.nudge_due_at,
        remittance_status: remittanceStatus,
        remittance_accepted_at: settlementRow.remittance_accepted_at ?? null,
        remittance_accepted_by: settlementRow.remittance_accepted_by ?? null,
      }
    : null

  const typedChallenges: RemittanceChallenge[] = (challenges ?? []).map(c => ({
    id: c.id,
    run_id: c.run_id,
    show_id: c.show_id,
    status: c.status,
    reason: c.reason,
    subject: c.subject,
    body: c.body,
    to_label: c.to_label,
    evidence: (c.evidence ?? {}) as Record<string, boolean>,
    sent_at: c.sent_at,
    created_by: c.created_by,
    created_at: c.created_at,
    items: (c.remittance_challenge_items ?? []).map((item: Record<string, unknown>) => ({
      id: String(item.id),
      challenge_id: String(item.challenge_id),
      remittance_line_id: (item.remittance_line_id as string | null) ?? null,
      comparison_id: String(item.comparison_id ?? ''),
      flag_codes: Array.isArray(item.flag_codes) ? item.flag_codes as string[] : [],
      proposed_amount: item.proposed_amount == null ? null : Number(item.proposed_amount),
      paid_amount: item.paid_amount == null ? null : Number(item.paid_amount),
      variance: item.variance == null ? null : Number(item.variance),
      snapshot: (item.snapshot ?? {}) as RemittanceChallengeItem['snapshot'],
    })),
  }))

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
    remittanceLines: (remittanceLines ?? []) as RemittanceLine[],
    agentSettlementLines: (agentLines ?? []) as AgentSettlementLine[],
    challenges: typedChallenges,
  }
}
