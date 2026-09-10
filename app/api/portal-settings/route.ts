import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { getAdminOwnerActor } from '@/lib/admin-access'
import {
  loadPortalSettings,
  pickPortalSettingsPatch,
  type PortalSettingKey,
} from '@/lib/portal-settings'

export async function GET() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const settings = await loadPortalSettings(createAdminClient())
  return NextResponse.json(settings)
}

export async function PATCH(req: NextRequest) {
  const actor = await getAdminOwnerActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid settings payload' }, { status: 400 })
  }

  const parsed = pickPortalSettingsPatch(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = createAdminClient()
  const now = new Date().toISOString()
  for (const [key, value] of Object.entries(parsed.patch)) {
    const { error } = await supabase
      .from('portal_settings')
      .upsert({ key, value, updated_at: now }, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    void key as PortalSettingKey
  }

  const settings = await loadPortalSettings(supabase)
  return NextResponse.json(settings)
}
