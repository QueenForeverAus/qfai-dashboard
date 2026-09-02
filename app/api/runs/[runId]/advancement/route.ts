import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ADVANCEMENT_CHECKLIST } from '@/lib/advancement-checklist'

async function resolveRunId(supabase: ReturnType<typeof createAdminClient>, runIdOrCode: string): Promise<string | null> {
  // Try as UUID first; if it looks like a code, look it up
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(runIdOrCode)) return runIdOrCode
  const { data } = await supabase.from('runs').select('id').eq('code', runIdOrCode.toUpperCase()).single()
  return data?.id ?? null
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

  const { data, error } = await supabase
    .from('advancement_items')
    .select('*')
    .eq('run_id', runId)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-seed if empty
  if (!data || data.length === 0) {
    const rows = ADVANCEMENT_CHECKLIST.map(item => ({
      run_id: runId,
      category: item.category,
      item_key: item.item_key,
      label: item.label,
      assigned_to: item.assigned_to,
      sort_order: item.sort_order,
      payment_type: item.payment_type ?? null,
      status: 'pending',
    }))
    const { data: seeded, error: seedErr } = await supabase
      .from('advancement_items')
      .insert(rows)
      .select()
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
    return NextResponse.json(seeded ?? [])
  }

  return NextResponse.json(data)
}
