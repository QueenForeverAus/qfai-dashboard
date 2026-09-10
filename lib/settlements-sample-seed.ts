/**
 * Staging-only, idempotent SAMPLE completed-show seed (SAMP01–SAMP08).
 * Reuses existing tables: runs, shows, cost_fields, run_advancing_workspaces,
 * advancing_cost_fields, settlement_actual_lines, remittance_lines, run_settlements.
 * Never mutates R01 / TRECV1 / TCOMP1 / R12.
 *
 * Booking status is always BOOKED (`confirmed`) so Run Advancing stays open.
 * Settlements completed-only still lists these runs via past show_date.
 * Re-seed must not flip SAMPLE runs to post_show/settled.
 */

import { classifyRunRegion } from './region-classify.ts'
import { syncRunDatesFromShows } from './run-dates.ts'
import { buildAdvancingShowsChrome } from './run-advancing.ts'
import { loadActiveAdvancingWorkspace } from './run-advancing-persist.ts'
import {
  CONFIRMED_FIELD_STATE,
  ENTRY_EXEMPT_FIELD_KEYS,
  defaultCostEntryDescription,
  ensureMinimumEntry,
} from './cost-fields.ts'
import {
  SAMPLE_RUN_BOOKING_STATUS,
  isProtectedSettlementsSeedCode,
  isSettlementsSampleCode,
  isSettlementsSeedTargetAllowed,
  SETTLEMENTS_SAMPLE_FIXTURES,
  type SampleCostLine,
  type SettlementsSampleFixture,
} from './settlements-sample-fixtures.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'

type AdminClient = ReturnType<typeof createAdminClient>

const SAMPLE_SOURCE = 'SAMPLE DEMO seed — invented figures, not live QF costings'

export type SeedSettlementsSamplesResult = {
  ok: true
  seeded: Array<{
    code: string
    action: 'created' | 'updated'
    lifecycle: SettlementsSampleFixture['lifecycle']
    accuracy: SettlementsSampleFixture['accuracy']
    run_id: string
    show_id: string
  }>
}

export async function seedSettlementsSamples(opts: {
  admin: AdminClient
  supabaseUrl: string
  actorId?: string | null
}): Promise<SeedSettlementsSamplesResult> {
  if (!isSettlementsSeedTargetAllowed(opts.supabaseUrl)) {
    throw new SeedTargetError('Refusing SAMPLE seed — this Supabase URL looks like production.')
  }

  const seeded: SeedSettlementsSamplesResult['seeded'] = []
  for (const fixture of SETTLEMENTS_SAMPLE_FIXTURES) {
    if (isProtectedSettlementsSeedCode(fixture.code)) {
      throw new SeedTargetError(`Refusing to touch protected code ${fixture.code}`)
    }
    const row = await upsertSampleRun(opts.admin, fixture, opts.actorId ?? null)
    seeded.push(row)
  }
  return { ok: true, seeded }
}

class SeedTargetError extends Error {
  readonly status = 403
}

export { SeedTargetError }

