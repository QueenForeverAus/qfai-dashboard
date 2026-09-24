import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'
import { canAccessPage } from '../../lib/role-access.ts'
import { sameVenue, matchShowByVenueAndDate, type IdentityShow } from '../../lib/show-identity-match.ts'
import { daysUntilShow, ticketSalesHorizon } from '../../lib/ticket-sales-horizon.ts'
import {
  parseTicketSalesWorkbook,
  snapshotRowsAsOf,
  pickTicketSalesSheetName,
  pctSold,
} from '../../lib/ticket-sales-sheet.ts'
import {
  buildTicketSalesBoard,
  formatWeekDelta,
  isTicketSalesBoardCandidate,
} from '../../lib/ticket-sales-board.ts'
import { withMatchedShowIds } from '../../lib/ticket-sales-persist.ts'

const TODAY = '2026-09-24'

function portal(partial: IdentityShow & { run_code?: string }): IdentityShow & { run_code: string } {
  return { run_code: partial.run_code ?? '26R01', ...partial }
}

describe('ticket sales access', () => {
  it('is owner/admin only, same gate as costings and ticket outlook', () => {
    for (const role of ['admin', 'owner'] as const) {
      assert.equal(canAccessPage(role, '/ticket-sales'), true)
      assert.equal(canAccessPage(role, '/factors'), true)
    }
    for (const role of ['production', 'crew', 'external'] as const) {
      assert.equal(canAccessPage(role, '/ticket-sales'), false)
    }
  })
})

describe('horizon cut-points', () => {
  it('treats 16 weeks as Near and the next day as Mid', () => {
    assert.equal(daysUntilShow('2026-09-24', TODAY), 0)
    assert.equal(ticketSalesHorizon('2027-01-14', TODAY), 'near')
    assert.equal(daysUntilShow('2027-01-14', TODAY), 16 * 7)
    assert.equal(ticketSalesHorizon('2027-01-15', TODAY), 'mid')
  })

  it('treats 40 weeks as Mid and the next day as Far', () => {
    assert.equal(daysUntilShow('2027-07-01', TODAY), 40 * 7)
    assert.equal(ticketSalesHorizon('2027-07-01', TODAY), 'mid')
    assert.equal(ticketSalesHorizon('2027-07-02', TODAY), 'far')
  })
})

