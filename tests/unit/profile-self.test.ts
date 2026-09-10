import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  actorCanReadProfilePii,
  actorCanSelfServeWrite,
  redactSensitiveValue,
} from '../../lib/profile-access.ts'
import {
  displayNameParts,
  pickPublicProfile,
  sanitizeProfileSelfPatch,
  splitFullName,
  syncedFullName,
} from '../../lib/profile-self.ts'
import { ROLE_ACCESS, canAccessPage } from '../../lib/role-access.ts'

describe('profile self-serve fields', () => {
  it('syncs full_name from first + last and falls back when both blank', () => {
    assert.equal(syncedFullName('Gareth', 'Hewitt', 'Old'), 'Gareth Hewitt')
    assert.equal(syncedFullName('Gareth', '', 'Old Name'), 'Gareth')
    assert.equal(syncedFullName('', '', 'Old Name'), 'Old Name')
    assert.deepEqual(splitFullName('Gareth Hewitt'), { first: 'Gareth', last: 'Hewitt' })
    assert.deepEqual(displayNameParts({ full_name: 'Ada Lovelace' }), { first: 'Ada', last: 'Lovelace' })
    assert.deepEqual(
      displayNameParts({ first_name: 'Ada', last_name: 'Byron', full_name: 'Ada Lovelace' }),
      { first: 'Ada', last: 'Byron' },
    )
  })

  it('strips privileged keys and persists allowlisted profile fields', () => {
    const result = sanitizeProfileSelfPatch(
      {
        first_name: '  Gareth ',
        last_name: 'Hewitt',
        nickname: 'Gaz',
        mobile: '0400 000 000',
        email: 'gareth@queenforever.com.au',
        qantas_ff: 'QF123',
        virgin_ff: 'VA456',
        dietary_requirements: 'Vegetarian',
        seat_preference: 'window',
        hotel_memberships: [
          { programme_name: ' Accor Plus ', membership_number: 'A1' },
          { programme_name: '', membership_number: '' },
        ],
        emergency_contact_name: 'Pat',
        emergency_contact_mobile: '0411 111 111',
        allergies_medical: 'None',
        shirt_size: 'L',
        role: 'admin',
        permissions: { costing: true },
        id: '00000000-0000-0000-0000-000000000000',
      },
      { full_name: 'Old Name', email: 'old@example.com' },
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.profilePatch.full_name, 'Gareth Hewitt')
    assert.equal(result.profilePatch.first_name, 'Gareth')
    assert.equal(result.profilePatch.email, 'gareth@queenforever.com.au')
    assert.deepEqual(result.profilePatch.hotel_memberships, [
      { programme_name: 'Accor Plus', membership_number: 'A1' },
    ])
    assert.equal(result.profilePatch.seat_preference, 'window')
    assert.equal(result.profilePatch.shirt_size, 'L')
    assert.equal('role' in result.profilePatch, false)
    assert.equal('permissions' in result.profilePatch, false)
    assert.equal('id' in result.profilePatch, false)
    assert.equal('passport_number' in result.profilePatch, false)
  })

  it('rejects invalid email, seat, and shirt values', () => {
    const existing = { full_name: 'Gareth Hewitt', email: 'gareth@queenforever.com.au' }
    assert.equal(sanitizeProfileSelfPatch({ email: 'not-an-email' }, existing).ok, false)
    assert.equal(sanitizeProfileSelfPatch({ email: '' }, existing).ok, false)
    assert.equal(sanitizeProfileSelfPatch({ seat_preference: 'exit-row' }, existing).ok, false)
    assert.equal(sanitizeProfileSelfPatch({ seat_preference: 'no_preference' }, existing).ok, false)
    const blankSeat = sanitizeProfileSelfPatch({ seat_preference: '' }, existing)
    assert.equal(blankSeat.ok, true)
    if (blankSeat.ok) assert.equal(blankSeat.profilePatch.seat_preference, null)
    const middle = sanitizeProfileSelfPatch({ seat_preference: 'middle' }, existing)
    assert.equal(middle.ok, true)
    if (middle.ok) assert.equal(middle.profilePatch.seat_preference, 'middle')
    assert.equal(sanitizeProfileSelfPatch({ shirt_size: 'XXXL' }, existing).ok, false)
  })

  it('requires passport expiry when any passport field is set', () => {
    const existing = { full_name: 'Gareth Hewitt', email: 'gareth@queenforever.com.au' }
    const missing = sanitizeProfileSelfPatch(
      { passport_number: 'PA123', expiry_date: '' },
      existing,
    )
    assert.equal(missing.ok, false)
    if (!missing.ok) assert.match(missing.error, /expiry/i)

    const ok = sanitizeProfileSelfPatch(
      {
        passport_number: 'PA123',
        nationality: 'Australia',
        passport_name: 'GARETH HEWITT',
        date_of_birth: '1980-05-01',
        expiry_date: '2030-01-15',
        place_of_issue: 'Canberra',
      },
      existing,
    )
    assert.equal(ok.ok, true)
    if (!ok.ok) return
    assert.equal(ok.passportPatch.passport_number, 'PA123')
    assert.equal(ok.passportPatch.expiry_date, '2030-01-15')
    assert.equal(ok.passportPatch.date_of_birth, '1980-05-01')
    assert.equal('passport_number' in ok.profilePatch, false)
  })

  it('rejects invalid or future dates of birth', () => {
    const existing = { full_name: 'Gareth Hewitt', email: 'gareth@queenforever.com.au' }
    assert.equal(sanitizeProfileSelfPatch({ date_of_birth: 'not-a-date', expiry_date: '2030-01-01' }, existing).ok, false)
    assert.equal(sanitizeProfileSelfPatch({ date_of_birth: '2099-01-01', expiry_date: '2030-01-01' }, existing).ok, false)
  })

  it('omits permissions from the public profile projection', () => {
    const publicRow = pickPublicProfile({
      id: 'u1',
      full_name: 'Gareth Hewitt',
      email: 'gareth@queenforever.com.au',
      role: 'owner',
      permissions: { costing: true },
      first_name: 'Gareth',
      last_name: 'Hewitt',
      passport_number: 'PA123',
      created_at: '2026-01-01',
    })
    assert.ok(publicRow)
    assert.equal(publicRow?.first_name, 'Gareth')
    assert.equal(publicRow?.passport_number, 'PA123')
    assert.equal('permissions' in (publicRow ?? {}), false)
    assert.equal('created_at' in (publicRow ?? {}), false)
  })
})

