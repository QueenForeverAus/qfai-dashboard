import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { staffDisplayName } from '@/lib/cost-entry-source'
import { persistRebookAfterUnconfirm } from '@/lib/unconfirm-persist'
import { REBOOK_SURE_WARNING } from '@/lib/unconfirm'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  const { data: run } = await supabase.from('runs').select('id, code, status').eq('id', runId).maybeSingle()
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const result = await persistRebookAfterUnconfirm({
    admin: supabase,
    runId: run.id,
    runCode: run.code,
    role: profile?.role ?? '',
    actorId: user.id,
    actorName: staffDisplayName(profile?.full_name) ?? 'Someone',
  })
  if (!result.ok) return NextResponse.json({ error: result.error, warning: REBOOK_SURE_WARNING }, { status: result.status })
  return NextResponse.json({
    ok: true,
    status: run.status,
    costings_unconfirmed: false,
    field_count: result.fieldCount,
  })
}
