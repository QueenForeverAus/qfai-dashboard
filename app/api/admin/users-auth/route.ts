import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  const [authRes, profilesRes] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from('profiles').select('id, full_name, email, role').order('role'),
  ])

  if (authRes.error) return NextResponse.json({ error: authRes.error.message }, { status: 500 })

  const authById: Record<string, string | null> = {}
  for (const u of authRes.data.users) {
    authById[u.id] = u.last_sign_in_at ?? null
  }

  const profiles = (profilesRes.data ?? []).map(p => ({
    ...p,
    last_sign_in_at: authById[p.id] ?? null,
  }))

  return NextResponse.json({ profiles })
}
