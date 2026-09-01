import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = data.users
    .filter(u => u.confirmed_at)
    .map(u => ({
      id: u.id,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }))

  return NextResponse.json({ users })
}
