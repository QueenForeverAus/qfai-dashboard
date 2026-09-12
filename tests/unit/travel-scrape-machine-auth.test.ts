import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isTravelScrapeMoneyConfirmed } from '../../lib/travel-scrape/apply-engine.ts'
import { planTravelScrapeApply } from '../../lib/travel-scrape/apply-engine.ts'
import { THORNTON_SCRAPE_PACKET } from '../../lib/travel-scrape/fixtures.ts'
import {
  extractTravelScrapeMachineToken,
  resolveTravelScrapeApplyAuth,
  travelScrapeMachineAllowsPacket,
  travelScrapeMachineDeployAllowed,
  travelScrapeMachineTokenMatches,
  TRAVEL_SCRAPE_MACHINE_ACTOR_NAME,
} from '../../lib/travel-scrape/machine-auth.ts'

const secret = 'test-travel-scrape-secret'

const session = {
  sessionUserId: '11111111-1111-4111-8111-111111111111',
  sessionRole: 'owner',
  sessionName: 'Gareth',
}

describe('travel-scrape machine auth', () => {
  it('accepts Bearer when the secret matches', () => {
    const auth = resolveTravelScrapeApplyAuth({
      authorizationHeader: `Bearer ${secret}`,
      secret,
    })
    assert.equal(auth.ok, true)
    if (!auth.ok) return
    assert.equal(auth.actor.kind, 'machine')
    assert.equal(auth.actor.actorName, TRAVEL_SCRAPE_MACHINE_ACTOR_NAME)
    assert.equal(auth.actor.actorUserId, null)
    assert.equal(auth.actor.role, 'machine')
  })

  it('accepts x-qfai-travel-scrape-key when the secret matches', () => {
    const auth = resolveTravelScrapeApplyAuth({
      travelScrapeKeyHeader: secret,
      secret,
    })
    assert.equal(auth.ok, true)
    if (auth.ok) assert.equal(auth.actor.kind, 'machine')
  })

  it('rejects a wrong token', () => {
    const auth = resolveTravelScrapeApplyAuth({
      authorizationHeader: 'Bearer not-the-secret',
      secret,
    })
    assert.equal(auth.ok, false)
    if (!auth.ok) {
      assert.equal(auth.status, 401)
      assert.equal(auth.error, 'Unauthorised')
    }
  })

  it('rejects Bearer when the secret is unset', () => {
    const auth = resolveTravelScrapeApplyAuth({
      authorizationHeader: `Bearer ${secret}`,
      secret: null,
    })
    assert.equal(auth.ok, false)
    if (!auth.ok) assert.equal(auth.status, 401)
  })

  it('allows machine auth on VERCEL_ENV=production when the secret is set', () => {
    assert.equal(travelScrapeMachineDeployAllowed('production'), true)
    const auth = resolveTravelScrapeApplyAuth({
      authorizationHeader: `Bearer ${secret}`,
      secret,
      vercelEnv: 'production',
    })
    assert.equal(auth.ok, true)
    if (auth.ok) assert.equal(auth.actor.kind, 'machine')
  })

  it('rejects missing auth', () => {
    const auth = resolveTravelScrapeApplyAuth({ secret })
    assert.equal(auth.ok, false)
    if (!auth.ok) assert.equal(auth.status, 401)
  })

  it('keeps the owner/admin session path working without a token', () => {
    const owner = resolveTravelScrapeApplyAuth({ ...session, secret })
    assert.equal(owner.ok, true)
    if (!owner.ok) return
    assert.equal(owner.actor.kind, 'session')
    assert.equal(owner.actor.actorUserId, session.sessionUserId)
    assert.equal(owner.actor.role, 'owner')

    const admin = resolveTravelScrapeApplyAuth({
      sessionUserId: session.sessionUserId,
      sessionRole: 'admin',
      sessionName: 'Ops',
      secret,
    })
    assert.equal(admin.ok, true)
    if (admin.ok) assert.equal(admin.actor.role, 'admin')
  })

  it('still forbids a non-owner session', () => {
    const auth = resolveTravelScrapeApplyAuth({
      sessionUserId: session.sessionUserId,
      sessionRole: 'member',
      sessionName: 'Crew',
      secret,
    })
    assert.equal(auth.ok, false)
    if (!auth.ok) assert.equal(auth.status, 403)
  })

  it('constant-time match is true only for the exact secret', () => {
    assert.equal(travelScrapeMachineTokenMatches(secret, secret), true)
    assert.equal(travelScrapeMachineTokenMatches('nope', secret), false)
    assert.equal(extractTravelScrapeMachineToken({
      authorizationHeader: `Bearer ${secret}`,
    }), secret)
  })

  it('machine auth is travel-scrape-packet-v1 only; money confirm is unchanged', () => {
    assert.equal(travelScrapeMachineAllowsPacket(THORNTON_SCRAPE_PACKET), true)
    assert.equal(travelScrapeMachineAllowsPacket({ version: 1, kind: 'hotel' }), false)
    assert.equal(isTravelScrapeMoneyConfirmed({}), false)
    const plan = planTravelScrapeApply({
      bookingStatus: 'confirmed',
      hasActiveWorkspace: true,
      packet: THORNTON_SCRAPE_PACKET,
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.details.will_apply, true)
    assert.equal(plan.money.action, 'confirm_needed')
    assert.equal(plan.money.will_write, false)
  })
})
