import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ADVANCING_PACKET_SCHEMA,
  blockingSoftFlags,
  envelopeToParsedPacket,
  gateAdvancingEnvelope,
  isAllowedApplySoftFlag,
  parseAdvancingEnvelope,
} from '../../lib/advancing-packet-v1.ts'
import { ADVANCING_SOFT_FLAG, planAdvancingApply } from '../../lib/advancing-extract.ts'
import { SMOKE_ADVANCING_EXTRACT } from '../../lib/fixtures/advancing-extract-smoke.ts'

const CTX = { runId: 'run-civic', showId: 'show-civic' }

function v1Packet(overrides: Record<string, unknown> = {}) {
  return {
    schema: ADVANCING_PACKET_SCHEMA,
    apply_env: 'staging',
    action: 'apply',
    confidence: 'high',
    run_id: CTX.runId,
    show_id: CTX.showId,
    venue_short_name: 'Civic',
    email_date: '07/09/26',
    category: 'production_av',
    description: 'Venue tech / AV package',
    amount: 1100,
    soft_flags: [],
    ...overrides,
  }
}

test('allowlisted soft_flags are crew_over_target and lighting_330_keep_separate', () => {
  assert.equal(isAllowedApplySoftFlag('crew_over_target'), true)
  assert.equal(isAllowedApplySoftFlag('crew_headcount_over_target'), true)
  assert.equal(isAllowedApplySoftFlag('lighting_330_keep_separate'), true)
  assert.equal(isAllowedApplySoftFlag('lighting_default_kept'), true)
  assert.equal(isAllowedApplySoftFlag('lone_foh'), false)
  assert.deepEqual(blockingSoftFlags(['crew_over_target', 'lone_foh']), ['lone_foh'])
})

test('parseAdvancingEnvelope accepts a single packet and { packets }', () => {
  const single = parseAdvancingEnvelope(v1Packet())
  assert.equal(single.packets.length, 1)
  assert.equal(single.packets[0].category, 'production_av')
  assert.equal(single.packets[0].amount, 1100)

  const batch = parseAdvancingEnvelope({ packets: [v1Packet(), v1Packet({ category: 'venue_staff', amount: 200, description: 'Ushers' })] })
  assert.equal(batch.packets.length, 2)
})

test('gate accepts high / staging / apply with amount + run + show', () => {
  const envelope = parseAdvancingEnvelope(v1Packet())
  const gate = gateAdvancingEnvelope(envelope, CTX)
  assert.equal(gate.ok, true)
})

test('non-allowlisted soft_flags are 422 with flags echoed and no convert-to-write', () => {
  const envelope = parseAdvancingEnvelope(v1Packet({ soft_flags: ['lone_foh'] }))
  const gate = gateAdvancingEnvelope(envelope, CTX)
  assert.equal(gate.ok, false)
  if (gate.ok) throw new Error('expected 422')
  assert.equal(gate.status, 422)
  assert.deepEqual(gate.soft_flags, ['lone_foh'])
})

test('allowlisted soft_flags still apply (crew over target + keep $330 lighting)', () => {
  const envelope = parseAdvancingEnvelope({
    packets: [
      v1Packet({
        category: 'venue_staff',
        description: 'FOH ushers (agreed count)',
        role: 'FOH ushers',
        amount: 678,
        rate: 56.5,
        hours: 3,
        headcount: 4,
        soft_flags: ['crew_over_target'],
      }),
      v1Packet({
        category: 'lighting',
        description: 'Lighting equipment hire',
        amount: 0,
        soft_flags: ['lighting_330_keep_separate'],
      }),
    ],
  })
  const gate = gateAdvancingEnvelope(envelope, CTX)
  assert.equal(gate.ok, true)
  const parsed = envelopeToParsedPacket(envelope, { ...CTX, runGroup: 'group1' })
  const plan = planAdvancingApply(parsed, { runGroup: 'group1' })
  assert.ok(plan.writes.some(w => w.role === 'FOH ushers' && w.headcount === 4))
  assert.ok(plan.skipped.some(s => s.fieldKey === 'lighting_hire'))
  assert.equal(plan.writes.some(w => w.fieldKey === 'lighting_hire'), false)
})

test('ambiguous category is 422 unless force', () => {
  const envelope = parseAdvancingEnvelope(v1Packet({ category: 'ambiguous', amount: 50 }))
  const blocked = gateAdvancingEnvelope(envelope, CTX)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) {
    assert.equal(blocked.status, 422)
    assert.ok(blocked.soft_flags.includes('ambiguous'))
  }

  envelope.force = true
  assert.equal(gateAdvancingEnvelope(envelope, CTX).ok, true)
})

test('medium confidence is 422 unless force', () => {
  const envelope = parseAdvancingEnvelope(v1Packet({ confidence: 'medium' }))
  const blocked = gateAdvancingEnvelope(envelope, CTX)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.equal(blocked.status, 422)

  envelope.force = true
  assert.equal(gateAdvancingEnvelope(envelope, CTX).ok, true)
})

test('force: true overrides blocking soft_flags (admin)', () => {
  const envelope = parseAdvancingEnvelope(v1Packet({ soft_flags: ['lone_foh', 'catering_rider_vs_fb'] }), { force: true })
  assert.equal(envelope.force, true)
  assert.equal(gateAdvancingEnvelope(envelope, CTX).ok, true)
})

test('venue_hire is never written unless hire_renegotiated — even force', () => {
  const envelope = parseAdvancingEnvelope(v1Packet({
    category: 'venue_hire',
    description: 'Venue hire',
    amount: 2000,
    hire_renegotiated: false,
  }), { force: true })
  assert.equal(gateAdvancingEnvelope(envelope, CTX).ok, true)
  const parsed = envelopeToParsedPacket(envelope, CTX)
  const plan = planAdvancingApply(parsed, { forceApply: true })
  assert.equal(plan.writes.length, 0)
  assert.ok(plan.skipped[0].softFlags.includes(ADVANCING_SOFT_FLAG.hireNotRenegotiated))
})

test('apply_env / action / schema mismatches are 400', () => {
  for (const overrides of [
    { apply_env: 'production' },
    { action: 'preview' },
    { schema: 'advancing-packet-v0' },
  ]) {
    const envelope = parseAdvancingEnvelope(v1Packet(overrides))
    const gate = gateAdvancingEnvelope(envelope, CTX)
    assert.equal(gate.ok, false)
    if (!gate.ok) assert.equal(gate.status, 400)
  }
})

test('legacy lines[] envelope still converts', () => {
  const envelope = parseAdvancingEnvelope({
    venue_short_name: 'Civic',
    email_date: '07/09/26',
    confidence: 'high',
    run_id: CTX.runId,
    show_id: CTX.showId,
    lines: [{ kind: 'production_av', description: 'Venue tech package', amount: 1100, confidence: 'high' }],
  })
  assert.equal(envelope.packets[0].category, 'production_av')
  assert.equal(gateAdvancingEnvelope(envelope, CTX).ok, true)
})

test('smoke fixture is advancing-packet-v1 and gates clean', () => {
  assert.equal(SMOKE_ADVANCING_EXTRACT.schema, 'advancing-packet-v1')
  assert.ok(Array.isArray(SMOKE_ADVANCING_EXTRACT.packets))
  const envelope = parseAdvancingEnvelope(SMOKE_ADVANCING_EXTRACT)
  const gate = gateAdvancingEnvelope(envelope, CTX)
  assert.equal(gate.ok, true)
})