describe('profile PII access (signed-out + cross-user deny)', () => {
  it('signed-out cannot read profile PII', () => {
    assert.equal(actorCanReadProfilePii(null, 'user-a'), false)
    assert.equal(actorCanReadProfilePii(undefined, 'user-a'), false)
    assert.equal(actorCanSelfServeWrite(null, 'user-a'), false)
  })

  it('user A cannot read or self-serve-write user B', () => {
    const userA = { id: 'user-a', role: 'crew' }
    assert.equal(actorCanReadProfilePii(userA, 'user-b'), false)
    assert.equal(actorCanSelfServeWrite(userA, 'user-b'), false)
    assert.equal(actorCanReadProfilePii(userA, 'user-a'), true)
    assert.equal(actorCanSelfServeWrite(userA, 'user-a'), true)
  })

  it('admin and owner may read another profile; self-serve API still writes own row only', () => {
    assert.equal(actorCanReadProfilePii({ id: 'owner-1', role: 'owner' }, 'user-b'), true)
    assert.equal(actorCanReadProfilePii({ id: 'admin-1', role: 'admin' }, 'user-b'), true)
    assert.equal(actorCanSelfServeWrite({ id: 'owner-1', role: 'owner' }, 'user-b'), false)
  })

  it('redacts passport number and frequent-flyer numbers for logs', () => {
    assert.equal(redactSensitiveValue('passport_number', 'PA123456'), '[redacted]')
    assert.equal(redactSensitiveValue('qantas_ff', 'QF999'), '[redacted]')
    assert.equal(redactSensitiveValue('virgin_ff', 'VA111'), '[redacted]')
    assert.equal(redactSensitiveValue('nickname', 'Gaz'), 'Gaz')
  })
})

describe('profile page access', () => {
  it('lets every signed-in role open Settings and the Profile alias', () => {
    for (const role of Object.keys(ROLE_ACCESS)) {
      assert.equal(canAccessPage(role, '/settings'), true, role)
      assert.equal(canAccessPage(role, '/profile'), true, role)
    }
  })

  it('keeps Admin Settings off crew and production', () => {
    assert.equal(canAccessPage('crew', '/admin-settings'), false)
    assert.equal(canAccessPage('production', '/admin-settings'), false)
    assert.equal(canAccessPage('admin', '/admin-settings'), true)
    assert.equal(canAccessPage('owner', '/admin-settings'), true)
  })
})