async function upsertSampleRun(
  admin: AdminClient,
  fixture: SettlementsSampleFixture,
  actorId: string | null,
): Promise<SeedSettlementsSamplesResult['seeded'][number]> {
  const existing = await admin
    .from('runs')
    .select('id, code, name, notes')
    .eq('code', fixture.code)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)
  if (existing.data && !isSafeSampleRun(existing.data)) {
    throw new SeedTargetError(
      `Run ${fixture.code} exists but is not tagged SAMPLE/DEMO — refusing to overwrite.`,
    )
  }

  const region = classifyRunRegion([{
    state_territory: fixture.show.state_territory,
    venue_city: fixture.show.venue_city,
  }])
  // BOOKED (`confirmed`) so Advancing stays open. Settlements uses past show_date.
  // Do not seed post_show/settled — that regresses Advancing for SAMPLE test vehicles.
  const now = new Date().toISOString()
  const runPayload = {
    code: fixture.code,
    name: fixture.name,
    notes: fixture.notes,
    status: SAMPLE_RUN_BOOKING_STATUS,
    region,
    updated_at: now,
  }

  let runId: string
  let action: 'created' | 'updated'
  if (existing.data) {
    const { error } = await admin.from('runs').update(runPayload).eq('id', existing.data.id)
    if (error) throw new Error(error.message)
    runId = existing.data.id
    action = 'updated'
  } else {
    const { data, error } = await admin.from('runs').insert({
      ...runPayload,
      start_date: fixture.show.show_date,
      end_date: fixture.show.show_date,
    }).select('id').single()
    if (error || !data) throw new Error(error?.message ?? `Failed to insert ${fixture.code}`)
    runId = data.id
    action = 'created'
  }

  const showId = await upsertSampleShow(admin, runId, fixture)
  await syncRunDatesFromShows(admin, runId)
  const costFields = await upsertSampleCostFields(admin, runId, showId, fixture)
  await upsertAdvancingWorkspace(admin, runId, showId, fixture, costFields, actorId)
  await upsertSettlementLifecycle(admin, runId, showId, fixture, actorId, now)

  return {
    code: fixture.code,
    action,
    lifecycle: fixture.lifecycle,
    accuracy: fixture.accuracy,
    run_id: runId,
    show_id: showId,
  }
}

function isSafeSampleRun(run: { code?: string | null; name?: string | null; notes?: string | null }): boolean {
  if (isProtectedSettlementsSeedCode(run.code)) return false
  if (!isSettlementsSampleCode(run.code)) return false
  return /\b(sample|demo)\b/i.test(`${run.name ?? ''} ${run.notes ?? ''}`)
}

async function upsertSampleShow(
  admin: AdminClient,
  runId: string,
  fixture: SettlementsSampleFixture,
): Promise<string> {
  const show = fixture.show
  const payload = {
    run_id: runId,
    show_order: show.show_order,
    venue_name: show.venue_name,
    venue_city: show.venue_city,
    state_territory: show.state_territory,
    show_date: show.show_date,
    capacity: show.capacity,
    ticket_price: show.ticket_price,
    tickets_sold: show.tickets_sold,
    booking_fee_per_payer: show.booking_fee_per_payer ?? 5,
    rights_payer: 'venue',
  }

  const { data: existing } = await admin
    .from('shows')
    .select('id')
    .eq('run_id', runId)
    .eq('show_order', show.show_order)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await admin.from('shows').update(payload).eq('id', existing.id)
    if (error) throw new Error(error.message)
    return existing.id
  }

  const { data, error } = await admin.from('shows').insert(payload).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to insert SAMPLE show')
  return data.id
}

type CostFieldRow = {
  id: string
  field_key: string
  show_id: string | null
  category: string
  label: string
  value: number | null
  state: string
  source: string | null
  entries: unknown
  line_items: unknown
}

async function upsertSampleCostFields(
  admin: AdminClient,
  runId: string,
  showId: string,
  fixture: SettlementsSampleFixture,
): Promise<CostFieldRow[]> {
  const { data: existing } = await admin
    .from('cost_fields')
    .select('id, field_key, show_id, category, label, value, state, source, entries, line_items')
    .eq('run_id', runId)

  const byKey = new Map(
    (existing ?? []).map(row => [`${row.show_id ?? 'run'}::${row.field_key}`, row]),
  )
  const saved: CostFieldRow[] = []

  const paidAt = `${fixture.show.show_date}T10:00:00.000Z`
  for (const line of fixture.advancing) {
    const row = costFieldPayload(runId, showId, line, paidAt)
    const key = `${row.show_id ?? 'run'}::${row.field_key}`
    const found = byKey.get(key)
    if (found) {
      const { data, error } = await admin
        .from('cost_fields')
        .update(row)
        .eq('id', found.id)
        .select('id, field_key, show_id, category, label, value, state, source, entries, line_items')
        .single()
      if (error || !data) throw new Error(error?.message ?? `Failed to update cost field ${line.field_key}`)
      saved.push(data as CostFieldRow)
    } else {
      const { data, error } = await admin
        .from('cost_fields')
        .insert(row)
        .select('id, field_key, show_id, category, label, value, state, source, entries, line_items')
        .single()
      if (error || !data) throw new Error(error?.message ?? `Failed to insert cost field ${line.field_key}`)
      saved.push(data as CostFieldRow)
    }
  }

  return saved
}