describe('venue match reuses Import Schedule sameVenue', () => {
  const shows = [
    portal({ id: 'capitol', show_date: '2026-09-18', venue_name: 'Capitol Theatre', venue_city: 'Tamworth' }),
    portal({ id: 'retired', show_date: '2026-09-18', venue_name: 'RETIRED — DEMO TRECV1 · Newcastle Civic', venue_city: 'Newcastle', harbour_status: 'RETIRED' }),
    portal({ id: 'darwin', show_date: '2026-10-03', venue_name: 'Darwin Ent Centre', venue_city: 'Darwin' }),
    portal({ id: 'hota', show_date: '2026-10-16', venue_name: 'HOTA - Theatre 1', venue_city: 'Gold Coast' }),
    portal({ id: 'york', show_date: '2026-11-27', venue_name: 'York on Lilydale', venue_city: 'Mt Evelyn' }),
    portal({ id: 'goulburn', show_date: '2027-05-14', venue_name: 'Goulburn Performing Arts Centre', venue_city: 'Goulburn' }),
    portal({ id: 'bega', show_date: '2027-05-14', venue_name: 'Bega Valley Civic Centre', venue_city: 'Bega' }),
  ]

  it('matches shortened venue names and ignores retired date twins', () => {
    assert.equal(sameVenue('Darwin Entertainment Centre', 'Darwin Ent Centre'), true)
    assert.equal(sameVenue('HOTA', 'HOTA - Theatre 1'), true)
    assert.equal(matchShowByVenueAndDate({ show_date: '2026-09-18', venue_name: 'Capitol Theatre', venue_city: 'Tamworth' }, shows)?.id, 'capitol')
    assert.equal(matchShowByVenueAndDate({ show_date: '2026-10-03', venue_name: 'Darwin Entertainment Centre', venue_city: 'Darwin' }, shows)?.id, 'darwin')
    assert.equal(matchShowByVenueAndDate({ show_date: '2026-10-16', venue_name: 'HOTA', venue_city: 'Gold Coast' }, shows)?.id, 'hota')
    assert.equal(matchShowByVenueAndDate({ show_date: '2026-11-27', venue_name: 'York On Lilydale', venue_city: 'Mt Evelyn' }, shows)?.id, 'york')
  })

  it('uses venue to split two live shows on one date and leaves unknowns unmatched', () => {
    assert.equal(matchShowByVenueAndDate({ show_date: '2027-05-14', venue_name: 'Bega Valley Civic Centre', venue_city: 'Bega' }, shows)?.id, 'bega')
    assert.equal(matchShowByVenueAndDate({ show_date: '2026-12-15', venue_name: 'Nowhere Theatre', venue_city: 'Nowhere' }, shows), null)
    assert.equal(matchShowByVenueAndDate({ show_date: null, venue_name: 'Capitol Theatre', venue_city: 'Tamworth' }, shows), null)
  })

  it('links the seeded 2026 sheet names, including exact Araluen Arts', () => {
    const seeded = [
      portal({ id: 'bruce', show_date: '2026-09-04', venue_name: 'Bruce Mason Centre', venue_city: 'Auckland', run_code: '26R02' }),
      portal({ id: 'bnz', show_date: '2026-09-05', venue_name: 'BNZ Theatre', venue_city: 'Hamilton', run_code: '26R02' }),
      portal({ id: 'capitol', show_date: '2026-09-18', venue_name: 'Capitol Theatre', venue_city: 'Tamworth', run_code: '26R03' }),
      portal({ id: 'retired-civic', show_date: '2026-09-18', venue_name: 'RETIRED — DEMO TRECV1 · Newcastle Civic', venue_city: 'Newcastle', harbour_status: 'RETIRED', run_code: 'TRECV1' }),
      portal({ id: 'glasshouse', show_date: '2026-09-19', venue_name: 'Glasshouse Theatre', venue_city: 'Port Macquarie', run_code: '26R03' }),
      portal({ id: 'retired-town-hall', show_date: '2026-09-19', venue_name: 'RETIRED — DEMO TRECV1 · Tamworth Town Hall', venue_city: 'Tamworth', harbour_status: 'RETIRED', run_code: 'TRECV1' }),
      portal({ id: 'araluen', show_date: '2026-10-02', venue_name: 'Araluen Arts', venue_city: 'Araluen', run_code: '26R04' }),
      portal({ id: 'darwin', show_date: '2026-10-03', venue_name: 'Darwin Ent Centre', venue_city: 'Darwin', run_code: '26R04' }),
      portal({ id: 'hota', show_date: '2026-10-16', venue_name: 'HOTA - Theatre 1', venue_city: 'Gold Coast', run_code: '26R05' }),
      portal({ id: 'empire', show_date: '2026-10-17', venue_name: 'Empire Theatre', venue_city: 'Toowoomba', run_code: '26R05' }),
      portal({ id: 'frankston', show_date: '2026-11-06', venue_name: 'Frankston Arts Centre', venue_city: 'Frankston', run_code: '26R07' }),
      portal({ id: 'ulumbarra', show_date: '2026-11-07', venue_name: 'Ulumbarra Theatre', venue_city: 'Bendigo', run_code: '26R07' }),
      portal({ id: 'shoppingtown', show_date: '2026-11-20', venue_name: 'Shoppingtown Hotel', venue_city: 'Doncaster', run_code: '26R08' }),
      portal({ id: 'chelsea', show_date: '2026-11-21', venue_name: 'Chelsea Heights', venue_city: 'Aspendale Gardens', run_code: '26R08' }),
      portal({ id: 'york', show_date: '2026-11-27', venue_name: 'York on Lilydale', venue_city: 'Mt Evelyn', run_code: '26R09' }),
      portal({ id: 'commercial', show_date: '2026-11-28', venue_name: 'Commercial Hotel', venue_city: 'South Morang', run_code: '26R09' }),
    ]
    const sheet: Array<[string, string, string, string]> = [
      ['2026-09-04', 'Bruce Mason Centre', 'Auckland', 'bruce'],
      ['2026-09-05', 'BNZ Theatre', 'Hamilton', 'bnz'],
      ['2026-09-18', 'Capitol Theatre', 'Tamworth', 'capitol'],
      ['2026-09-19', 'Glasshouse Theatre', 'Port Macquarie', 'glasshouse'],
      ['2026-10-02', 'Araluen Arts', 'Araluen', 'araluen'],
      ['2026-10-03', 'Darwin Entertainment Centre', 'Darwin', 'darwin'],
      ['2026-10-16', 'HOTA', 'Gold Coast', 'hota'],
      ['2026-10-17', 'Empire Theatre', 'Toowoomba', 'empire'],
      ['2026-11-06', 'Frankston Arts Centre', 'Frankston', 'frankston'],
      ['2026-11-07', 'Ulumbarra Theatre', 'Bendigo', 'ulumbarra'],
      ['2026-11-20', 'Shoppingtown Hotel', 'Doncaster', 'shoppingtown'],
      ['2026-11-21', 'Chelsea Heights', 'Aspendale Gardens', 'chelsea'],
      ['2026-11-27', 'York On Lilydale', 'Mt Evelyn', 'york'],
      ['2026-11-28', 'Commercial Hotel', 'South Morang', 'commercial'],
    ]
    for (const [show_date, venue_name, venue_city, id] of sheet) {
      assert.equal(matchShowByVenueAndDate({ show_date, venue_name, venue_city }, seeded)?.id, id)
    }

    const linked = withMatchedShowIds(
      sheet.map(([showDate, venueName, venueCity]) => ({ showDate, venueName, venueCity })),
      seeded,
    )
    assert.equal(linked.matched, sheet.length)
    assert.equal(linked.rows.find(row => row.venueName === 'Araluen Arts')?.showId, 'araluen')
    assert.equal(linked.rows.every(row => row.showId), true)
  })
})

