import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { writeAuditLog, auditFieldDiffs, setAuditActor } from '@/lib/audit-log'
import { getSettlementsActor, resolveSettlementsRun } from '@/lib/settlements-access'
import { showHasOccurred } from '@/lib/settlements-sheet'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const actor = await getSettlementsActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { runId } = await params
  const admin = createAdminClient()
  const run = await resolveSettlementsRun(admin, runId)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { show_id?: string; tickets_sold?: number | null }
  const showId = String(body.show_id ?? '')
  if (!showId) return NextResponse.json({ error: 'show_id is required' }, { status: 400 })

  let tickets: number | null
  if (body.tickets_sold == null || body.tickets_sold === ('' as unknown)) {
    tickets = null
  } else {
    const n = Number(body.tickets_sold)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'tickets_sold must be a non-negative number' }, { status: 400 })
    }
    tickets = Math.round(n)
  }

  const { data: show } = await admin
    .from('shows')
    .select('id, run_id, show_date, tickets_sold')
    .eq('id', showId)
    .eq('run_id', run.id)
    .maybeSingle()
  if (!show) return NextResponse.json({ error: 'Show not found on this run' }, { status: 404 })
  if (!showHasOccurred(show.show_date)) {
    return NextResponse.json({
      error: 'Data not yet available — check back when the show has occurred.',
    }, { status: 409 })
  }

  await setAuditActor(admin, actor.userId)
  const { data, error } = await admin
    .from('shows')
    .update({ tickets_sold: tickets, updated_by: actor.userId })
    .eq('id', showId)
    .select('id, tickets_sold')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog(
    admin,
    actor.userId,
    auditFieldDiffs(
      'shows',
      showId,
      run.id,
      show as Record<string, unknown>,
      { ...(show as Record<string, unknown>), tickets_sold: tickets },
      ['tickets_sold'],
    ),
  )

  return NextResponse.json(data)
}
