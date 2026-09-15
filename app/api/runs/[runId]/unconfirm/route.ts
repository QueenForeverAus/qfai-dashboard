import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { staffDisplayName } from '@/lib/cost-entry-source'
import { persistUnconfirm } from '@/lib/unconfirm-persist'
import { UNCONFIRM_WARNING } from '@/lib/unconfirm'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason : null

  const supabase = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  const { data: run } = await supabase.from('runs').select('id, code, status').eq('id', runId).maybeSingle()
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const result = await persistUnconfirm({
    admin: supabase,
    runId: run.id,
    runCode: run.code,
    status: run.status,
    role: profile?.role ?? '',
    actorId: user.id,
    actorName: staffDisplayName(profile?.full_name) ?? 'Someone',
    reason,
  })
  if (!result.ok) return NextResponse.json({ error: result.error, warning: UNCONFIRM_WARNING }, { status: result.status })
  return NextResponse.json({ ok: true, status: run.status, costings_unconfirmed: true, warning: UNCONFIRM_WARNING })
}
