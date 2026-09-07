import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; lineId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId, lineId } = await params
  const admin = createAdminClient()
  const run = await resolveSettlementsRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { data: existing } = await admin
    .from('remittance_lines')
    .select('id')
    .eq('id', lineId)
    .eq('run_id', run.id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Remittance line not found' }, { status: 404 })

  const { error } = await admin.from('remittance_lines').delete().eq('id', lineId).eq('run_id', run.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
