import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { canAccessSettlements } from '@/lib/settlements'

export async function resolveSettlementsRun(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
) {
  const byId = await admin.from('runs').select('id, code, name').eq('id', runId).maybeSingle()
  if (byId.data) return byId.data
  return (await admin.from('runs').select('id, code, name').eq('code', runId.toUpperCase()).maybeSingle()).data
}

export type SettlementsActor = {
  userId: string
  fullName: string
  role: string
}

export async function getSettlementsActor(): Promise<SettlementsActor | null> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()

  if (!profile || !canAccessSettlements(profile.role)) return null
  return {
    userId: user.id,
    fullName: profile.full_name ?? '',
    role: profile.role,
  }
}
