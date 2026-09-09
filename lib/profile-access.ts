/** Authz for Profile PII. API writes always target the signed-in user only. */

export type ProfileActor = { id: string; role: string }

export const SENSITIVE_PROFILE_FIELDS = [
  'passport_number',
  'qantas_ff',
  'virgin_ff',
  'date_of_birth',
  'mobile',
  'emergency_contact_mobile',
] as const

export function isSensitiveProfileField(field: string): boolean {
  return (SENSITIVE_PROFILE_FIELDS as readonly string[]).includes(field)
}

/** Signed-out cannot read anyone. Self can read own. Admin/owner can read others. */
export function actorCanReadProfilePii(
  actor: ProfileActor | null | undefined,
  targetProfileId: string,
): boolean {
  if (!actor?.id) return false
  if (actor.id === targetProfileId) return true
  return actor.role === 'admin' || actor.role === 'owner'
}

/**
 * Self-serve Profile PATCH may only write the caller's own row.
 * Admin/owner ops edits of another user are out of scope for /api/me.
 */
export function selfServeWriteTargetId(actorId: string): string {
  return actorId
}

export function actorCanSelfServeWrite(
  actor: ProfileActor | null | undefined,
  targetProfileId: string,
): boolean {
  if (!actor?.id) return false
  return actor.id === targetProfileId
}

export function redactSensitiveValue(field: string, value: string | null | undefined): string | null {
  if (value == null || value === '') return value ?? null
  if (isSensitiveProfileField(field)) return '[redacted]'
  return value
}
