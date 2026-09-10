import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  advancingSlaDueDates,
  parsePortalSettings,
  pickPortalSettingsPatch,
  PORTAL_SETTINGS_DEFAULTS,
  weeksBeforeShow,
} from '../../lib/portal-settings.ts'
import { isRunCostSheetFrozen, shouldCaptureBookedCostSnapshot } from '../../lib/booked-cost-freeze.ts'

describe('portal settings defaults', () => {
  it('defaults match current product: lock ON, lighting 330, SLA 12/10/4', () => {
    assert.equal(PORTAL_SETTINGS_DEFAULTS.booked_costing_lock, true)
    assert.equal(PORTAL_SETTINGS_DEFAULTS.lighting_hire_default, 330)
    assert.equal(PORTAL_SETTINGS_DEFAULTS.advancing_sla_aim_weeks, 12)
    assert.equal(PORTAL_SETTINGS_DEFAULTS.advancing_sla_ping_weeks, 10)
    assert.equal(PORTAL_SETTINGS_DEFAULTS.advancing_sla_tech_chase_weeks, 4)
  })

  it('parses jsonb rows and falls back per key', () => {
    const parsed = parsePortalSettings([
      { key: 'booked_costing_lock', value: false },
      { key: 'lighting_hire_default', value: 330 },
    ])
    assert.equal(parsed.booked_costing_lock, false)
    assert.equal(parsed.lighting_hire_default, 330)
    assert.equal(parsed.advancing_sla_aim_weeks, 12)
  })

  it('rejects unknown / invalid patches and accepts a lock toggle', () => {
    assert.equal(pickPortalSettingsPatch({}).ok, false)
    assert.equal(pickPortalSettingsPatch({ booked_costing_lock: true }).ok, true)
    assert.equal(pickPortalSettingsPatch({ lighting_hire_default: -1 }).ok, false)
    assert.equal(pickPortalSettingsPatch({ advancing_sla_aim_weeks: 8 }).ok, true)
  })
})

describe('BOOKED lock setting', () => {
  it('keeps freeze ON by default and unlocks when Settings lock is off', () => {
    assert.equal(isRunCostSheetFrozen({ status: 'confirmed' }), true)
    assert.equal(isRunCostSheetFrozen({ status: 'confirmed' }, { lockEnabled: true }), true)
    assert.equal(isRunCostSheetFrozen({ status: 'confirmed' }, { lockEnabled: false }), false)
    assert.equal(shouldCaptureBookedCostSnapshot({
      nextStatus: 'confirmed',
      prevStatus: 'proposed',
      hasSnapshot: false,
      lockEnabled: false,
    }), false)
  })
})

describe('advancing SLA dates', () => {
  it('subtracts whole weeks from the show date', () => {
    assert.equal(weeksBeforeShow('2026-06-24', 4), '2026-05-27')
    const dues = advancingSlaDueDates('2026-06-24', { aim_weeks: 12, ping_weeks: 10, tech_chase_weeks: 4 })
    assert.equal(dues.aimSend, '2026-04-01')
    assert.equal(dues.ping, '2026-04-15')
    assert.equal(dues.techChase, '2026-05-27')
  })
})
