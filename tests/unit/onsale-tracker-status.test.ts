import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRowStatus, applyFilter, summaryCounts, sortRows, fmtMelbourne, type OnsaleRow } from '../../lib/onsale-tracker-status.ts'

const base: OnsaleRow = {
  show_id: 'x', show_date: '2027-01-01', announce_at: null, presale_at: null, general_onsale_at: null,
  ticket_link_state: null, ticket_link_received_at: null, edm_state: null, edm_received_at: null,
  website_state: null, website_go_live_at: null, fb_event_state: null, fb_event_live_at: null,
  er_ad_state: null, er_paused_since: null, ticket_ad_state: null, ticket_paused_since: null,
  pixel_state: null, next_action_owner: null, manual_red_flag: false, manual_red_reason: null,
}
// Seed facts (mirrors seed-staging.sql)
const mandurah: OnsaleRow = { ...base, show_id: 'mandurah', show_date: '2027-04-02', ticket_link_state: 'received', ticket_link_received_at: '2026-09-25T14:34:25+10:00', edm_state: 'none', website_state: 'not_built', next_action_owner: 'Gareth' }
const albury: OnsaleRow = { ...base, show_id: 'albury', show_date: '2027-04-24', ticket_link_state: 'live', edm_state: 'sent_scheduled', website_state: 'live', fb_event_state: 'live', er_ad_state: 'paused', er_paused_since: '2026-09-25T15:00:12+10:00', pixel_state: 'chasing', next_action_owner: 'Gareth' }
const thirroul: OnsaleRow = { ...base, show_id: 'thirroul', show_date: '2027-03-13', announce_at: '2026-09-28T09:00:00+10:00', presale_at: '2026-09-28T10:00:00+10:00', general_onsale_at: '2026-09-29T10:00:00+10:00', ticket_link_state: 'received', ticket_link_received_at: '2026-09-25T14:52:14+10:00', edm_state: 'none', website_state: 'scheduled', website_go_live_at: '2026-09-28T10:00:00+10:00', fb_event_state: 'drafted', next_action_owner: 'Gareth' }
const perth: OnsaleRow = { ...base, show_id: 'perth', show_date: '2027-04-03', website_state: 'live', er_ad_state: 'none', manual_red_flag: true, manual_red_reason: 'FB Event wrong date', next_action_owner: 'Gareth' }
const bunbury: OnsaleRow = { ...base, show_id: 'bunbury', show_date: '2027-04-01', ticket_link_state: 'approved', edm_state: 'sent_scheduled', website_state: 'scheduled', website_go_live_at: '2026-09-28T11:00:00+10:00', pixel_state: 'cant_add' }
const brokenHill: OnsaleRow = { ...base, show_id: 'bh', show_date: '2027-02-11', ticket_link_state: 'live', fb_event_state: 'live', er_ad_state: 'running', ticket_ad_state: 'none' }
const at = (s: string) => new Date(s)

