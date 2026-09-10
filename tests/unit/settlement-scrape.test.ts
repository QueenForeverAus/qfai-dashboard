import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseStatementAttachmentText } from '../../lib/settlement-scrape/attachments.ts'
import {
  SETTLEMENT_SCRAPE_PAID_CONFIRM_NOTE,
  SETTLEMENT_SCRAPE_PRODUCTION_ERROR,
  planSettlementScrapeApply,
  plannedTicketsSoldCount,
  settlementTicketActualKey,
} from '../../lib/settlement-scrape/apply-engine.ts'
import { persistSettlementScrapeApply } from '../../lib/settlement-scrape/apply-persist.ts'
import {
  BNZ_SETTLEMENT_SCRAPE_PACKET,
  HARBOUR_SETTLEMENT_SCRAPE_PACKET,
  LAYCOCK_TICKETS_SETTLEMENT_SCRAPE_PACKET,
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
  assert.ok(settlementScrapeFixtureById('laycock-tickets-settlement'))
  assert.equal(settlementScrapeFixtureById('missing'), null)
  assert.equal(ADVANCING_COSTS_LABEL, 'Advancing Costs')
})

test('sheet ticket count and gross land as separate Actual keys', () => {
  assert.equal(settlementTicketActualKey({ description: 'Tickets sold', amount: 318 }), 'tickets_sold')
  assert.equal(settlementTicketActualKey({ description: 'Attendance', amount: 396 }), 'tickets_sold')
  assert.equal(settlementTicketActualKey({ description: 'tickets_sold', amount: 400, lineKey: 'tickets_sold' }), 'tickets_sold')
  assert.equal(settlementTicketActualKey({ description: 'Gross Ticket Sales', amount: 22_275.9 }), 'gross_ticket_sales')
  assert.equal(settlementTicketActualKey({ description: 'Box Office Gross', amount: 18_000 }), 'gross_ticket_sales')
  assert.equal(settlementTicketActualKey({ description: 'NBO', amount: 12_000 }), 'gross_ticket_sales')
  assert.notEqual(settlementTicketActualKey({ description: 'Tickets sold', amount: 318 }), 'gross_ticket_sales')
})

test('Laycock-like packet writes tickets_sold count + gross_ticket_sales and planned show count', () => {
  const plan = planSettlementScrapeApply({
    packet: LAYCOCK_TICKETS_SETTLEMENT_SCRAPE_PACKET,
    bookingStatus: 'confirmed',
    showDates: ['2026-08-21'],
  })
  assert.equal(plan.ok, true)
  const sold = plan.actuals.find(l => l.line_key === 'tickets_sold')
  const gross = plan.actuals.find(l => l.line_key === 'gross_ticket_sales')
  assert.ok(sold)
  assert.ok(gross)
  assert.equal(sold.amount, 318)
  assert.equal(gross.amount, 22_275.9)
  assert.equal(sold.line_kind, 'venue_settlement')
  assert.equal(gross.line_kind, 'venue_settlement')
  assert.equal(plannedTicketsSoldCount(plan.actuals), 318)
  assert.ok(plan.actuals.some(l => l.line_key.startsWith('inside_pre_commission')))
  assert.ok(plan.actuals.some(l => l.line_key === 'show:venue_hire'))
  assert.equal(plan.actuals.some(l => l.line_key === 'show:due_to_hirer'), false)
  assert.equal(plan.writes_paid, false)
  assert.equal(plan.sends_email, false)
  assert.equal(plan.writes_cost_fields, false)
})

test('Harbour tickets_sold count is not written as gross_ticket_sales', () => {
  const plan = planSettlementScrapeApply({
    packet: HARBOUR_SETTLEMENT_SCRAPE_PACKET,
    bookingStatus: 'confirmed',
    showDates: ['2026-07-18'],
  })
  assert.equal(plan.ok, true)
  assert.ok(plan.actuals.some(l => l.line_key === 'tickets_sold' && l.amount === 400))
  assert.equal(plan.actuals.some(l => l.line_key === 'gross_ticket_sales' && l.amount === 400), false)
})

test('Northwharf gross-only packet writes sales $ and does not invent a ticket count', () => {
  const plan = planSettlementScrapeApply({
    packet: NORTHWHARF_SETTLEMENT_SCRAPE_PACKET,
    bookingStatus: 'confirmed',
    showDates: ['2026-04-03'],
  })
  assert.equal(plan.ok, true)
  assert.ok(plan.actuals.some(l => l.line_key === 'gross_ticket_sales' && l.amount === 28_400))
  assert.equal(plan.actuals.some(l => l.line_key === 'tickets_sold'), false)
  assert.equal(plannedTicketsSoldCount(plan.actuals), null)
})

test('persist apply upserts both ticket Actuals and updates shows.tickets_sold', async () => {
  const writes: Array<{ table: string; op: string; payload?: Record<string, unknown> }> = []
  const admin = fakeAdmin(writes)
  const result = await persistSettlementScrapeApply({
    admin: admin as never,
    runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    runCode: '26R01',
    bookingStatus: 'confirmed',
    showId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    showDates: ['2026-08-21'],
    packet: LAYCOCK_TICKETS_SETTLEMENT_SCRAPE_PACKET,
    actorUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    actorName: 'Comms scrape',
    previewOnly: false,
    confirmMoney: false,
  })
  assert.equal(result.applied, true)
  assert.equal(result.sent, false)
  assert.equal(result.writes_cost_fields, false)
  assert.equal(result.shows_tickets_sold, 318)
  const actualInserts = writes.filter(w => w.table === 'settlement_actual_lines' && w.op === 'insert')
  assert.ok(actualInserts.some(w => w.payload?.line_key === 'tickets_sold' && w.payload?.amount === 318))
  assert.ok(actualInserts.some(w => w.payload?.line_key === 'gross_ticket_sales' && w.payload?.amount === 22_275.9))
  assert.ok(actualInserts.every(w => w.payload?.source === 'email_scrape'))
  assert.ok(actualInserts.every(w => w.payload?.status === 'confirmed'))
  assert.ok(actualInserts.every(w => w.payload?.paid === false))
  const showUpdate = writes.find(w => w.table === 'shows' && w.op === 'update')
  assert.ok(showUpdate)
  assert.equal(showUpdate.payload?.tickets_sold, 318)
})

function fakeAdmin(writes: Array<{ table: string; op: string; payload?: Record<string, unknown> }>) {
  const result = { data: { id: 'row-1' }, error: null }
  const thenable = (value: typeof result) => ({
    then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject),
    data: value.data,
    error: value.error,
  })
  return {
    from(table: string) {
      const api: Record<string, unknown> = {}
      const chain = () => api
      api.select = chain
      api.eq = chain
      api.maybeSingle = async () => ({ data: null, error: null })
      api.single = async () => result
      api.insert = (payload: Record<string, unknown>) => {
        writes.push({ table, op: 'insert', payload })
        return api
      }
      api.update = (payload: Record<string, unknown>) => {
        writes.push({ table, op: 'update', payload })
        return api
      }
      Object.assign(api, thenable(result))
      return api
    },
  }
}
