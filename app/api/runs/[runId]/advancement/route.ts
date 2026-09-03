import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  ADVANCEMENT_CHECKLIST,
  KNOWN_ITEM_KEYS,
  LEGACY_STATUS_SOURCES,
  normalizeAssignedTo,
} from '@/lib/advancement-checklist'

async function resolveRunId(supabase: ReturnType<typeof createAdminClient>, runIdOrCode: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(runIdOrCode)) return runIdOrCode
  const { data } = await supabase.from('runs').select('id').eq('code', runIdOrCode.toUpperCase()).single()
  return data?.id ?? null
}

type ExistingRow = {
  id: string
  item_key: string
  show_id: string | null
  status: string
  notes: string | null
  paid: boolean
  category: string
  label: string
  assigned_to: string
  sort_order: number
  payment_type: string | null
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

function inheritStatus(
  itemKey: string,
  showId: string | null,
  existing: ExistingRow[],
): { status: string; notes: string | null; paid: boolean } {
  const sources = LEGACY_STATUS_SOURCES[itemKey]
  if (!sources || sources.length === 0) {
    return { status: 'pending', notes: null, paid: false }
  }
  const rows = sources
    .map(k => existing.find(e => e.item_key === k && (e.show_id ?? null) === showId))
    .filter(Boolean) as ExistingRow[]
  if (rows.length === 0) return { status: 'pending', notes: null, paid: false }
  if (rows.every(r => r.status === 'done')) return { status: 'done', notes: null, paid: false }
  if (rows.every(r => r.status === 'n_a')) return { status: 'n_a', notes: null, paid: false }
  return { status: 'pending', notes: null, paid: false }
}

function buildSeedRows(
  runId: string,
  shows: { id: string; show_order: number }[],
  existing: ExistingRow[],
): SeedRow[] {
  const runItems = ADVANCEMENT_CHECKLIST.filter(i => i.scope === 'run')
  const showItems = ADVANCEMENT_CHECKLIST.filter(i => i.scope === 'show')
  const rows: SeedRow[] = []

  const has = (key: string, showId: string | null) =>
    existing.some(e => e.item_key === key && (e.show_id ?? null) === showId)

  // Keys that were previously run-scoped but are now show-scoped (copy state onto each show)
  const showKeys = new Set(showItems.map(s => s.item_key))
  const runOrphansForShowKeys = existing.filter(
    e => e.show_id == null && showKeys.has(e.item_key),
  )

  for (const item of runItems) {
    if (has(item.item_key, null)) continue
    const inherited = inheritStatus(item.item_key, null, existing)
    rows.push({
      run_id: runId,
      show_id: null,
      category: item.category,
      item_key: item.item_key,
      label: item.label,
      assigned_to: item.assigned_to,
      sort_order: item.sort_order,
      payment_type: item.payment_type ?? null,
      status: inherited.status,
      notes: inherited.notes,
      paid: inherited.paid,
    })
  }

  for (const show of shows) {
    for (const item of showItems) {
      if (has(item.item_key, show.id)) continue
      const runOrphan = runOrphansForShowKeys.find(o => o.item_key === item.item_key)
      const inherited = inheritStatus(item.item_key, show.id, existing)
      rows.push({
        run_id: runId,
        show_id: show.id,
        category: item.category,
        item_key: item.item_key,
        label: item.label,
        assigned_to: item.assigned_to,
        sort_order: item.sort_order,
        payment_type: item.payment_type ?? null,
        status: runOrphan?.status ?? inherited.status,
        notes: runOrphan?.notes ?? inherited.notes,
        paid: runOrphan?.paid ?? inherited.paid,
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
  const current = (existing ?? []).map(e => ({
    id: e.id as string,
    item_key: e.item_key as string,
    show_id: (e.show_id as string | null) ?? null,
    status: e.status as string,
    notes: (e.notes as string | null) ?? null,
    paid: Boolean(e.paid),
    category: e.category as string,
    label: e.label as string,
    assigned_to: e.assigned_to as string,
    sort_order: e.sort_order as number,
    payment_type: (e.payment_type as string | null) ?? null,
  }))

  const toInsert = buildSeedRows(runId, showList, current)

  if (toInsert.length > 0) {
    const { error: seedErr } = await supabase.from('advancement_items').insert(toInsert)
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
  }

  // Sync category / label / assigned_to / sort_order / payment_type for known keys
  const checklistByKey = new Map(ADVANCEMENT_CHECKLIST.map(i => [i.item_key, i]))
  const syncUpdates: PromiseLike<unknown>[] = []
  for (const row of current) {
    const def = checklistByKey.get(row.item_key)
    if (!def) continue
    const expectedScopeShow = def.scope === 'show'
    const isShowRow = row.show_id != null
    if (expectedScopeShow !== isShowRow) continue // leave wrong-scope legacy row alone
    const nextAssigned = def.assigned_to
    const needsSync =
      row.category !== def.category ||
      row.label !== def.label ||
      normalizeAssignedTo(row.assigned_to) !== nextAssigned ||
      row.assigned_to !== nextAssigned ||
      row.sort_order !== def.sort_order ||
      (row.payment_type ?? null) !== (def.payment_type ?? null)
    if (needsSync) {
      syncUpdates.push(
        supabase.from('advancement_items').update({
          category: def.category,
          label: def.label,
          assigned_to: nextAssigned,
          sort_order: def.sort_order,
          payment_type: def.payment_type ?? null,
        }).eq('id', row.id),
      )
    }
  }
  if (syncUpdates.length > 0) await Promise.all(syncUpdates)

  // Soft-ignore: do not delete legacy keys. Drop only wrong-scope orphans once
  // per-show (or run) copies of the same key exist in the new scope.
  const showKeys = new Set(ADVANCEMENT_CHECKLIST.filter(i => i.scope === 'show').map(i => i.item_key))
  const runOrphanIds = current
    .filter(e => e.show_id == null && showKeys.has(e.item_key))
    .map(e => e.id)

  if (runOrphanIds.length > 0 && showList.length > 0) {
    const { data: after } = await supabase
      .from('advancement_items')
      .select('id, item_key, show_id')
      .eq('run_id', runId)
    const hasPerShow = (key: string) => (after ?? []).some(r => r.item_key === key && r.show_id != null)
    const safeDelete = runOrphanIds.filter(id => {
      const row = current.find(c => c.id === id)
      return row && hasPerShow(row.item_key)
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

  // Only return known checklist keys (legacy keys soft-ignored in UI)
  const filtered = (final ?? [])
    .filter(row => KNOWN_ITEM_KEYS.has(row.item_key as string))
    .map(row => ({
      ...row,
      assigned_to: normalizeAssignedTo(row.assigned_to as string),
    }))

  return NextResponse.json(filtered)
}
