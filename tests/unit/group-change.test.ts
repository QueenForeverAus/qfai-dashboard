import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyGroupChangeDecisions,
  isGroupChangeProtected,
  previewGroupChange,
  resolveGroupChangeDecision,
  type GroupChangeField,
} from '../../lib/group-change.ts'
import { INVOICED_FIELD_STATE } from '../../lib/cost-fields.ts'
import { canEditGroupType, GROUP_CHANGE_LOCKED } from '../../lib/group-type.ts'

function lighting(opts: Partial<GroupChangeField> & { value: number }): GroupChangeField {
  return {
    id: opts.id ?? 'lighting',
    field_key: 'lighting_hire',
    show_id: null,
    label: 'Production Bought In',
    value: opts.value,
    state: opts.state ?? 'estimated',
    source: opts.source ?? 'standing',
    entries: opts.entries ?? [{
      id: 'e1',
      description: 'Lighting Equipment Hire',
      notes: '',
      amount: opts.value,
      gst_included: true,
      confirmed: false,
      paid: false,
    }],
  }
}

describe('Group-change keep/replace for CONFIRMED / INVOICED / PAID', () => {
  it('flags confirmed, invoiced, and paid lines as protected', () => {
    assert.equal(isGroupChangeProtected(lighting({ value: 330, state: 'known' })), true)
    assert.equal(isGroupChangeProtected(lighting({ value: 330, state: INVOICED_FIELD_STATE })), true)
    assert.equal(isGroupChangeProtected(lighting({
      value: 330,
      state: 'estimated',
      entries: [{
        id: 'e1',
        description: 'Lighting Equipment Hire',
        notes: '',
        amount: 330,
        gst_included: true,
        confirmed: true,
        paid: true,
        paid_at: '2026-09-18T00:00:00.000Z',
      }],
    })), true)
    assert.equal(isGroupChangeProtected(lighting({ value: 330, state: 'estimated' })), false)
  })

  it('never silently wipes protected lines — default keep unless replace is chosen', () => {
    const preview = previewGroupChange({
      from: 'group1',
      to: 'group3',
      existing: [
        lighting({ id: 'c-known', value: 330, state: 'known' }),
        {
          ...lighting({ id: 'c-inv', value: 440, state: INVOICED_FIELD_STATE }),
          field_key: 'flights',
          label: 'Flights',
        },
        {
          id: 'c-paid',
          field_key: 'ground_transport',
          show_id: null,
          label: 'Ground Transport',
          value: 900,
          state: 'estimated',
          source: 'van',
          entries: [{
            id: 'g1',
            description: 'Van hire',
            notes: '',
            amount: 900,
            gst_included: true,
            confirmed: true,
            paid: true,
            paid_at: '2026-09-10T00:00:00.000Z',
          }],
        },
      ],
      proposed: [
        lighting({ value: 0, state: 'estimated', source: 'G3 — no standing lighting hire' }),
        {
          field_key: 'flights',
          show_id: null,
          label: 'Flights',
          value: 3000,
          state: 'estimated',
          source: 'G3 flights',
          entries: [],
        },
        {
          field_key: 'ground_transport',
          show_id: null,
          label: 'Ground Transport',
          value: 200,
          state: 'estimated',
          source: 'G3 ground',
          entries: [],
        },
      ],
    })

    const lightingLine = preview.lines.find(l => l.fieldKey === 'lighting_hire')
    const flightsLine = preview.lines.find(l => l.fieldKey === 'flights')
    const groundLine = preview.lines.find(l => l.fieldKey === 'ground_transport')
    assert.ok(lightingLine && flightsLine && groundLine)
    assert.equal(lightingLine.protected, true)
    assert.deepEqual(lightingLine.protectedReasons, ['confirmed'])
    assert.equal(flightsLine.protected, true)
    assert.ok(flightsLine.protectedReasons.includes('invoiced'))
    assert.equal(groundLine.protected, true)
    assert.ok(groundLine.protectedReasons.includes('paid'))

    assert.equal(resolveGroupChangeDecision(lightingLine, null), 'keep')
    assert.equal(resolveGroupChangeDecision(lightingLine, {}), 'keep')
    assert.equal(resolveGroupChangeDecision(lightingLine, { [lightingLine.key]: 'replace' }), 'replace')

    const kept = applyGroupChangeDecisions(preview, {
      [flightsLine.key]: 'replace',
    })
    assert.ok(kept.keep.some(l => l.fieldKey === 'lighting_hire'))
    assert.ok(kept.keep.some(l => l.fieldKey === 'ground_transport'))
    assert.ok(kept.replace.some(l => l.fieldKey === 'flights'))
    assert.equal(kept.keep.find(l => l.fieldKey === 'lighting_hire')?.existing?.value, 330)
  })

  it('auto-replaces unprotected ESTIMATE lines', () => {
    const preview = previewGroupChange({
      from: 'group2',
      to: 'group4',
      existing: [lighting({ value: 330, state: 'estimated' })],
      proposed: [lighting({ value: 0, state: 'estimated', source: 'G4 — no standing lighting hire' })],
    })
    const line = preview.lines.find(l => l.fieldKey === 'lighting_hire')
    assert.ok(line)
    assert.equal(line.protected, false)
    assert.equal(resolveGroupChangeDecision(line, null), 'replace')
    const applied = applyGroupChangeDecisions(preview, null)
    assert.equal(applied.replace[0]?.proposed?.value, 0)
  })

  it('locks Group Type on BOOKED Costings until Unconfirm; Advancing never edits', () => {
    assert.equal(canEditGroupType({
      role: 'owner',
      status: 'confirmed',
    }).ok, false)
    assert.equal(canEditGroupType({
      role: 'owner',
      status: 'confirmed',
    }).error, GROUP_CHANGE_LOCKED)
    assert.equal(canEditGroupType({
      role: 'owner',
      status: 'confirmed',
      costingsUnconfirmedAt: '2026-09-18T00:00:00.000Z',
    }).ok, true)
    assert.equal(canEditGroupType({
      role: 'owner',
      status: 'proposed',
    }).ok, true)
    assert.equal(canEditGroupType({
      role: 'owner',
      status: 'proposed',
      workspace: 'advancing',
    }).ok, false)
    assert.equal(canEditGroupType({
      role: 'production',
      status: 'proposed',
    }).ok, false)
  })
})
