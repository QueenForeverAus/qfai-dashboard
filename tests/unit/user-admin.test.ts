import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canManagePortalUsers,
  isNeverConfirmedInvite,
  isSelfUserAction,
  removeUserMode,
  shouldHardDeleteInvite,
} from '../../lib/user-admin.ts'

describe('admin/owner user remove', () => {
  it('gates remove to admin and owner only', () => {
    assert.equal(canManagePortalUsers('admin'), true)
    assert.equal(canManagePortalUsers('owner'), true)
    assert.equal(canManagePortalUsers('production'), false)
    assert.equal(canManagePortalUsers('crew'), false)
    assert.equal(canManagePortalUsers('external'), false)
    assert.equal(canManagePortalUsers(null), false)
  })

  it('refuses deleting self', () => {
    assert.equal(isSelfUserAction('user-a', 'user-a'), true)
    assert.equal(isSelfUserAction('user-a', 'user-b'), false)
  })

  it('hard-deletes only never-confirmed invites with zero audit rows', () => {
    const pending = { id: 'u1', invited_at: '2026-09-01T00:00:00Z', confirmed_at: null }
    const confirmed = { id: 'u2', invited_at: '2026-09-01T00:00:00Z', confirmed_at: '2026-09-02T00:00:00Z' }
    assert.equal(isNeverConfirmedInvite(pending), true)
    assert.equal(isNeverConfirmedInvite(confirmed), false)
    assert.equal(shouldHardDeleteInvite(pending, 0), true)
    assert.equal(shouldHardDeleteInvite(pending, 1), false)
    assert.equal(shouldHardDeleteInvite(confirmed, 0), false)
    assert.equal(removeUserMode(pending, 0), 'hard_delete_pending_invite')
    assert.equal(removeUserMode(pending, 3), 'deactivate')
    assert.equal(removeUserMode(confirmed, 0), 'deactivate')
  })

  it('keeps deactivate when any audit history exists (Gareth HARD)', () => {
    const signedIn = { id: 'u3', invited_at: null, confirmed_at: '2026-01-01T00:00:00Z' }
    assert.equal(removeUserMode(signedIn, 12), 'deactivate')
    assert.equal(shouldHardDeleteInvite(signedIn, 12), false)
  })
})
