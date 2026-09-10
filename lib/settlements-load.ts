/**
 * Settlements workspace loader.
 *
 * Phase 4: Col2 Expected (`liveFields` + show P&L chrome) binds to the
 * active Run Advancing workspace via loadActiveAdvancingWorkspace /
 * loadAdvancingCostFields. Frozen cost_fields is fallback only when that
 * workspace is missing. This module never writes cost_fields.
 */

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
import type { SettlementActualLine } from '@/lib/settlements-sheet-actuals'
import { isSettlementActualKind, isSettlementActualStatus } from '@/lib/settlements-sheet-actuals'
import type { RightsPayer } from '@/lib/remittance-variance'
import { insideFactorsFromRows, type InsideFactorValues, type KnownInsideLine } from '@/lib/pnl-run-costing'
import { isAdvancingWorkspaceActive } from '@/lib/run-advancing'
import {
  loadActiveAdvancingWorkspace,
  loadAdvancingCostFields,
} from '@/lib/run-advancing-persist'
import type { SettlementExpectedSource } from '@/lib/settlements-sheet'
import {
  applySettlementExpectedShows,
  resolveSettlementExpectedLive,
} from '@/lib/settlements-expected'
import type { SettlementAssessmentMessage } from '@/lib/settlements-v3-assessment'

export {
  SETTLEMENTS_COL2_WRITES_COST_FIELDS,
  applySettlementExpectedShows,
  asSnapshotFields,
  parseAdvancingShowsChrome,
  resolveSettlementExpectedLive,
} from '@/lib/settlements-expected'

export type SettlementShow = {
  id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  show_order: number
  rights_payer: RightsPayer
  capacity: number | null
  capacity_bands: unknown | null
  ticket_price: number | null
  tickets_sold: number | null
  booking_fee_per_payer: number | null
  cc_fee_pct: number | null
}

