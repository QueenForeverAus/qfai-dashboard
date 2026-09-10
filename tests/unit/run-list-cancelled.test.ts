import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CANCELLED_OR_RESCHEDULED_HEADING,
  isCancelledOrRescheduledShow,
  partitionRunsActiveVsCancelled,
  partitionShowsActiveVsCancelled,
  runListEndDate,
} from '../../lib/run-list-cancelled.ts'

describe('isCancelledOrRescheduledShow', () => {
  it('matches harbour_status RETIRED case-insensitively', () => {
    assert.equal(isCancelledOrRescheduledShow({ harbour_status: 'RETIRED' }), true)
    assert.equal(isCancelledOrRescheduledShow({ harbour_status: 'retired' }), true)
    assert.equal(isCancelledOrRescheduledShow({ harbour_status: ' Retired ' }), true)
  })

  it('matches venue_name starting with RETIRED (Import title-case fallback)', () => {
    assert.equal(isCancelledOrRescheduledShow({ venue_name: 'RETIRED Civic Theatre' }), true)
    assert.equal(isCancelledOrRescheduledShow({ venue_name: 'Retired Civic Theatre' }), true)
    assert.equal(isCancelledOrRescheduledShow({ venue_name: 'retired — Tamworth' }), true)
  })

  it('does not treat live Harbour statuses or normal venues as retired', () => {
    assert.equal(isCancelledOrRescheduledShow({ harbour_status: 'CONFIRMED' }), false)
    assert.equal(isCancelledOrRescheduledShow({ harbour_status: 'HELD' }), false)
    assert.equal(isCancelledOrRescheduledShow({ harbour_status: '2P' }), false)
    assert.equal(isCancelledOrRescheduledShow({ harbour_status: 'EOI' }), false)
    assert.equal(isCancelledOrRescheduledShow({ harbour_status: null, venue_name: 'Civic Theatre' }), false)
    assert.equal(isCancelledOrRescheduledShow({ venue_name: 'The Retired Sailors Hall' }), false)
    assert.equal(isCancelledOrRescheduledShow({}), false)
    assert.equal(isCancelledOrRescheduledShow(null), false)
  })
})

describe('partitionRunsActiveVsCancelled', () => {
  const active = { id: 'a', show_date: '2027-03-01', venue_name: 'Civic', harbour_status: 'CONFIRMED' }
  const retiredStatus = { id: 'r', show_date: '2026-07-01', venue_name: 'Town Hall', harbour_status: 'RETIRED' }
  const retiredVenue = { id: 'v', show_date: '2026-08-01', venue_name: 'Retired PAC', harbour_status: 'HELD' }

  it('keeps fully-active runs on the main list only', () => {
    const { activeRuns, cancelledRuns } = partitionRunsActiveVsCancelled([
      { id: 'run-1', shows: [active] },
    ])
    assert.equal(activeRuns.length, 1)
    assert.equal(cancelledRuns.length, 0)
    assert.deepEqual(activeRuns[0]!.shows.map(s => s.id), ['a'])
  })

  it('moves a run to the bottom only when every show is retired', () => {
    const { activeRuns, cancelledRuns } = partitionRunsActiveVsCancelled([
      { id: 'run-2', shows: [retiredStatus, retiredVenue] },
    ])
    assert.equal(activeRuns.length, 0)
    assert.equal(cancelledRuns.length, 1)
    assert.deepEqual(cancelledRuns[0]!.shows.map(s => s.id), ['r', 'v'])
  })

  it('splits mixed runs: active shows stay in main, retired shows only at the bottom', () => {
    const { activeRuns, cancelledRuns } = partitionRunsActiveVsCancelled([
      { id: 'run-3', name: 'Mixed', shows: [active, retiredStatus] },
    ])
    assert.equal(activeRuns.length, 1)
    assert.equal(cancelledRuns.length, 1)
    assert.equal(activeRuns[0]!.id, 'run-3')
    assert.equal(cancelledRuns[0]!.id, 'run-3')
    assert.deepEqual(activeRuns[0]!.shows.map(s => s.id), ['a'])
    assert.deepEqual(cancelledRuns[0]!.shows.map(s => s.id), ['r'])
  })

  it('leaves runs with no shows on the main list', () => {
    const { activeRuns, cancelledRuns } = partitionRunsActiveVsCancelled([
      { id: 'empty', shows: [] },
      { id: 'missing' },
    ])
    assert.equal(activeRuns.length, 2)
    assert.equal(cancelledRuns.length, 0)
  })

  it('exports the locked section heading', () => {
    assert.equal(CANCELLED_OR_RESCHEDULED_HEADING, 'Cancelled / rescheduled runs')
  })
})

describe('partitionShowsActiveVsCancelled + runListEndDate', () => {
  it('splits a show list without mutating the original', () => {
    const shows = [
      { id: '1', harbour_status: 'CONFIRMED' },
      { id: '2', harbour_status: 'retired' },
    ]
    const { active, cancelled } = partitionShowsActiveVsCancelled(shows)
    assert.deepEqual(active.map(s => s.id), ['1'])
    assert.deepEqual(cancelled.map(s => s.id), ['2'])
    assert.equal(shows.length, 2)
  })

  it('uses remaining show dates after retired dates are stripped', () => {
    assert.equal(runListEndDate({
      end_date: '2027-12-01',
      shows: [{ show_date: '2026-07-01' }],
    }), '2026-07-01')
    assert.equal(runListEndDate({
      end_date: '2027-12-01',
      shows: [],
    }), '2027-12-01')
  })
})
