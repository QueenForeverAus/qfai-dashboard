import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ADVANCEMENT_CHECKLIST } from '@/lib/advancement-checklist'

async function resolveRunId(supabase: ReturnType<typeof createAdminClient>, runIdOrCode: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(runIdOrCode)) return runIdOrCode
  const { data } = await supabase.from('runs').select('id').eq('code', runIdOrCode.toUpperCase()).single()
  return data?.id ?? null
}

type SeedRow = {
  run_id: string
  show_id: string | null
  category: string
  item_key: string
  label: string
  assigned_to: string
  sort_order: number
  payment_type: string | null
  status: string
  notes?: string | null
  paid?: boolean
}

function buildSeedRows(
  runId: string,
  shows: { id: string; show_order: number }[],
  existing: { item_key: string; show_id: string | null; status: string; notes: string | null; paid: boolean }[],
): SeedRow[] {
  const runItems = ADVANCEMENT_CHECKLIST.filter(i => i.scope === 'run')
  const showItems = ADVANCEMENT_CHECKLIST.filter(i => i.scope === 'show')
  const rows: SeedRow[] = []

  const has = (key: string, showId: string | null) =>
    existing.some(e => e.item_key === key && (e.show_id ?? null) === showId)

  // Orphan show-scoped rows (pre-migration): copy state onto first show only
  const orphans = existing.filter(e => e.show_id == null && showItems.some(s => s.item_key === e.item_key))
  const firstShowId = shows[0]?.id ?? null

  for (const item of runItems) {
    if (!has(item.item_key, null)) {
      rows.push({
        run_id: runId,
        show_id: null,
        category: item.category,
        item_key: item.item_key,
        label: item.label,
        assigned_to: item.assigned_to,
        sort_order: item.sort_order,
        payment_type: item.payment_type ?? null,
        status: 'pending',
      })
    }
  }

  for (const show of shows) {
    for (const item of showItems) {
      if (has(item.item_key, show.id)) continue
      const orphan = show.id === firstShowId
        ? orphans.find(o => o.item_key === item.item_key)
        : undefined
      rows.push({
        run_id: runId,
        show_id: show.id,
        category: item.category,
        item_key: item.item_key,
        label: item.label,
        assigned_to: item.assigned_to,
        sort_order: item.sort_order,
        payment_type: item.payment_type ?? null,
        status: orphan?.status ?? 'pending',
        notes: orphan?.notes ?? null,
        paid: orphan?.paid ?? false,
      })
    }
  }

  return rows
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId: runIdParam } = await params

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const runId = await resolveRunId(supabase, runIdParam)
  if (!runId) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const [{ data: existing, error }, { data: shows }] = await Promise.all([
    supabase.from('advancement_items').select('*').eq('run_id', runId).order('sort_order'),
    supabase.from('shows').select('id, show_order, venue_name, venue_city, show_date').eq('run_id', runId).order('show_order'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const showList = (shows ?? []).map(s => ({ id: s.id as string, show_order: s.show_order as number }))
  const current = existing ?? []

  const toInsert = buildSeedRows(runId, showList, current.map(e => ({
    item_key: e.item_key as string,
    show_id: (e.show_id as string | null) ?? null,
    status: e.status as string,
    notes: (e.notes as string | null) ?? null,
    paid: Boolean(e.paid),
  })))

  if (toInsert.length > 0) {
    const { error: seedErr } = await supabase.from('advancement_items').insert(toInsert)
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
  }

  // Drop orphan show-scoped rows (show_id null) once per-show copies exist
  const showKeys = new Set(ADVANCEMENT_CHECKLIST.filter(i => i.scope === 'show').map(i => i.item_key))
  const orphanIds = current
    .filter(e => e.show_id == null && showKeys.has(e.item_key as string))
    .map(e => e.id as string)

  if (orphanIds.length > 0 && showList.length > 0) {
    // Only delete after we know inserts succeeded / per-show rows exist
    const { data: after } = await supabase
      .from('advancement_items')
      .select('id, item_key, show_id')
      .eq('run_id', runId)
    const hasPerShow = (key: string) => (after ?? []).some(r => r.item_key === key && r.show_id != null)
    const safeDelete = orphanIds.filter(id => {
      const row = current.find(c => c.id === id)
      return row && hasPerShow(row.item_key as string)
    })
    if (safeDelete.length > 0) {
      await supabase.from('advancement_items').delete().in('id', safeDelete)
    }
  }

  const { data: final, error: finalErr } = await supabase
    .from('advancement_items')
    .select('*')
    .eq('run_id', runId)
    .order('sort_order')

  if (finalErr) return NextResponse.json({ error: finalErr.message }, { status: 500 })
  return NextResponse.json(final ?? [])
}
