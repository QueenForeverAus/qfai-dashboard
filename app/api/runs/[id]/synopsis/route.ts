import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { diffAuditFields, insertAuditRows } from '@/lib/audit-log'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { synopsis } = await req.json()
  if (typeof synopsis !== 'string') {
    return NextResponse.json({ error: 'synopsis string required' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data: existing } = await supabase.from('runs').select('id, synopsis').eq('id', id).single()
  const nextSynopsis = synopsis.trim() || null
  const { data, error } = await supabase
    .from('runs')
    .update({ synopsis: nextSynopsis })
    .eq('id', id)
    .select('id, synopsis')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing) {
    await insertAuditRows(
      supabase,
      user.id,
      diffAuditFields(
        'runs',
        id,
        id,
        existing as Record<string, unknown>,
        data as Record<string, unknown>,
        ['synopsis'],
      ),
    )
  }
  return NextResponse.json(data)
}
