import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextResponse } from 'next/server'
import { requirePortalUserAdmin } from '@/lib/require-user-admin'
import { isSelfUserAction, shouldHardDeleteInvite } from '@/lib/user-admin'

export async function GET() {
  const gate = await requirePortalUserAdmin()
  if (!gate.ok) return gate.res

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

/** Cancel a never-confirmed invite. Hard delete only when there is no audit history. */
export async function DELETE(req: Request) {
  const gate = await requirePortalUserAdmin()
  if (!gate.ok) return gate.res

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (isSelfUserAction(gate.actor.id, id)) {
    return NextResponse.json({ error: 'You cannot remove your own account.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error: getError } = await supabase.auth.admin.getUserById(id)
  if (getError || !data.user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { count } = await supabase
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('changed_by', id)

  if (!shouldHardDeleteInvite({
    id: data.user.id,
    invited_at: data.user.invited_at,
    confirmed_at: data.user.confirmed_at,
    email_confirmed_at: data.user.email_confirmed_at,
  }, count ?? 0)) {
    return NextResponse.json(
      { error: 'This user has signed in or has audit history. Deactivate them instead — audit trail must stay.' },
      { status: 409 },
    )
  }

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, mode: 'hard_delete_pending_invite' })
}
