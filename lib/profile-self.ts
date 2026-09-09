/** Self-serve Portal Profile fields. Passport PII lives on profile_passports. */

export const SEAT_PREFERENCES = ['middle', 'window', 'aisle'] as const
export type SeatPreference = (typeof SEAT_PREFERENCES)[number]

export type HotelMembership = {
  programme_name: string
  membership_number: string
}

export const MAX_HOTEL_MEMBERSHIPS = 10

export const SHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const
export type ShirtSize = (typeof SHIRT_SIZES)[number]

export const PROFILE_CONTACT_FIELD_KEYS = [
  'first_name',
  'last_name',
  'nickname',
  'mobile',
  'email',
  'qantas_ff',
  'virgin_ff',
  'dietary_requirements',
  'seat_preference',
  'emergency_contact_name',
  'emergency_contact_mobile',
  'allergies_medical',
  'shirt_size',
] as const

export const PASSPORT_FIELD_KEYS = [
  'passport_number',
  'nationality',
  'passport_name',
  'date_of_birth',
  'expiry_date',
  'place_of_issue',
] as const

export const PROFILE_SELF_FIELD_KEYS = [
  ...PROFILE_CONTACT_FIELD_KEYS,
  ...PASSPORT_FIELD_KEYS,
] as const

export type ProfileSelfFieldKey = (typeof PROFILE_SELF_FIELD_KEYS)[number]
export type PassportFieldKey = (typeof PASSPORT_FIELD_KEYS)[number]

/** Columns a signed-in user may read back from /api/me. Never includes permissions. */
export const PROFILE_PUBLIC_KEYS = [
  'id',
  'full_name',
  'email',
  'role',
  'hotel_memberships',
  ...PROFILE_SELF_FIELD_KEYS,
] as const

export type ProfilePublic = {
  id: string
  full_name: string
  email: string
  role: string
  first_name: string | null
  last_name: string | null
  nickname: string | null
  mobile: string | null
  qantas_ff: string | null
  virgin_ff: string | null
  dietary_requirements: string | null
  seat_preference: SeatPreference | null
  hotel_memberships: HotelMembership[]
  emergency_contact_name: string | null
  emergency_contact_mobile: string | null
  allergies_medical: string | null
  shirt_size: ShirtSize | null
  passport_number: string | null
  nationality: string | null
  passport_name: string | null
  date_of_birth: string | null
  expiry_date: string | null
  place_of_issue: string | null
}

const FIELD_MAX: Record<ProfileSelfFieldKey, number> = {
  first_name: 80,
  last_name: 80,
  nickname: 80,
  mobile: 40,
  email: 254,
  qantas_ff: 40,
  virgin_ff: 40,
  dietary_requirements: 500,
  seat_preference: 32,
  emergency_contact_name: 120,
  emergency_contact_mobile: 40,
  allergies_medical: 500,
  shirt_size: 8,
  passport_number: 40,
  nationality: 80,
  passport_name: 160,
  date_of_birth: 10,
  expiry_date: 10,
  place_of_issue: 120,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export type ProfileColumnValue = string | null | HotelMembership[]

export type SanitizeOk = {
  ok: true
  profilePatch: Record<string, ProfileColumnValue>
  passportPatch: Record<string, string | null>
}

export type SanitizeErr = {
  ok: false
  error: string
}

export function clipText(value: unknown, max: number): string {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max)
}

export function emptyToNull(value: string): string | null {
  return value === '' ? null : value
}

export function isSeatPreference(value: string): value is SeatPreference {
  return (SEAT_PREFERENCES as readonly string[]).includes(value)
}

export function isShirtSize(value: string): value is ShirtSize {
  return (SHIRT_SIZES as readonly string[]).includes(value)
}

export function splitFullName(fullName: string | null | undefined): { first: string; last: string } {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
}

export function syncedFullName(firstName: string, lastName: string, fallback: string): string {
  const combined = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
  return combined || fallback.trim()
}

export function displayNameParts(profile: {
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
}): { first: string; last: string } {
  const first = (profile.first_name ?? '').trim()
  const last = (profile.last_name ?? '').trim()
  if (first || last) return { first, last }
  return splitFullName(profile.full_name)
}

export function emptyHotelMembership(): HotelMembership {
  return { programme_name: '', membership_number: '' }
}

export function normalizeHotelMemberships(value: unknown): HotelMembership[] {
  if (!Array.isArray(value)) return []
  const rows: HotelMembership[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const programme_name = clipText(rec.programme_name, 80)
    const membership_number = clipText(rec.membership_number, 40)
    if (!programme_name && !membership_number) continue
    rows.push({ programme_name, membership_number })
    if (rows.length >= MAX_HOTEL_MEMBERSHIPS) break
  }
  return rows
}

