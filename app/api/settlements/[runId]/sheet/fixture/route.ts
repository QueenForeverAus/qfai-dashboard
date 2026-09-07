import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { showHasOccurred } from '@/lib/settlements-sheet'
import {
  formatSheetActualAuditCopy,
  harbourFixtureLinesForVenue,
} from '@/lib/settlements-sheet-actuals'

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

  const body = await req.json().catch(() => ({})) as { show_id?: string | null }
  const { data: shows } = await admin
    .from('shows')
    .select('id, venue_name, show_date, run_id')
    .eq('run_id', run.id)

  const targets = (shows ?? []).filter(show => {
    if (!showHasOccurred(show.show_date)) return false
    if (body.show_id && show.id !== body.show_id) return false
    return harbourFixtureLinesForVenue(show.venue_name).length > 0
  })

  if (targets.length === 0) {
    return NextResponse.json({ error: 'No Harbour fixture for an occurred show on this run' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const saved = []
  for (const show of targets) {
    for (const line of harbourFixtureLinesForVenue(show.venue_name)) {
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
      label: 'Harbour fixture',
      amount: harbourFixtureLinesForVenue(show.venue_name).reduce((n, l) => n + l.amount, 0),
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

  return NextResponse.json({ lines: saved, note: 'Harbour fixture applied as confirmed. Not OCR.' }, { status: 201 })
}
