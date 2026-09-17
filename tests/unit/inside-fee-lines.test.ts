import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeVenueWaterfall, HARBOUR_COMMISSION_RATE } from '../../lib/pnl-run-costing.ts'
import {
  INSIDE_FEES_FIELD_KEY,
  INSIDE_FEES_LABEL,
  INSIDE_SEED_KEYS,
  applyContractKnownInsideEntries,
  buildCustomInsideEntry,
  contractKnownInsideLines,
  isContractKnownInsideSource,
  isHarbourDraftInsideSource,
  isKnownInsideSeedSource,
  liveRecalcInsideEntries,
  knownInsideSeedLines,
  resolveSheetInsideCosts,
  seedStandardInsideEntries,
  standardInsideSpecs,
} from '../../lib/inside-fee-lines.ts'
import { filterVisibleFactors, isRetiredFactorKey, RETIRED_FACTOR_KEYS } from '../../lib/retired-factors.ts'
import { FACTOR_COSTING_FIELD_MAP, FACTORS_NEVER_REFRESH_FIELD_KEYS } from '../../lib/factors-refresh.ts'

describe('Wave A2.1 inside fee lines', () => {
  it('does not seed from Factors or silent defaults — empty until known', () => {
    const silent = seedStandardInsideEntries({
      payerCount: 100,
      grossTicketSales: 10_000,
    })
    assert.deepEqual(silent, [])

    const fromRetiredKeys = seedStandardInsideEntries({
      payerCount: 100,
      grossTicketSales: 10_000,
    })
    assert.equal(fromRetiredKeys.length, 0)

    const specs = standardInsideSpecs({
      bookingFeePerPayer: 4.5,
      ccFeePct: 1.6,
    })
    assert.equal(specs.some(s => s.seedKey === INSIDE_SEED_KEYS.bookingFee), true)
    assert.equal(specs.every(s => s.usedFactors === false), true)
  })

  it('seeds Confirmed lines from contract and Harbour Draft, never settlement', () => {
    assert.equal(isContractKnownInsideSource('contract'), true)
    assert.equal(isHarbourDraftInsideSource('harbour_draft'), true)
    assert.equal(isKnownInsideSeedSource('draft'), true)
    assert.equal(isKnownInsideSeedSource('settlement'), false)
    assert.equal(isKnownInsideSeedSource('remittance'), false)

    const mixed = knownInsideSeedLines([
      { showId: 's1', description: 'Booking fee', amount: 320, source: 'contract' },
      { showId: 's1', description: 'Merchant fee', amount: 90, source: 'harbour_draft' },
      { showId: 's1', description: 'CC fee', amount: 1, source: 'settlement' },
    ], 's1')
    assert.equal(mixed.length, 2)

    const seeded = seedStandardInsideEntries({
      contractLines: mixed,
      showId: 's1',
    })
    assert.equal(seeded.length, 2)
    assert.equal(seeded.every(e => e.confirmed === true), true)
    assert.equal(seeded.find(e => e.seed_key === INSIDE_SEED_KEYS.bookingFee)?.amount, 320)
  })

  it('skips tombstoned standard lines when applying known seed', () => {
    const applied = applyContractKnownInsideEntries({
      existing: [],
      contractLines: [
        { showId: 's1', description: 'Booking fee', amount: 100, source: 'contract' },
        { showId: 's1', description: 'Merchant fee', amount: 20, source: 'contract' },
      ],
      tombstonedSeedKeys: [INSIDE_SEED_KEYS.bookingFee],
    })
    assert.equal(applied.entries.some(e => e.seed_key === INSIDE_SEED_KEYS.bookingFee), false)
    assert.equal(applied.entries.find(e => e.seed_key === INSIDE_SEED_KEYS.ccFee)?.amount, 20)
  })

  it('recalculates $ from an edited rate against live payers / gross', () => {
    const [line] = seedStandardInsideEntries({
      payerCount: 100,
      grossTicketSales: 10_000,
      bookingFeePerPayer: 4.5,
    })
    assert.ok(line)
    const live = liveRecalcInsideEntries([{ ...line!, rate: 5 }], { payerCount: 80, grossTicketSales: 8000 })
    assert.equal(live[0]?.amount, 400)
  })

  it('custom add is label + $ only and still tagged inside', () => {
    const custom = buildCustomInsideEntry({ description: 'Venue inside admin', amount: 75 })
    assert.equal(custom.inside_kind, 'custom')
    assert.equal(custom.rate, null)
    assert.equal(custom.amount, 75)
    assert.equal(INSIDE_FEES_FIELD_KEY, 'inside_fees')
    assert.equal(INSIDE_FEES_LABEL, 'Inside Fees')
  })

  it('contract known writes Confirmed; settlement remittance does not', () => {
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

  it('sheet insides prefer itemised lines, ignore settlement overwrite, and stay empty without seed', () => {
    const entries = seedStandardInsideEntries({
      payerCount: 100,
      grossTicketSales: 10_000,
      bookingFeePerPayer: 4.5,
      ccFeePct: 1.6,
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

    const empty = resolveSheetInsideCosts({
      grossTicketSales: 10_000,
      payerCount: 100,
    })
    assert.equal(empty.total, 0)
    assert.match(empty.sourceLabel, /empty/i)
  })

  it('Harbour waterfall still uses gross − insides; 10% stays locked', () => {
    const inside = resolveSheetInsideCosts({
      grossTicketSales: 10_000,
      payerCount: 100,
      entries: seedStandardInsideEntries({
        payerCount: 100,
        grossTicketSales: 10_000,
        bookingFeePerPayer: 5,
        ccFeePct: 2,
      }),
    })
    const waterfall = computeVenueWaterfall({ grossTicketSales: 10_000, insideTotal: inside.total })
    assert.equal(inside.total, 700)
    assert.equal(waterfall.commissionable, 9300)
    assert.equal(waterfall.harbourCommission, 930)
    assert.equal(HARBOUR_COMMISSION_RATE, 0.10)
  })

  it('retires inside / APRA Factors keys from UI and seed map', () => {
    for (const key of RETIRED_FACTOR_KEYS) {
      assert.equal(isRetiredFactorKey(key), true)
      assert.equal(key in FACTOR_COSTING_FIELD_MAP, false)
    }
    assert.equal(isRetiredFactorKey('music_rights_pct'), false)
    assert.equal(FACTORS_NEVER_REFRESH_FIELD_KEYS.has('inside_fees'), true)
    const visible = filterVisibleFactors([
      { key: 'music_rights_pct' },
      { key: 'apra_pct' },
      { key: 'booking_fee_per_payer' },
      { key: 'cc_fee_pct' },
    ])
    assert.deepEqual(visible.map(f => f.key), ['music_rights_pct'])
  })
})