export function pickPublicProfile(row: Record<string, unknown> | null | undefined): ProfilePublic | null {
  if (!row || typeof row.id !== 'string') return null
  const out: Record<string, unknown> = {}
  for (const key of PROFILE_PUBLIC_KEYS) {
    if (key in row) out[key] = row[key]
  }
  out.hotel_memberships = normalizeHotelMemberships(row.hotel_memberships)
  return out as ProfilePublic
}

export function mergeProfileAndPassport(
  profile: Record<string, unknown> | null | undefined,
  passport: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!profile) return null
  const merged = { ...profile }
  if (passport) {
    for (const key of PASSPORT_FIELD_KEYS) {
      if (key in passport) merged[key] = passport[key]
    }
  }
  return merged
}

/** Accepts YYYY-MM-DD only. Returns null for blank, or 'invalid'. */
export function parseIsoDate(value: string): string | null | 'invalid' {
  if (!value) return null
  const match = ISO_DATE_RE.exec(value)
  if (!match) return 'invalid'
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return 'invalid'
  }
  return value
}

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Strip privileged keys and validate self-serve fields. Never accepts role/permissions/id. */
export function sanitizeProfileSelfPatch(
  body: unknown,
  existing: { full_name: string; email: string },
): SanitizeOk | SanitizeErr {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid profile payload' }
  }

  const raw = body as Record<string, unknown>
  const profilePatch: Record<string, ProfileColumnValue> = {}
  const passportPatch: Record<string, string | null> = {}

  if ('hotel_memberships' in raw) {
    if (raw.hotel_memberships != null && !Array.isArray(raw.hotel_memberships)) {
      return { ok: false, error: 'Hotel memberships must be a list of programme + number pairs.' }
    }
    profilePatch.hotel_memberships = normalizeHotelMemberships(raw.hotel_memberships)
  }

  for (const key of PROFILE_SELF_FIELD_KEYS) {
    if (!(key in raw)) continue
    const clipped = clipText(raw[key], FIELD_MAX[key])
    const target = (PASSPORT_FIELD_KEYS as readonly string[]).includes(key)
      ? passportPatch
      : profilePatch

    if (key === 'email') {
      if (!clipped) return { ok: false, error: 'Email address is required.' }
      if (!EMAIL_RE.test(clipped)) return { ok: false, error: 'Enter a valid email address.' }
      profilePatch.email = clipped
      continue
    }

    if (key === 'seat_preference') {
      if (!clipped) {
        profilePatch.seat_preference = null
        continue
      }
      if (!isSeatPreference(clipped)) {
        return { ok: false, error: 'Seat preference must be Middle, Window, or Aisle.' }
      }
      profilePatch.seat_preference = clipped
      continue
    }

    if (key === 'shirt_size') {
      if (!clipped) {
        profilePatch.shirt_size = null
        continue
      }
      if (!isShirtSize(clipped)) {
        return { ok: false, error: 'Shirt size must be S–XXL.' }
      }
      profilePatch.shirt_size = clipped
      continue
    }

    if (key === 'date_of_birth' || key === 'expiry_date') {
      const parsed = parseIsoDate(clipped)
      if (parsed === 'invalid') {
        return { ok: false, error: key === 'expiry_date'
          ? 'Enter a valid passport expiry date.'
          : 'Enter a valid date of birth.' }
      }
      if (key === 'date_of_birth' && parsed && parsed > todayUtcIso()) {
        return { ok: false, error: 'Date of birth cannot be in the future.' }
      }
      target[key] = parsed
      continue
    }

    target[key] = emptyToNull(clipped)
  }

  const touchedName = 'first_name' in raw || 'last_name' in raw
  if (touchedName) {
    const fromExisting = splitFullName(existing.full_name)
    const first = typeof profilePatch.first_name === 'string' ? profilePatch.first_name : fromExisting.first
    const last = typeof profilePatch.last_name === 'string' ? profilePatch.last_name : fromExisting.last
    const full = syncedFullName(first, last, existing.full_name)
    if (!full) return { ok: false, error: 'Name cannot be empty.' }
    profilePatch.full_name = full
  }

  if (!('email' in profilePatch) && !existing.email.trim()) {
    return { ok: false, error: 'Email address is required.' }
  }

  const passportTouched = PASSPORT_FIELD_KEYS.some(key => key in raw)
  if (passportTouched) {
    const hasAnyPassport = PASSPORT_FIELD_KEYS.some(key => passportPatch[key])
    if (hasAnyPassport && !passportPatch.expiry_date) {
      return { ok: false, error: 'Passport expiry date is required.' }
    }
  }

  return { ok: true, profilePatch, passportPatch }
}