export type SettlementWorkspaceData = {
  run: {
    id: string
    code: string
    name: string
    status: string
    start_date: string | null
    end_date: string | null
    notes: string | null
  }
  shows: SettlementShow[]
  liveFields: CostingSnapshotField[]
  /** advancing when an active workspace exists; costing_fallback otherwise. */
  expectedSource: SettlementExpectedSource
  settlement: RunSettlementRow | null
  bandCosts: BandCostLine[]
  remittanceLines: RemittanceLine[]
  agentSettlementLines: AgentSettlementLine[]
  challenges: RemittanceChallenge[]
  actuals: SettlementActualLine[]
  insideFactors: InsideFactorValues
  remittanceKnownLines: KnownInsideLine[]
  /** Remittance + agent-statement lines used to resolve stored GST (never a rate). */
  gstKnownLines: KnownInsideLine[]
  /** Portal assessment chat — not a Lead mirror. Empty if the table is not on this env yet. */
  assessmentMessages: SettlementAssessmentMessage[]
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
    { data: actualRows },
    { data: factorRows },
    advancingWorkspace,
  ] = await Promise.all([
    admin.from('shows').select('id, venue_name, venue_city, show_date, show_order, rights_payer, capacity, capacity_bands, ticket_price, tickets_sold, booking_fee_per_payer, cc_fee_pct').eq('run_id', run.id).order('show_order'),
    admin.from('cost_fields').select('*').eq('run_id', run.id),
    admin.from('run_settlements').select('*').eq('run_id', run.id).maybeSingle(),
    admin.from('band_cost_lines').select('*').eq('run_id', run.id).order('created_at', { ascending: true }),
    admin.from('remittance_lines').select('*').eq('run_id', run.id).order('created_at', { ascending: true }),
    admin.from('agent_settlement_lines').select('*').eq('run_id', run.id).order('created_at', { ascending: true }),
    admin.from('remittance_challenges').select('*, remittance_challenge_items(*)').eq('run_id', run.id).order('created_at', { ascending: false }),
    admin.from('settlement_actual_lines').select('*').eq('run_id', run.id).order('created_at', { ascending: true }),
    admin.from('run_factors').select('key, value, category').in('key', [
      'booking_fee_per_payer',
      'cc_fee_pct',
      'inside_cc_fee_pct',
      'ticketing_inside_pct',
    ]),
    loadActiveAdvancingWorkspace(admin, run.id),
  ])

  const assessmentMessagesResult = await admin
    .from('settlement_assessment_messages')
    .select('*')
    .eq('run_id', run.id)
    .order('created_at', { ascending: true })
    .then(res => res, () => ({ data: null, error: { message: 'unavailable' } }))

  const advancingFields = advancingWorkspace && isAdvancingWorkspaceActive(advancingWorkspace)
    ? await loadAdvancingCostFields(admin, advancingWorkspace.id)
    : null
  const expected = resolveSettlementExpectedLive({
    advancingWorkspace,
    advancingFields: advancingFields as Array<Record<string, unknown>> | null,
    costingFields: (costFields ?? []) as Array<Record<string, unknown>>,
  })

  const rawShows: SettlementShow[] = (shows ?? []).map(s => ({
    id: s.id,
    venue_name: s.venue_name,
    venue_city: s.venue_city,
    show_date: s.show_date,
    show_order: s.show_order,
    rights_payer: isRightsPayer(s.rights_payer) ? s.rights_payer : 'tbd',
    capacity: s.capacity == null ? null : Number(s.capacity),
    capacity_bands: s.capacity_bands ?? null,
    ticket_price: s.ticket_price == null ? null : Number(s.ticket_price),
    tickets_sold: s.tickets_sold == null ? null : Number(s.tickets_sold),
    booking_fee_per_payer: s.booking_fee_per_payer == null ? null : Number(s.booking_fee_per_payer),
    cc_fee_pct: s.cc_fee_pct == null ? null : Number(s.cc_fee_pct),
  }))
  const typedShows = applySettlementExpectedShows({
    shows: rawShows,
    chrome: advancingWorkspace?.shows_chrome,
    source: expected.source,
  })
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

  const actuals: SettlementActualLine[] = (actualRows ?? []).flatMap(row => {
    if (!isSettlementActualKind(row.line_kind) || !isSettlementActualStatus(row.status)) return []
    const source = row.source === 'harbour_fixture'
      || row.source === 'advancing_copy'
      || row.source === 'manual'
      || row.source === 'email_scrape'
      ? row.source
      : 'manual'
    return [{
      id: String(row.id),
      run_id: String(row.run_id),
      show_id: (row.show_id as string | null) ?? null,
      line_key: String(row.line_key),
      line_kind: row.line_kind,
      amount: Number(row.amount) || 0,
      status: row.status,
      source,
      notes: (row.notes as string | null) ?? null,
      challenge_id: (row.challenge_id as string | null) ?? null,
      paid: Boolean(row.paid),
      paid_at: (row.paid_at as string | null) ?? null,
      quote_note: (row.quote_note as string | null) ?? null,
      attachment_path: (row.attachment_path as string | null) ?? null,
      attachment_filename: (row.attachment_filename as string | null) ?? null,
      attachment_mime: (row.attachment_mime as string | null) ?? null,
    }]
  })

  return {
    run: {
      id: run.id,
      code: run.code,
      name: run.name,
      status: run.status,
      start_date: dates.start ?? run.start_date,
      end_date: dates.end ?? run.end_date,
      notes: (run.notes as string | null) ?? null,
    },
    shows: typedShows,
    liveFields: expected.fields,
    expectedSource: expected.source,
    settlement,
    bandCosts: (bandCosts ?? []) as BandCostLine[],
    remittanceLines: (remittanceLines ?? []) as RemittanceLine[],
    agentSettlementLines: (agentLines ?? []) as AgentSettlementLine[],
    challenges: typedChallenges,
    actuals,
    insideFactors: insideFactorsFromRows((factorRows ?? []) as Array<{ key: string; value: unknown; category?: string | null }>),
    remittanceKnownLines: ((remittanceLines ?? []) as RemittanceLine[]).map(line => ({
      showId: line.show_id,
      description: line.description,
      amount: Number(line.amount) || 0,
    })),
    gstKnownLines: [
      ...((remittanceLines ?? []) as RemittanceLine[]).map(line => ({
        showId: line.show_id,
        description: line.description,
        amount: Number(line.amount) || 0,
      })),
      ...((agentLines ?? []) as AgentSettlementLine[]).map(line => ({
        showId: line.show_id,
        description: line.description,
        amount: Number(line.amount) || 0,
      })),
    ],
    assessmentMessages: mapAssessmentMessages(assessmentMessagesResult),
  }
}

function mapAssessmentMessages(result: { data: unknown; error: { message?: string } | null }): SettlementAssessmentMessage[] {
  if (result.error) return []
  const rows = Array.isArray(result.data) ? result.data : []
  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    run_id: String(row.run_id),
    show_id: (row.show_id as string | null) ?? null,
    author_id: (row.author_id as string | null) ?? null,
    author_name: String(row.author_name ?? 'Operator'),
    body: String(row.body ?? ''),
    created_at: String(row.created_at ?? ''),
  }))
}
