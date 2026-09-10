import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextResponse } from 'next/server'
import { requirePortalUserAdmin } from '@/lib/require-user-admin'

export async function GET() {
  const gate = await requirePortalUserAdmin()
  if (!gate.ok) return gate.res

  const supabase = createAdminClient()

  const [authRes, profilesRes] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from('profiles').select('id, full_name, email, role, deactivated_at').order('role'),
  ])

  if (authRes.error) return NextResponse.json({ error: authRes.error.message }, { status: 500 })

  const authById: Record<string, { last_sign_in_at: string | null; banned: boolean }> = {}
  for (const u of authRes.data.users) {
    authById[u.id] = {
      last_sign_in_at: u.last_sign_in_at ?? null,
      banned: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
    }
  }

  const profiles = (profilesRes.data ?? []).map(p => ({
    ...p,
    last_sign_in_at: authById[p.id]?.last_sign_in_at ?? null,
    banned: authById[p.id]?.banned ?? false,
  }))

  return NextResponse.json({ profiles })
}
