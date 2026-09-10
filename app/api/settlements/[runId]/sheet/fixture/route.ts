import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { showHasOccurred } from '@/lib/settlements-sheet'
import {
  formatSheetActualAuditCopy,
  harbourFixtureLinesForVenue,
} from '@/lib/settlements-sheet-actuals'
import { BNZ_NETTED_DEPOSIT_LINES } from '@/lib/settlements-v3-bnz'
import { classifySettlementLine } from '@/lib/settlements-v3-buckets'

function kindForKey(lineKey: string) {
  if (lineKey.startsWith('run:')) return 'band_cost' as const
  return 'venue_settlement' as const
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const admin = createAdminClient()
  const run = await resolveSettlementsRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { show_id?: string | null; kind?: string }
  const { data: shows } = await admin
    .from('shows')
    .select('id, venue_name, show_date, run_id')
    .eq('run_id', run.id)

  const bnz = body.kind === 'bnz'
  const targets = (shows ?? []).filter(show => {
    if (!showHasOccurred(show.show_date)) return false
    if (body.show_id && show.id !== body.show_id) return false
    if (bnz) return true
    return harbourFixtureLinesForVenue(show.venue_name).length > 0
  })

  if (targets.length === 0) {
    return NextResponse.json({
      error: bnz
        ? 'No occurred show for a BNZ-shaped fixture on this run'
        : 'No Harbour fixture for an occurred show on this run',
    }, { status: 404 })
  }

  const now = new Date().toISOString()
  const saved = []
  for (const show of targets) {
    const fixtureLines = bnz
      ? bnzLinesAsActuals()
      : harbourFixtureLinesForVenue(show.venue_name)
    for (const line of fixtureLines) {
      const row = {
        run_id: run.id,
        show_id: show.id,
        line_key: line.line_key,
        line_kind: kindForKey(line.line_key),
        amount: line.amount,
        notes: line.notes ?? null,
        status: 'confirmed' as const,
        source: 'harbour_fixture' as const,
        paid: false,
        paid_at: null,
        updated_at: now,
        created_by: actor.userId,
      }
      const existing = (await admin
        .from('settlement_actual_lines')
        .select('id')
        .eq('run_id', run.id)
        .eq('line_key', line.line_key)
        .eq('show_id', show.id)
        .maybeSingle()).data
      const query = existing
        ? admin.from('settlement_actual_lines').update(row).eq('id', existing.id).select('*').single()
        : admin.from('settlement_actual_lines').insert(row).select('*').single()
      const result = await query
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
      saved.push(result.data)
    }
    const copy = formatSheetActualAuditCopy({
      actorName: actor.fullName,
      runCode: run.code,
      label: bnz ? 'BNZ-shaped fixture' : 'Harbour fixture',
      amount: fixtureLines.reduce((n, l) => n + l.amount, 0),
      source: 'harbour_fixture',
      showLabel: show.venue_name,
    })
    await writeAuditLog(admin, actor.userId, [{
      table_name: 'settlement_actual_lines',
      record_id: run.id,
      run_id: run.id,
      field_name: copy.fieldName,
      old_value: null,
      new_value: copy.newValue,
      change_type: 'update',
    }])
  }

  return NextResponse.json({
    lines: saved,
    note: bnz
      ? 'BNZ-shaped fixture applied as confirmed. Invented lines — not OCR.'
      : 'Harbour fixture applied as confirmed. Not OCR.',
  }, { status: 201 })
}

function bnzLinesAsActuals(): Array<{ line_key: string; amount: number; notes?: string }> {
  const bucketCount: Record<string, number> = {}
  const out: Array<{ line_key: string; amount: number; notes?: string }> = []
  for (const raw of BNZ_NETTED_DEPOSIT_LINES) {
    const classified = classifySettlementLine(raw)
    if (classified.kind === 'due_to_hirer') {
      out.push({ line_key: 'show:due_to_hirer', amount: raw.amount, notes: raw.description })
      continue
    }
    if (classified.kind === 'tickets') {
      out.push({ line_key: 'gross_ticket_sales', amount: raw.amount, notes: raw.description })
      continue
    }
    if (classified.kind === 'inside') {
      const n = (bucketCount.inside = (bucketCount.inside ?? 0) + 1)
      out.push({ line_key: `inside_pre_commission::${n}`, amount: raw.amount, notes: raw.description })
      continue
    }
    if (classified.kind === 'deposit') {
      out.push({ line_key: 'show:hire_deposit', amount: raw.amount, notes: raw.description })
      continue
    }
    const parent =
      classified.kind === 'hire' ? 'show:venue_hire'
        : classified.kind === 'staff' ? 'show:venue_staff'
          : classified.kind === 'marketing' ? 'show:venue_marketing'
            : classified.kind === 'production' ? 'show:production_costs'
              : classified.kind === 'other' ? 'show:other'
                : null
    if (!parent) continue
    const n = (bucketCount[parent] = (bucketCount[parent] ?? 0) + 1)
    const line_key = n === 1 && classified.kind !== 'marketing' && classified.kind !== 'other'
      ? parent
      : `${parent}::${slug(raw.description)}`
    out.push({ line_key, amount: raw.amount, notes: raw.description })
  }
  return out
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'line'
}
