import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { canManagePortalUsers } from '@/lib/user-admin'

export async function requirePortalUserAdmin(): Promise<
  | { ok: true; actor: { id: string; role: string } }
  | { ok: false; res: NextResponse }
> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, deactivated_at')
    .eq('id', user.id)
    .single()

  if (!profile || !canManagePortalUsers(profile.role) || profile.deactivated_at) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, actor: { id: user.id, role: profile.role } }
}