describe('weekly ticket sheet', () => {
  it('prefers a Ticket Sales tab, otherwise the latest year tab', () => {
    assert.equal(pickTicketSalesSheetName(['2025', 'Ticket Sales', '2026']), 'Ticket Sales')
    assert.equal(pickTicketSalesSheetName(['2024 Summary', '2025', '2026 Tour Schedule', '2026']), '2026')
  })

  it('reads Current Sales, on-sale capacity, and uneven venue groups', () => {
    const aoa = [
      ['QUEEN FOREVER', 'Country Club', null, null, 'QPAC (Concert Hall)', null, null, null, null, 'TBC'],
      [],
      ['DATE:', 'Thu 29 Jan 2026', null, null, 'Sat 16 May 2026', null, null, null, null, 'Fri 1 Jan 2027'],
      ['CITY:', 'Launceston, TAS', null, null, 'Brisbane, QLD'],
      ['CAPACITY:', 479, null, null, 1955],
      ['ON SALE CAPACITY:', 261, null, null, 1532],
      ['UPDATE SOURCE:', 'Ticketmaster', null, null, 'Ticketek'],
      ['', 'Comp', 'Current Sales', 'Total', 'Comp', 'Prem', 'A Res', 'Current Sales', 'Total'],
      ['September 11, 2026', 1, 200, 201, 2, 50, 60, 1400, 1512],
      ['September 18, 2026', 1, 216, 218, 2, 55, 70, 1476, 1603],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '2026')
    const parsed = parseTicketSalesWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
    assert.equal(parsed.sheetName, '2026')
    assert.deepEqual(parsed.shows.map(show => show.venueName), ['Country Club', 'QPAC (Concert Hall)'])
    const qpac = parsed.shows[1]!
    assert.equal(qpac.showDate, '2026-05-16')
    assert.equal(qpac.venueCity, 'Brisbane')
    assert.equal(qpac.stateTerritory, 'QLD')
    assert.equal(qpac.onSaleCapacity, 1532)
    assert.equal(qpac.weeks.at(-1)?.currentSales, 1476)
    assert.notEqual(qpac.weeks.at(-1)?.currentSales, 55)

    const latest = snapshotRowsAsOf(parsed.shows, '2026-09-18')
    const country = latest[0]!
    assert.equal(country.sold, 216)
    assert.equal(country.displayCapacity, 261)
    assert.equal(country.capacityBasis, 'on_sale')
    assert.equal(country.reportedOnAsOf, true)
    assert.equal(country.pctSold, pctSold(216, 261))

    const earlier = snapshotRowsAsOf(parsed.shows, '2026-09-11')
    assert.equal(earlier[0]!.sold, 200)
    const carried = snapshotRowsAsOf(parsed.shows, '2026-09-25')
    assert.equal(carried[0]!.sold, 216)
    assert.equal(carried[0]!.reportedOnAsOf, false)
  })
})

