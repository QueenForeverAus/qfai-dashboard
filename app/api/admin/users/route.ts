import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { requirePortalUserAdmin } from '@/lib/require-user-admin'
import {
  AUTH_BAN_DURATION,
  isSelfUserAction,
  removeUserMode,
  type AuthUserLike,
} from '@/lib/user-admin'

async function auditRowCountForUser(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  const { count, error } = await admin
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('changed_by', userId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function loadAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<AuthUserLike | null> {
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error || !data.user) return null
  return {
    id: data.user.id,
    invited_at: data.user.invited_at,
    confirmed_at: data.user.confirmed_at,
    email_confirmed_at: data.user.email_confirmed_at,
  }
}

async function deactivateUser(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  existingMeta: Record<string, unknown> | undefined,
) {
  // Keep the profiles row. Never touch audit_log.
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: AUTH_BAN_DURATION,
    app_metadata: { ...existingMeta, deactivated: true },
  })
  if (banError) throw new Error(banError.message)

  await admin.auth.admin.signOut(id, 'global')

  const { error: profileError } = await admin
    .from('profiles')
    .update({ deactivated_at: new Date().toISOString() })
    .eq('id', id)
  if (profileError) throw new Error(profileError.message)
}

async function reactivateUser(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  existingMeta: Record<string, unknown> | undefined,
) {
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: 'none',
    app_metadata: { ...existingMeta, deactivated: false },
  })
  if (banError) throw new Error(banError.message)

  const { error: profileError } = await admin
    .from('profiles')
    .update({ deactivated_at: null })
    .eq('id', id)
  if (profileError) throw new Error(profileError.message)
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePortalUserAdmin()
  if (!auth.ok) return auth.res

  let body: { id?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const id = body.id
  const action = body.action
  if (!id || (action !== 'deactivate' && action !== 'reactivate')) {
    return NextResponse.json({ error: 'id and action (deactivate|reactivate) are required' }, { status: 400 })
  }
  if (isSelfUserAction(auth.actor.id, id)) {
    return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(id)
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    if (action === 'deactivate') {
      await deactivateUser(admin, id, userData.user.app_metadata as Record<string, unknown> | undefined)
      return NextResponse.json({ ok: true, mode: 'deactivate' })
    }
    await reactivateUser(admin, id, userData.user.app_metadata as Record<string, unknown> | undefined)
    return NextResponse.json({ ok: true, mode: 'reactivate' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'User update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Remove a user from Admin UI.
 * Confirmed / any audit history → deactivate + revoke (audit stays).
 * Never-confirmed invite with zero audit rows → hard Auth delete (existing pending-invite pattern).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requirePortalUserAdmin()
  if (!auth.ok) return auth.res

  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const id = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (isSelfUserAction(auth.actor.id, id)) {
    return NextResponse.json({ error: 'You cannot remove your own account.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const target = await loadAuthUser(admin, id)
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  let auditCount = 0
  try {
    auditCount = await auditRowCountForUser(admin, id)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not check audit history'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const mode = removeUserMode(target, auditCount)

  if (mode === 'hard_delete_pending_invite') {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, mode })
  }

  const { data: userData } = await admin.auth.admin.getUserById(id)
  try {
    await deactivateUser(admin, id, userData?.user?.app_metadata as Record<string, unknown> | undefined)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not deactivate user'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mode, audit_rows_kept: auditCount })
}
