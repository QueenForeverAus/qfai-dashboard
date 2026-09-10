import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseStatementAttachmentText } from '../../lib/settlement-scrape/attachments.ts'
import {
  SETTLEMENT_SCRAPE_PAID_CONFIRM_NOTE,
  SETTLEMENT_SCRAPE_PRODUCTION_ERROR,
  planSettlementScrapeApply,
} from '../../lib/settlement-scrape/apply-engine.ts'
import {
  BNZ_SETTLEMENT_SCRAPE_PACKET,
  NORTHWHARF_REMITTANCE_SCRAPE_PACKET,
  NORTHWHARF_SETTLEMENT_SCRAPE_PACKET,
  settlementScrapeFixtureById,
} from '../../lib/settlement-scrape/fixtures.ts'
import { parseSettlementScrapePacket, peekSettlementScrapeSchema } from '../../lib/settlement-scrape/packet.ts'
import { ADVANCING_COSTS_LABEL } from '../../lib/settlements-v3.ts'

test('settlement-scrape-packet-v1 parses settlement and remittance envelopes', () => {
  const settlement = parseSettlementScrapePacket(BNZ_SETTLEMENT_SCRAPE_PACKET)
  assert.equal(settlement.ok, true)
  if (!settlement.ok) return
  assert.equal(settlement.packet.schema_version, 'settlement-scrape-packet-v1')
  assert.equal(settlement.packet.kind, 'settlement')
  assert.ok(settlement.packet.attachments.length >= 1)
  assert.equal(peekSettlementScrapeSchema(NORTHWHARF_REMITTANCE_SCRAPE_PACKET), true)
  const remittance = parseSettlementScrapePacket(NORTHWHARF_REMITTANCE_SCRAPE_PACKET)
  assert.equal(remittance.ok, true)
  if (!remittance.ok) return
  assert.equal(remittance.packet.kind, 'remittance')
})

test('attachment text is read automatically — no manual paste', () => {
  const lines = parseStatementAttachmentText([
    'Gross Ticket Sales\t32000',
    'Venue Hire  3,100.00',
    'Ushers,$2000',
    'Due to Hirer $22,918',
  ].join('\n'))
  assert.ok(lines.some(l => l.description === 'Gross Ticket Sales' && l.amount === 32_000))
  assert.ok(lines.some(l => l.description === 'Venue Hire' && l.amount === 3_100))
  assert.ok(lines.some(l => l.description === 'Ushers' && l.amount === 2_000))
  assert.ok(lines.some(l => /Due to Hirer/i.test(l.description) && l.amount === 22_918))
})

test('staging apply reads BNZ-shaped attachment lines and never marks PAID or sends', () => {
  const plan = planSettlementScrapeApply({
    packet: BNZ_SETTLEMENT_SCRAPE_PACKET,
    bookingStatus: 'confirmed',
    showDates: ['2026-04-03'],
    applyEnv: 'staging',
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.sends_email, false)
  assert.equal(plan.writes_paid, false)
  assert.equal(plan.writes_cost_fields, false)
  assert.ok(plan.actuals.some(l => l.line_key === 'show:venue_hire' && l.amount === 3_100))
  assert.ok(plan.actuals.every(l => l.paid === false))
  assert.equal(plan.remittance.length, 0)
})

test('remittance email attachments become remittance lines, not PAID', () => {
  const plan = planSettlementScrapeApply({
    packet: NORTHWHARF_REMITTANCE_SCRAPE_PACKET,
    bookingStatus: 'confirmed',
    showDates: ['2026-04-03'],
  })
  assert.equal(plan.ok, true)
  assert.ok(plan.remittance.some(l => l.line_type === 'payment' && l.amount === 19_000))
  assert.ok(plan.remittance.some(l => l.line_type === 'deduction' && /APRA/i.test(l.description)))
  assert.equal(plan.writes_paid, false)
  assert.equal(plan.sends_email, false)
})

test('production apply_env is refused; money confirm is required for money_action=confirm', () => {
  const prod = planSettlementScrapeApply({
    packet: { ...NORTHWHARF_SETTLEMENT_SCRAPE_PACKET, apply_env: 'production' },
    bookingStatus: 'confirmed',
    showDates: ['2026-04-03'],
    applyEnv: 'production',
  })
  assert.equal(prod.ok, false)
  assert.equal(prod.error, SETTLEMENT_SCRAPE_PRODUCTION_ERROR)

  const needsConfirm = planSettlementScrapeApply({
    packet: { ...NORTHWHARF_SETTLEMENT_SCRAPE_PACKET, money_action: 'confirm' },
    bookingStatus: 'confirmed',
    showDates: ['2026-04-03'],
    confirmMoney: false,
  })
  assert.equal(needsConfirm.ok, true)
  assert.equal(needsConfirm.money_action, 'confirm_needed')
  assert.match(needsConfirm.money_reason, /PAID/)
  assert.match(SETTLEMENT_SCRAPE_PAID_CONFIRM_NOTE, /confirm_money/)

  const confirmed = planSettlementScrapeApply({
    packet: { ...NORTHWHARF_SETTLEMENT_SCRAPE_PACKET, money_action: 'confirm' },
    bookingStatus: 'confirmed',
    showDates: ['2026-04-03'],
    confirmMoney: true,
  })
  assert.equal(confirmed.money_action, 'none')
  assert.equal(confirmed.writes_paid, false)
})

test('pre-show runs are blocked; fixture ids resolve', () => {
  const blocked = planSettlementScrapeApply({
    packet: NORTHWHARF_SETTLEMENT_SCRAPE_PACKET,
    bookingStatus: 'confirmed',
    showDates: ['2099-01-01'],
  })
  assert.equal(blocked.ok, false)
  assert.match(String(blocked.error), /occurred|available/)
  assert.ok(settlementScrapeFixtureById('samp04-northwharf-settlement'))
  assert.equal(settlementScrapeFixtureById('missing'), null)
  assert.equal(ADVANCING_COSTS_LABEL, 'Advancing Costs')
})