describe('board', () => {
  const portalShows = [
    portal({ id: 'araluen', show_date: '2026-10-02', venue_name: 'Araluen Arts', venue_city: 'Araluen', run_code: '26R04' }),
    portal({ id: 'capitol', show_date: '2026-09-25', venue_name: 'Capitol Theatre', venue_city: 'Tamworth', run_code: '26R03' }),
    portal({ id: 'retired', show_date: '2026-09-25', venue_name: 'RETIRED — DEMO', venue_city: 'Newcastle', harbour_status: 'RETIRED', run_code: 'TRECV1' }),
  ]

  const latestRows = [
    {
      sheetRowKey: '2026-10-02|araluen',
      venueName: 'Araluen Arts',
      venueCity: 'Araluen',
      stateTerritory: 'NT',
      showDate: '2026-10-02',
      sold: 323,
      displayCapacity: 457,
      capacityBasis: 'on_sale' as const,
      pctSold: 71,
      reportedOnAsOf: true,
      updateSource: 'Autoreport',
    },
    {
      sheetRowKey: '2026-09-25|capitol',
      venueName: 'Capitol Theatre',
      venueCity: 'Tamworth',
      stateTerritory: 'NSW',
      showDate: '2026-09-25',
      sold: 353,
      displayCapacity: 370,
      capacityBasis: 'on_sale' as const,
      pctSold: 95,
      reportedOnAsOf: true,
      updateSource: null,
    },
    {
      sheetRowKey: '2026-05-16|qpac',
      venueName: 'QPAC (Concert Hall)',
      venueCity: 'Brisbane',
      stateTerritory: 'QLD',
      showDate: '2026-05-16',
      sold: 1476,
      displayCapacity: 1532,
      capacityBasis: 'on_sale' as const,
      pctSold: 96,
      reportedOnAsOf: false,
      updateSource: null,
    },
    {
      sheetRowKey: '2026-12-01|nowhere',
      venueName: 'Nowhere Theatre',
      venueCity: 'Nowhere',
      stateTerritory: 'NSW',
      showDate: '2026-12-01',
      sold: 12,
      displayCapacity: 400,
      capacityBasis: 'house' as const,
      pctSold: 3,
      reportedOnAsOf: true,
      updateSource: null,
    },
  ]

  it('shows Δ week, keeps past quiet shows off the board, and lists unmatched', () => {
    assert.equal(isTicketSalesBoardCandidate(latestRows[2]!, TODAY), false)
    const board = buildTicketSalesBoard({
      today: TODAY,
      latestAsOf: '2026-09-18',
      previousAsOf: '2026-09-11',
      latestRows,
      previousRows: [
        { ...latestRows[0]!, sold: 305 },
        { ...latestRows[1]!, sold: 321 },
      ],
      portalShows,
      paceByShowId: new Map([['araluen', 'watch']]),
    })
    assert.deepEqual(board.rows.map(row => row.venueName), ['Capitol Theatre', 'Araluen Arts'])
    const araluen = board.rows.find(row => row.showId === 'araluen')!
    assert.equal(araluen.deltaLabel, '+18')
    assert.equal(araluen.horizonLabel, 'Near')
    assert.equal(araluen.pace, 'watch')
    assert.equal(araluen.runHref, '/runs/26r04')
    assert.equal(board.rows[0]!.deltaLabel, '+32')
    assert.equal(board.unmatched.length, 1)
    assert.equal(board.unmatched[0]!.venueName, 'Nowhere Theatre')
    assert.deepEqual(formatWeekDelta(10, null, false), { delta: null, label: '—' })
  })

  it('uses an em dash when the show has no previous snapshot row', () => {
    const board = buildTicketSalesBoard({
      today: TODAY,
      latestAsOf: '2026-09-18',
      previousAsOf: null,
      latestRows: [latestRows[0]!],
      previousRows: null,
      portalShows,
      paceByShowId: new Map(),
    })
    assert.equal(board.rows[0]!.deltaLabel, '—')
  })
})