test('Mandurah ticket link amber before 26 Sep 2:34pm, red after', () => {
  assert.equal(computeRowStatus(mandurah, at('2026-09-26T14:30:00+10:00')).cells.ticketLink.tone, 'amber')
  assert.equal(computeRowStatus(mandurah, at('2026-09-26T14:35:00+10:00')).cells.ticketLink.tone, 'red')
  assert.equal(computeRowStatus(mandurah, at('2026-09-26T14:35:00+10:00')).badge, 'Overdue')
})
test('Albury ER paused: amber inside 48h, red after 27 Sep 3:00pm', () => {
  assert.equal(computeRowStatus(albury, at('2026-09-27T14:59:00+10:00')).cells.erAd.tone, 'amber')
  assert.equal(computeRowStatus(albury, at('2026-09-27T15:01:00+10:00')).cells.erAd.tone, 'red')
})
test('Thirroul: website amber within 48h of 28 Sep 10:00 presale, red at 10:00 if not live', () => {
  assert.equal(computeRowStatus(thirroul, at('2026-09-26T09:59:00+10:00')).cells.website.tone, 'none')
  assert.equal(computeRowStatus(thirroul, at('2026-09-26T10:01:00+10:00')).cells.website.tone, 'amber')
  assert.equal(computeRowStatus(thirroul, at('2026-09-28T09:59:00+10:00')).cells.website.tone, 'amber')
  assert.equal(computeRowStatus(thirroul, at('2026-09-28T10:00:00+10:00')).cells.website.tone, 'red')
  assert.equal(computeRowStatus({ ...thirroul, website_state: 'live' }, at('2026-09-28T10:00:00+10:00')).cells.website.tone, 'green')
  assert.equal(computeRowStatus(thirroul, at('2026-09-28T10:00:00+10:00')).cells.fbEvent.tone, 'red')
})
test('Perth red from manual flag', () => {
  const s = computeRowStatus(perth, at('2026-09-25T15:30:00+10:00'))
  assert.equal(s.cells.flag.tone, 'red'); assert.equal(s.worst, 'red')
})
test('Bunbury pixel grey (n/a), never red', () => {
  assert.equal(computeRowStatus({ ...bunbury, general_onsale_at: '2026-09-28T09:00:00+10:00' }, at('2026-12-01T00:00:00+11:00')).cells.pixel.tone, 'grey')
})
test('Pixel red 7 days after GP unless cant_add', () => {
  const r = { ...base, general_onsale_at: '2026-09-29T10:00:00+10:00', pixel_state: 'chasing' as const }
  // GP 29 Sep 10:00 AEST + 7 days = Tue 6 Oct 11:00 AEDT (DST starts 4 Oct)
  assert.equal(computeRowStatus(r, at('2026-10-06T10:59:00+11:00')).cells.pixel.tone, 'amber')
  assert.equal(computeRowStatus(r, at('2026-10-06T11:01:00+11:00')).cells.pixel.tone, 'red')
})
test('ER ad red when not created within 24h of FB Event live', () => {
  const r = { ...base, fb_event_state: 'live' as const, fb_event_live_at: '2026-09-28T10:00:00+10:00', er_ad_state: 'none' as const }
  assert.equal(computeRowStatus(r, at('2026-09-29T09:00:00+10:00')).cells.erAd.tone, 'amber')
  assert.equal(computeRowStatus(r, at('2026-09-29T10:01:00+10:00')).cells.erAd.tone, 'red')
})
test('EDM awaiting Gareth red after 24h', () => {
  const r = { ...base, edm_state: 'draft_received' as const, edm_received_at: '2026-09-25T14:18:46+10:00' }
  assert.equal(computeRowStatus(r, at('2026-09-26T14:20:00+10:00')).cells.edm.tone, 'red')
})
test('Unknown states never go red', () => {
  const s = computeRowStatus(base, at('2027-01-01T00:00:00+11:00'))
  assert.notEqual(s.worst, 'red')
})
test('Broken Hill ER running green; on sale', () => {
  const s = computeRowStatus(brokenHill, at('2026-09-25T15:30:00+10:00'))
  assert.equal(s.cells.erAd.tone, 'green'); assert.equal(s.onSale, true)
})
test('filters, sort and counts at 26 Sep 3pm test clock', () => {
  const now = at('2026-09-26T15:00:00+10:00')
  const rows = [albury, perth, bunbury, mandurah, thirroul, brokenHill].map(row => ({ row, status: computeRowStatus(row, now) }))
  const sorted = sortRows(rows)
  // Thirroul ticket link (received 25 Sep 2:52pm) is also > 24h awaiting Gareth by 26 Sep 3pm
  assert.deepEqual(sorted.slice(0, 3).map(r => r.row.show_id).sort(), ['mandurah', 'perth', 'thirroul'])
  assert.equal(sorted[3].status.worst, 'amber')
  assert.deepEqual(applyFilter(rows, 'mine', now).map(r => r.row.show_id).sort(), ['albury', 'mandurah', 'perth', 'thirroul'])
  assert.equal(applyFilter(rows, 'all', now).length, 6)
  const next14 = applyFilter(rows, 'next14', now).map(r => r.row.show_id)
  assert.ok(next14.includes('thirroul') && next14.includes('bunbury') && !next14.includes('bh'))
  const c = summaryCounts(rows.map(r => r.status))
  assert.equal(c.onSale, 2); assert.equal(c.notYetOnSale, 4)
})
test('Melbourne label switches AEST → AEDT on 4 Oct 2026', () => {
  assert.match(fmtMelbourne(at('2026-09-28T10:00:00+10:00')), /AEST/)
  assert.match(fmtMelbourne(at('2026-10-05T10:00:00+11:00')), /AEDT/)
  assert.match(fmtMelbourne(at('2026-09-28T10:00:00+10:00'), 'Australia/Perth'), /AWST/)
})
