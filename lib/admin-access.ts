import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { isAdminOrOwner } from '@/lib/role-access'

export type AdminOwnerActor = {
  userId: string
  fullName: string
  role: string
}

/** Session + profiles.role in (admin, owner). Same pattern as other admin routes. */
export async function getAdminOwnerActor(): Promise<AdminOwnerActor | null> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()

  if (!profile || !isAdminOrOwner(profile.role)) return null
  return {
    userId: user.id,
    fullName: profile.full_name ?? '',
    role: profile.role,
  }
}
