import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SILENT_BOOKING_FEE_PER_PAYER,
  SILENT_BUNDLED_PER_PAYER,
  SILENT_CC_FEE_PCT,
} from '../../lib/pnl-run-costing.ts'
import {
  INSIDE_FEES_FIELD_KEY,
  INSIDE_SEED_KEYS,
  applyContractKnownInsideEntries,
  buildCustomInsideEntry,
  contractKnownInsideLines,
  isContractKnownInsideSource,
  liveRecalcInsideEntries,
  resolveSheetInsideCosts,
  seedStandardInsideEntries,
  standardInsideSpecs,
} from '../../lib/inside-fee-lines.ts'

describe('Wave A2 inside fee lines', () => {
  it('seeds Estimate booking + CC from Factors / silent defaults, never known', () => {
    const silent = seedStandardInsideEntries({
      payerCount: 100,
      grossTicketSales: 10_000,
    })
    assert.equal(silent.every(e => e.inside_kind !== 'custom'), true)
    assert.equal(silent.find(e => e.seed_key === INSIDE_SEED_KEYS.bookingFee)?.amount, 100 * SILENT_BUNDLED_PER_PAYER)
    assert.equal(silent.some(e => e.seed_key === INSIDE_SEED_KEYS.ccFee), false)

    const split = seedStandardInsideEntries({
      payerCount: 100,
      grossTicketSales: 10_000,
      hasCcSplitHistory: true,
    })
    assert.equal(split.find(e => e.seed_key === INSIDE_SEED_KEYS.bookingFee)?.amount, 100 * SILENT_BOOKING_FEE_PER_PAYER)
    assert.equal(split.find(e => e.seed_key === INSIDE_SEED_KEYS.ccFee)?.amount, 10_000 * SILENT_CC_FEE_PCT / 100)
    assert.equal(split.every(e => e.confirmed === false), true)

    const fromFactors = seedStandardInsideEntries({
      payerCount: 100,
      grossTicketSales: 10_000,
      factors: { bookingFeePerPayer: 3, ccFeePct: 2, ticketingInsidePct: 1 },
    })
    assert.equal(fromFactors.find(e => e.seed_key === INSIDE_SEED_KEYS.bookingFee)?.amount, 300)
    assert.equal(fromFactors.find(e => e.seed_key === INSIDE_SEED_KEYS.ccFee)?.amount, 200)
    assert.equal(fromFactors.find(e => e.seed_key === INSIDE_SEED_KEYS.ticketingInside)?.amount, 100)
  })

  it('skips tombstoned standard lines and optional comps unless Factors seeded', () => {
    const specs = standardInsideSpecs({ factors: { bookingFeePerPayer: 4.5, ccFeePct: 1.6 } })
    assert.equal(specs.some(s => s.seedKey === INSIDE_SEED_KEYS.compTickets), false)

    const withComp = seedStandardInsideEntries({
      payerCount: 10,
      grossTicketSales: 1000,
      factors: { compTicketFeePerPayer: 2 },
      tombstonedSeedKeys: [INSIDE_SEED_KEYS.ccFee],
    })
    assert.equal(withComp.some(e => e.seed_key === INSIDE_SEED_KEYS.ccFee), false)
    assert.equal(withComp.find(e => e.seed_key === INSIDE_SEED_KEYS.compTickets)?.amount, 20)
  })

  it('recalculates $ from an edited rate against live payers / gross', () => {
    const [line] = seedStandardInsideEntries({
      payerCount: 100,
      grossTicketSales: 10_000,
      hasCcSplitHistory: true,
    })
    const live = liveRecalcInsideEntries([{ ...line!, rate: 5 }], { payerCount: 80, grossTicketSales: 8000 })
    assert.equal(live[0]?.amount, 400)
  })

  it('custom add is label + $ only and still tagged inside', () => {
    const custom = buildCustomInsideEntry({ description: 'Venue inside admin', amount: 75 })
    assert.equal(custom.inside_kind, 'custom')
    assert.equal(custom.rate, null)
    assert.equal(custom.amount, 75)
    assert.equal(INSIDE_FEES_FIELD_KEY, 'inside_fees')
  })

  it('contract known writes Confirmed; settlement remittance does not', () => {
    assert.equal(isContractKnownInsideSource('contract'), true)
    assert.equal(isContractKnownInsideSource('settlement'), false)
    assert.equal(isContractKnownInsideSource('remittance'), false)

    const contract = contractKnownInsideLines([
      { showId: 's1', description: 'Booking fee', amount: 320, source: 'contract' },
      { showId: 's1', description: 'Merchant fee', amount: 90, source: 'settlement' },
    ], 's1')
    assert.equal(contract.length, 1)

    const applied = applyContractKnownInsideEntries({
      existing: [],
      contractLines: contract,
    })
    assert.equal(applied.entries[0]?.amount, 320)
    assert.equal(applied.entries[0]?.confirmed, true)
    assert.equal(applied.entries[0]?.seed_key, INSIDE_SEED_KEYS.bookingFee)
  })

  it('sheet insides prefer itemised lines and ignore settlement remittance overwrite', () => {
    const entries = seedStandardInsideEntries({
      payerCount: 100,
      grossTicketSales: 10_000,
      factors: { bookingFeePerPayer: 4.5, ccFeePct: 1.6 },
    })
    const fromLines = resolveSheetInsideCosts({
      grossTicketSales: 10_000,
      payerCount: 100,
      entries,
    })
    assert.equal(fromLines.total, 450 + 160)
    assert.equal(fromLines.source, 'estimated')

    const settlementDoesNotWin = resolveSheetInsideCosts({
      grossTicketSales: 10_000,
      payerCount: 100,
      entries,
      contractLines: [
        { showId: 's1', description: 'Booking fee', amount: 1, source: 'settlement' },
      ],
      showId: 's1',
    })
    assert.equal(settlementDoesNotWin.total, 450 + 160)
    assert.notEqual(settlementDoesNotWin.total, 1)
  })

  it('Harbour waterfall still uses gross − insides; 10% stays locked', () => {
    const inside = resolveSheetInsideCosts({
      grossTicketSales: 10_000,
      payerCount: 100,
      factors: { bookingFeePerPayer: 5, ccFeePct: 2 },
    })
    assert.equal(inside.total, 700)
  })
})
