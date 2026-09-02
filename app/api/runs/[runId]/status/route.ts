import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_STATUSES = ['proposed', 'confirmed', 'declined', 'booking', 'show_week', 'post_show', 'settled']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const { status } = await req.json()

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Require owner or admin
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('runs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', runId)
    .select('id, status, code')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
