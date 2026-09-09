import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ADVANCING_SHOWS_HREF,
  RUN_COSTINGS_HREF,
  SETTLEMENTS_HREF,
  TOUR_DESK_NAV_CHILDREN,
  TOUR_DESK_NAV_HEADING,
  filterAdvancingShowsList,
  isAdvancingShowsListRun,
  isTourDeskChildActive,
  parseRunDetailTab,
  runDetailHref,
  runDetailTabUrl,
} from '../../lib/tour-desk-nav.ts'

describe('tour desk nav IA', () => {
  it('exposes Tour Desk as a heading with the three Phase 1 children', () => {
    assert.equal(TOUR_DESK_NAV_HEADING, 'Tour Desk')
    assert.deepEqual(
      TOUR_DESK_NAV_CHILDREN.map(c => c.label),
      ['Run Costings', 'Advancing Shows', 'Settlements'],
    )
    assert.deepEqual(
      TOUR_DESK_NAV_CHILDREN.map(c => c.href),
      ['/runs', '/advancing', '/settlements'],
    )
  })

  it('parses run-detail tab query values', () => {
    assert.equal(parseRunDetailTab('advancement'), 'advancement')
    assert.equal(parseRunDetailTab('run_advancing'), 'run_advancing')
    assert.equal(parseRunDetailTab('show_pack'), 'show_pack')
    assert.equal(parseRunDetailTab('costs'), 'costs')
    assert.equal(parseRunDetailTab('pnl'), null)
    assert.equal(parseRunDetailTab(null), null)
  })

  it('builds run detail hrefs without regressing the costing URL', () => {
    assert.equal(runDetailHref('R12'), '/runs/r12')
    assert.equal(runDetailHref('R12', 'costs'), '/runs/r12')
    assert.equal(runDetailHref('R12', 'advancement'), '/runs/r12?tab=advancement')
    assert.equal(runDetailHref('R12', 'run_advancing'), '/runs/r12?tab=run_advancing')
    assert.equal(runDetailHref('R12', 'show_pack'), '/runs/r12?tab=show_pack')
  })

  it('drops ?tab= when returning to Run Costing', () => {
    assert.equal(runDetailTabUrl('/runs/r12', 'tab=advancement', 'costs'), '/runs/r12')
    assert.equal(runDetailTabUrl('/runs/r12', '?tab=show_pack', 'outlook'), '/runs/r12?tab=outlook')
  })

  it('highlights Run Costings on the existing list and costing sheet', () => {
    assert.equal(isTourDeskChildActive({ href: RUN_COSTINGS_HREF, pathname: '/runs' }), true)
    assert.equal(isTourDeskChildActive({ href: RUN_COSTINGS_HREF, pathname: '/runs/r12' }), true)
    assert.equal(isTourDeskChildActive({ href: RUN_COSTINGS_HREF, pathname: '/runs/r12', tab: 'outlook' }), true)
    assert.equal(isTourDeskChildActive({ href: RUN_COSTINGS_HREF, pathname: '/runs/r12', tab: 'audit' }), true)
    assert.equal(isTourDeskChildActive({ href: RUN_COSTINGS_HREF, pathname: '/runs/r12', tab: 'run_advancing' }), false)
    assert.equal(isTourDeskChildActive({ href: RUN_COSTINGS_HREF, pathname: '/runs/r12', tab: 'advancement' }), false)
    assert.equal(isTourDeskChildActive({ href: RUN_COSTINGS_HREF, pathname: '/advancing' }), false)
  })

  it('highlights Advancing Shows on the advancing entry and worksheet tabs', () => {
    assert.equal(isTourDeskChildActive({ href: ADVANCING_SHOWS_HREF, pathname: '/advancing' }), true)
    assert.equal(isTourDeskChildActive({ href: ADVANCING_SHOWS_HREF, pathname: '/runs/r12', tab: 'run_advancing' }), true)
    assert.equal(isTourDeskChildActive({ href: ADVANCING_SHOWS_HREF, pathname: '/runs/r12', tab: 'advancement' }), true)
    assert.equal(isTourDeskChildActive({ href: ADVANCING_SHOWS_HREF, pathname: '/runs/r12', tab: 'show_pack' }), true)
    assert.equal(isTourDeskChildActive({ href: ADVANCING_SHOWS_HREF, pathname: '/runs/r12' }), false)
    assert.equal(isTourDeskChildActive({ href: ADVANCING_SHOWS_HREF, pathname: '/runs' }), false)
  })

  it('highlights Settlements on the Settlements list and run sheet', () => {
    assert.equal(isTourDeskChildActive({ href: SETTLEMENTS_HREF, pathname: '/settlements' }), true)
    assert.equal(isTourDeskChildActive({ href: SETTLEMENTS_HREF, pathname: '/settlements/r12' }), true)
    assert.equal(isTourDeskChildActive({ href: SETTLEMENTS_HREF, pathname: '/runs' }), false)
  })

  it('lists BOOKED runs and active workspaces only — proposed and archived UNBOOKED stay off', () => {
    assert.equal(isAdvancingShowsListRun({ status: 'proposed' }), false)
    assert.equal(isAdvancingShowsListRun({ status: 'proposed', workspace: null }), false)
    assert.equal(isAdvancingShowsListRun({
      status: 'proposed',
      workspace: { archived_at: '2026-09-08T00:00:00.000Z' },
    }), false)
    assert.equal(isAdvancingShowsListRun({ status: 'placeholder' }), false)
    assert.equal(isAdvancingShowsListRun({ status: 'declined' }), false)
    assert.equal(isAdvancingShowsListRun({ status: 'held' }), false)

    assert.equal(isAdvancingShowsListRun({ status: 'confirmed' }), true)
    assert.equal(isAdvancingShowsListRun({ status: 'CONFIRMED' }), true)
    assert.equal(isAdvancingShowsListRun({ status: 'confirmed', workspace: null }), true)
    assert.equal(isAdvancingShowsListRun({
      status: 'confirmed',
      workspace: { archived_at: '2026-09-08T00:00:00.000Z' },
    }), true)

    assert.equal(isAdvancingShowsListRun({
      status: 'proposed',
      workspace: { archived_at: null },
    }), true)
    assert.equal(isAdvancingShowsListRun({
      status: 'booking',
      workspace: { archived_at: null },
    }), true)
    assert.equal(isAdvancingShowsListRun({ status: 'booking' }), false)

    const listed = filterAdvancingShowsList(
      [
        { id: 'proposed', code: 'P01', status: 'proposed' },
        { id: 'booked', code: 'R01', status: 'confirmed' },
        { id: 'trecv1', code: 'TRECV1', status: 'confirmed' },
        { id: 'tcomp1', code: 'TCOMP1', status: 'confirmed' },
        { id: 'unbooked', code: 'U01', status: 'proposed' },
        { id: 'orphan-ws', code: 'W01', status: 'proposed' },
      ],
      run => {
        if (run.id === 'unbooked') return { archived_at: '2026-09-08T12:00:00.000Z' }
        if (run.id === 'orphan-ws') return { archived_at: null }
        return null
      },
    )
    assert.deepEqual(listed.map(r => r.code), ['R01', 'TRECV1', 'TCOMP1', 'W01'])
  })
})
