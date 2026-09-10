import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ALL_SHOWS_LABEL,
  assignShowDateToTour,
  compareToursForMatch,
  findTourOverlaps,
  groupRunsByTour,
  isCompleteTour,
  matchingToursForRun,
  tourRangeError,
  UNASSIGNED_TOUR_HEADING,
  visibleTours,
  type TourRow,
} from '../../lib/tours.ts'
import { canAccessAdminSettings, canAccessPage } from '../../lib/role-access.ts'

function tour(partial: Partial<TourRow> & Pick<TourRow, 'id' | 'name'>): TourRow {
  return {
    date_from: null,
    date_to: null,
    sort_order: 0,
    ...partial,
  }
}

describe('tour completeness and visibility', () => {
  it('tabs only include tours with both dates', () => {
    const incomplete = tour({ id: 'a', name: 'Open', date_from: '2026-01-01', date_to: null, sort_order: 1 })
    const complete = tour({ id: 'b', name: 'Closed', date_from: '2026-01-01', date_to: '2026-12-31', sort_order: 2 })
    assert.equal(isCompleteTour(incomplete), false)
    assert.equal(isCompleteTour(complete), true)
    assert.deepEqual(visibleTours([incomplete, complete]).map(t => t.id), ['b'])
  })

  it('allows a null range without a range error', () => {
    assert.equal(tourRangeError(null, null), null)
    assert.equal(tourRangeError('2026-01-01', null), null)
    assert.equal(tourRangeError(null, '2026-12-31'), null)
    assert.equal(tourRangeError('2026-06-01', '2026-01-01'), 'End date must be on or after the start date.')
  })
})

describe('show assignment — first match by sort_order, date_from, name', () => {
  const early = tour({ id: 'early', name: 'Zeta', date_from: '2026-01-01', date_to: '2026-12-31', sort_order: 10 })
  const late = tour({ id: 'late', name: 'Alpha', date_from: '2026-01-01', date_to: '2026-12-31', sort_order: 20 })

  it('assigns a show to the first overlapping complete tour', () => {
    assert.equal(assignShowDateToTour('2026-06-15', [late, early])?.id, 'early')
  })

  it('breaks sort ties with date_from then name', () => {
    const a = tour({ id: 'a', name: 'B-tour', date_from: '2026-01-01', date_to: '2026-12-31', sort_order: 5 })
    const b = tour({ id: 'b', name: 'A-tour', date_from: '2026-01-01', date_to: '2026-12-31', sort_order: 5 })
    assert.equal(compareToursForMatch(a, b) > 0, true)
    assert.equal(assignShowDateToTour('2026-03-01', [a, b])?.id, 'b')
  })

  it('does not use hardcoded year bounds — only the tours table rows', () => {
    const custom = tour({ id: 'custom', name: 'Odd window', date_from: '2028-03-01', date_to: '2028-03-31', sort_order: 1 })
    assert.equal(assignShowDateToTour('2026-06-01', [custom]), null)
    assert.equal(assignShowDateToTour('2028-03-10', [custom])?.id, 'custom')
  })
})

describe('run grouping', () => {
  const t2026 = tour({ id: 't26', name: 'Tour 26', date_from: '2026-01-01', date_to: '2026-12-31', sort_order: 10 })
  const t2027 = tour({ id: 't27', name: 'Tour 27', date_from: '2027-01-01', date_to: '2027-12-31', sort_order: 20 })

  it('places a multi-tour run under each matching tour honestly', () => {
    const run = {
      id: 'span',
      shows: [
        { show_date: '2026-05-01' },
        { show_date: '2027-05-01' },
      ],
    }
    assert.deepEqual(matchingToursForRun(run, [t2026, t2027]).map(t => t.id), ['t26', 't27'])
    const groups = groupRunsByTour([run], [t2026, t2027])
    assert.deepEqual(groups.map(g => g.heading), ['Tour 26', 'Tour 27'])
    assert.equal(groups[0]!.runs[0]!.id, 'span')
    assert.equal(groups[1]!.runs[0]!.id, 'span')
  })

  it('puts unmatched runs under Unassigned', () => {
    const run = { id: 'orphan', shows: [{ show_date: '2029-01-01' }] }
    const groups = groupRunsByTour([run], [t2026])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]!.heading, UNASSIGNED_TOUR_HEADING)
  })

  it('stays flat when no complete tours exist', () => {
    const run = { id: 'r1', shows: [{ show_date: '2026-01-01' }] }
    const groups = groupRunsByTour([run], [tour({ id: 'open', name: 'Soon' })])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]!.heading, null)
    assert.equal(ALL_SHOWS_LABEL, 'ALL SHOWS')
  })
})

describe('overlap warning', () => {
  it('detects overlapping complete ranges and ignores incomplete', () => {
    const a = tour({ id: 'a', name: 'A', date_from: '2026-01-01', date_to: '2026-06-30', sort_order: 1 })
    const b = tour({ id: 'b', name: 'B', date_from: '2026-06-01', date_to: '2026-12-31', sort_order: 2 })
    const open = tour({ id: 'c', name: 'C', date_from: '2026-01-01', sort_order: 3 })
    assert.equal(findTourOverlaps([a, b, open]).length, 1)
    assert.equal(findTourOverlaps([a, open]).length, 0)
  })
})

describe('admin settings access', () => {
  it('is admin/owner only; Profile stays on every role', () => {
    assert.equal(canAccessAdminSettings('admin'), true)
    assert.equal(canAccessAdminSettings('owner'), true)
    assert.equal(canAccessAdminSettings('crew'), false)
    assert.equal(canAccessAdminSettings('production'), false)
    assert.equal(canAccessPage('admin', '/admin-settings'), true)
    assert.equal(canAccessPage('owner', '/admin-settings'), true)
    assert.equal(canAccessPage('crew', '/admin-settings'), false)
    assert.equal(canAccessPage('crew', '/settings'), true)
    assert.equal(canAccessPage('production', '/profile'), true)
  })
})
