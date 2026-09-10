import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { actorCanSelfServeWrite, actorCanReadProfilePii } from '@/lib/profile-access'
import {
  mergeProfileAndPassport,
  pickPublicProfile,
  sanitizeProfileSelfPatch,
} from '@/lib/profile-self'

/**
 * Own-profile read/write.
 * Auth via user session, then createAdminClient (same pattern as advancement_items).
 * Always scoped to auth.uid() — never another user's row.
 * Does not writeAuditLog (passport / FF / mobile / DOB must not hit the trail).
 */

export async function GET() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json(null)

  if (profile.deactivated_at) {
    return NextResponse.json({ error: 'Account disabled', deactivated: true }, { status: 403 })
  }

  if (!actorCanReadProfilePii({ id: user.id, role: profile.role }, user.id)) {
    return NextResponse.json(null, { status: 403 })
  }

  const { data: passport } = await admin
    .from('profile_passports')
    .select('*')
    .eq('profile_id', user.id)
    .maybeSingle()

  return NextResponse.json(pickPublicProfile(mergeProfileAndPassport(profile, passport)))
}

export async function PATCH(req: NextRequest) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('profiles')
    .select('id, full_name, email, role, deactivated_at')
    .eq('id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (existing.deactivated_at) {
    return NextResponse.json({ error: 'Account disabled', deactivated: true }, { status: 403 })
  }

  const targetId = user.id
  if (!actorCanSelfServeWrite({ id: user.id, role: existing.role }, targetId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid profile payload' }, { status: 400 })
  }

  const result = sanitizeProfileSelfPatch(body, {
    full_name: existing.full_name ?? '',
    email: existing.email ?? '',
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  let profileRow = existing as Record<string, unknown>
  if (Object.keys(result.profilePatch).length > 0) {
    const { data, error } = await admin
      .from('profiles')
      .update(result.profilePatch)
      .eq('id', targetId)
      .select('*')
      .single()
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Could not save profile' }, { status: 500 })
    }
    profileRow = data
  } else {
    const { data } = await admin.from('profiles').select('*').eq('id', targetId).single()
    if (data) profileRow = data
  }

  let passportRow: Record<string, unknown> | null = null
  if (Object.keys(result.passportPatch).length > 0) {
    const { data, error } = await admin
      .from('profile_passports')
      .upsert(
        {
          profile_id: targetId,
          ...result.passportPatch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id' },
      )
      .select('*')
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    passportRow = data
  } else {
    const { data } = await admin
      .from('profile_passports')
      .select('*')
      .eq('profile_id', targetId)
      .maybeSingle()
    passportRow = data
  }

  return NextResponse.json(pickPublicProfile(mergeProfileAndPassport(profileRow, passportRow)))
}
