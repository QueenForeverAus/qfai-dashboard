/**
 * Admin/Owner user remove.
 *
 * HARD (Gareth/Lead): audit trail for that user MUST stay.
 * Never delete audit_log / history keyed by the user id.
 * Confirmed users: deactivate + revoke only (ban login, sign out sessions,
 * keep profiles row so audit_log.changed_by and updated_by FKs remain).
 * Hard Auth delete only for never-confirmed invites with zero audit rows.
 */

export const AUTH_BAN_DURATION = '876000h'

export type AuthUserLike = {
  id: string
  invited_at?: string | null
  confirmed_at?: string | null
  email_confirmed_at?: string | null
}

export function canManagePortalUsers(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'owner'
}

export function isSelfUserAction(actorId: string, targetId: string): boolean {
  return actorId === targetId
}

export function isNeverConfirmedInvite(user: AuthUserLike): boolean {
  const confirmed = user.confirmed_at ?? user.email_confirmed_at
  return Boolean(user.invited_at) && !confirmed
}

/**
 * Hard-delete is allowed only for a pending invite that never signed in
 * and has no audit_log rows. Any audit history → deactivate instead.
 */
export function shouldHardDeleteInvite(user: AuthUserLike, auditRowCount: number): boolean {
  return isNeverConfirmedInvite(user) && auditRowCount === 0
}

export type RemoveUserMode = 'deactivate' | 'hard_delete_pending_invite'

export function removeUserMode(user: AuthUserLike, auditRowCount: number): RemoveUserMode {
  return shouldHardDeleteInvite(user, auditRowCount)
    ? 'hard_delete_pending_invite'
    : 'deactivate'
}