export function sampleCostFieldState(line: SampleCostLine): string {
  if (line.state) return line.state
  if (line.entryPaid === true || line.entryConfirmed === true) return CONFIRMED_FIELD_STATE
  return 'estimated'
}

export function buildSampleCostFieldEntries(
  line: SampleCostLine,
  paidAt?: string | null,
) {
  if (ENTRY_EXEMPT_FIELD_KEYS.has(line.field_key)) return []
  if (line.field_key === 'flights' && /duplicate/i.test(line.notes ?? '')) {
    return [
      moneyEntry('SAMPLE flight SYD→DRW', line.amount / 2, line, paidAt),
      moneyEntry('SAMPLE flight SYD→DRW (duplicate)', line.amount / 2, line, paidAt),
    ]
  }
  const description = defaultCostEntryDescription(line.field_key, line.label)
  return ensureMinimumEntry([], description, line.amount).map(entry =>
    moneyEntry(entry.description, entry.amount, line, paidAt),
  )
}

function costFieldPayload(
  runId: string,
  showId: string,
  line: SampleCostLine,
  paidAt?: string | null,
) {
  return {
    run_id: runId,
    show_id: line.scope === 'show' ? showId : null,
    category: line.category,
    field_key: line.field_key,
    label: line.label,
    value: line.amount,
    state: sampleCostFieldState(line),
    source: line.notes ? `${SAMPLE_SOURCE}. ${line.notes}` : SAMPLE_SOURCE,
    entries: buildSampleCostFieldEntries(line, paidAt),
    ...(line.field_key === 'venue_staff' ? { line_items: [] } : {}),
  }
}

function moneyEntry(
  description: string,
  amount: number,
  line: SampleCostLine,
  paidAt?: string | null,
) {
  const paid = line.entryPaid === true
  const confirmed = paid || line.entryConfirmed === true
  return {
    id: crypto.randomUUID(),
    description,
    notes: 'SAMPLE',
    amount,
    gst_included: true,
    confirmed,
    paid,
    paid_at: paid ? (paidAt ?? new Date().toISOString()) : null,
  }
}

