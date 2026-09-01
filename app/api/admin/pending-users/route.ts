import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const pending = data.users
    .filter(u => u.invited_at && !u.confirmed_at)
    .map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name ?? null,
      role: u.user_metadata?.role ?? null,
      invited_at: u.invited_at,
    }))

  return NextResponse.json({ pending })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
