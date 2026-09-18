import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canEditMusicRightsLinePct,
  musicRightsLineEditPatch,
  musicRightsLinePatchWritesFactors,
  musicRightsRefreshLine,
  musicRightsSeedLine,
  parseMusicRightsLinePct,
  refreshMusicRightsLinePct,
  seedMusicRightsLinePctFromFactors,
} from '../../lib/music-rights-line.ts'
import { FIELD_TOMBSTONE_SEED_KEY, isTombstoned } from '../../lib/cost-line-tombstones.ts'
import { findMissingDefinedCostFields } from '../../lib/cost-fields.ts'
import { MUSIC_RIGHTS_FACTOR_KEY } from '../../lib/show-auto-calc.ts'

const show = {
  capacity: 400,
  ticket_price: 80,
  sell_through_pct: 75,
}

describe('Wave B2 Music Rights show-local line %', () => {
  it('Factors empty → FIGURES NEEDED; does not invent AU % or copy apra_pct', () => {
    const seeded = musicRightsSeedLine({ show, factors: {} })
    assert.equal(seeded.line_pct, null)
    assert.equal(seeded.value, null)
    assert.equal(seeded.state, 'pending')

    assert.equal(seedMusicRightsLinePctFromFactors({ apra_pct: 2 }), null)
    assert.equal(seedMusicRightsLinePctFromFactors({ apra_pct: 2, music_rights_pct: null }), null)
    assert.equal(seedMusicRightsLinePctFromFactors({ [MUSIC_RIGHTS_FACTOR_KEY]: '' }), null)
  })

  it('Factors set → seed line % and auto-calc $ from ticket base', () => {
    const seeded = musicRightsSeedLine({ show, factors: { music_rights_pct: 2 } })
    assert.equal(seeded.line_pct, 2)
    assert.equal(seeded.state, 'auto_calc')
    assert.equal(seeded.value, 480)

    const oneFive = musicRightsSeedLine({ show, factors: { music_rights_pct: 1.5, apra_pct: 2 } })
    assert.equal(oneFive.line_pct, 1.5)
    assert.equal(oneFive.value, 360)
  })

  it('line % edit updates $ and does not write Factors', () => {
    const patch = musicRightsLineEditPatch({ show, linePct: 1.25 })
    assert.equal(patch.line_pct, 1.25)
    assert.equal(patch.value, 300)
    assert.equal(patch.state, 'auto_calc')
    assert.equal(musicRightsLinePatchWritesFactors(patch), false)
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'music_rights_pct'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'apra_pct'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'run_factors'), false)

    const cleared = musicRightsLineEditPatch({ show, linePct: '' })
    assert.equal(cleared.line_pct, null)
    assert.equal(cleared.value, null)
    assert.equal(cleared.state, 'pending')
  })

  it('BOOKED Advancing is editable when Factors is empty; Costings follows freeze', () => {
    assert.equal(canEditMusicRightsLinePct({
      sheet: 'advancing',
      costSheetFrozen: true,
      factorsPct: null,
    }), true)
    const booked = musicRightsLineEditPatch({ show, linePct: 3 })
    assert.equal(booked.line_pct, 3)
    assert.equal(booked.value, 720)
    assert.equal(booked.state, 'auto_calc')

    assert.equal(canEditMusicRightsLinePct({
      sheet: 'costings',
      costSheetFrozen: true,
      factorsPct: null,
    }), false)
    assert.equal(canEditMusicRightsLinePct({
      sheet: 'costings',
      costSheetFrozen: false,
      factorsPct: null,
    }), true)
  })

  it('Factors refresh preserves operator line-% override', () => {
    assert.equal(refreshMusicRightsLinePct({
      existingLinePct: 1.5,
      factors: { music_rights_pct: 2 },
    }), 1.5)

    const refreshed = musicRightsRefreshLine({
      show,
      existingLinePct: 1.5,
      factors: { music_rights_pct: 2 },
    })
    assert.equal(refreshed.line_pct, 1.5)
    assert.equal(refreshed.value, 360)
    assert.notEqual(refreshed.value, 480)

    const emptyLine = musicRightsRefreshLine({
      show,
      existingLinePct: null,
      factors: { music_rights_pct: 2 },
    })
    assert.equal(emptyLine.line_pct, 2)
    assert.equal(emptyLine.value, 480)
  })

  it('deleted / tombstoned Music Rights is not re-seeded', () => {
    const tombs = [{ show_id: 'show-1', field_key: 'music_rights', seed_key: FIELD_TOMBSTONE_SEED_KEY }]
    assert.equal(isTombstoned(tombs, {
      show_id: 'show-1',
      field_key: 'music_rights',
      seed_key: '*',
    }), true)
    const missing = findMissingDefinedCostFields(
      [],
      ['show-1'],
      { tombstones: tombs },
    )
    assert.equal(missing.some(m => m.fieldDef.key === 'music_rights'), false)
  })

  it('parseMusicRightsLinePct treats 0 as a real % and blanks as empty', () => {
    assert.equal(parseMusicRightsLinePct(0), 0)
    assert.equal(parseMusicRightsLinePct('0'), 0)
    assert.equal(parseMusicRightsLinePct(''), null)
    assert.equal(parseMusicRightsLinePct(null), null)
    assert.equal(musicRightsLineEditPatch({ show, linePct: 0 }).value, 0)
  })
})