async function upsertAdvancingWorkspace(
  admin: AdminClient,
  runId: string,
  showId: string,
  fixture: SettlementsSampleFixture,
  costFields: CostFieldRow[],
  actorId: string | null,
): Promise<void> {
  const existingWorkspace = await loadActiveAdvancingWorkspace(admin, runId)
  const chrome = buildAdvancingShowsChrome([{
    id: showId,
    ticket_price: fixture.show.ticket_price,
    capacity: fixture.show.capacity,
    capacity_bands: null,
    booking_fee_per_payer: fixture.show.booking_fee_per_payer ?? 5,
    cc_fee_pct: null,
  }])
  const now = new Date().toISOString()

  let workspaceId: string
  if (!existingWorkspace) {
    const { data, error } = await admin
      .from('run_advancing_workspaces')
      .insert({
        run_id: runId,
        copied_at: now,
        copied_by: actorId,
        shows_chrome: chrome,
        updated_at: now,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Failed to insert Advancing workspace')
    workspaceId = data.id
  } else {
    const { error } = await admin
      .from('run_advancing_workspaces')
      .update({ shows_chrome: chrome, updated_at: now })
      .eq('id', existingWorkspace.id)
    if (error) throw new Error(error.message)
    workspaceId = existingWorkspace.id
  }

  const { data: existingFields } = await admin
    .from('advancing_cost_fields')
    .select('id, field_key, show_id')
    .eq('workspace_id', workspaceId)

  const byKey = new Map(
    (existingFields ?? []).map(row => [`${row.show_id ?? 'run'}::${row.field_key}`, row]),
  )

  for (const field of costFields) {
    const key = `${field.show_id ?? 'run'}::${field.field_key}`
    const row = {
      workspace_id: workspaceId,
      run_id: runId,
      source_cost_field_id: field.id,
      show_id: field.show_id,
      category: field.category,
      field_key: field.field_key,
      label: field.label,
      value: field.value,
      state: field.state,
      source: field.source,
      entries: field.entries,
      line_items: field.line_items,
      updated_at: now,
    }
    const found = byKey.get(key)
    if (found) {
      const { error } = await admin.from('advancing_cost_fields').update(row).eq('id', found.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await admin.from('advancing_cost_fields').insert(row)
      if (error) throw new Error(error.message)
    }
  }
}

async function upsertSettlementLifecycle(
  admin: AdminClient,
  runId: string,
  showId: string,
  fixture: SettlementsSampleFixture,
  actorId: string | null,
  now: string,
): Promise<void> {
  const remittanceStatus = fixture.lifecycle === 'settled_remitted' ? 'accepted' : 'open'
  const settlementRow = {
    remittance_status: remittanceStatus,
    remittance_accepted_at: remittanceStatus === 'accepted' ? now : null,
    remittance_accepted_by: remittanceStatus === 'accepted' ? actorId : null,
    updated_at: now,
  }

  const { data: existingSettlement } = await admin
    .from('run_settlements')
    .select('run_id')
    .eq('run_id', runId)
    .maybeSingle()

  if (existingSettlement) {
    const { error } = await admin.from('run_settlements').update(settlementRow).eq('run_id', runId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin.from('run_settlements').insert({
      run_id: runId,
      ...settlementRow,
      created_at: now,
    })
    if (error) throw new Error(error.message)
  }

  if (fixture.lifecycle !== 'not_settled') {
    for (const line of fixture.actuals) {
      const kind = line.line_key.startsWith('run:') ? 'band_cost' : 'venue_settlement'
      const row = {
        run_id: runId,
        show_id: showId,
        line_key: line.line_key,
        line_kind: kind,
        amount: line.amount,
        notes: line.notes ?? SAMPLE_SOURCE,
        status: 'confirmed' as const,
        source: 'harbour_fixture' as const,
        paid: false,
        paid_at: null,
        updated_at: now,
        created_by: actorId,
      }
      const { data: found } = await admin
        .from('settlement_actual_lines')
        .select('id')
        .eq('run_id', runId)
        .eq('line_key', line.line_key)
        .eq('show_id', showId)
        .maybeSingle()
      if (found?.id) {
        const { error } = await admin.from('settlement_actual_lines').update(row).eq('id', found.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await admin.from('settlement_actual_lines').insert(row)
        if (error) throw new Error(error.message)
      }
    }
  }

  if (fixture.lifecycle === 'settled_remitted' && fixture.remittanceAmount != null) {
    const description = 'SAMPLE remittance — Harbour cash received'
    const { data: found } = await admin
      .from('remittance_lines')
      .select('id')
      .eq('run_id', runId)
      .eq('description', description)
      .maybeSingle()
    const remit = {
      run_id: runId,
      show_id: showId,
      line_type: 'payment' as const,
      description,
      amount: fixture.remittanceAmount,
      occurred_on: fixture.show.show_date,
      reference: `SAMPLE-${fixture.code}`,
      notes: SAMPLE_SOURCE,
      created_by: actorId,
    }
    if (found?.id) {
      const { error } = await admin.from('remittance_lines').update(remit).eq('id', found.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await admin.from('remittance_lines').insert(remit)
      if (error) throw new Error(error.message)
    }
  }
}
