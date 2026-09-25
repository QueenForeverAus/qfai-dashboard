import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeRowStatus, type OnsaleRow } from '../../lib/onsale-tracker-status.ts'
import {
  includeInOnsaleTracker,
  isTrackerOnSale,
  isoToWallInput,
  plainMilestoneLabel,
  resolveOnsaleNow,
  ticketLinkLabel,
  wallTimeToUtcIso,
  websiteLinkLabel,
  MELBOURNE_TZ,
} from '../../lib/onsale-tracker.ts'
import { formValuesToPatch, parseOnsalePatch, trackerToForm, emptyOnsaleForm } from '../../lib/onsale-tracker-patch.ts'

describe('compact tracker labels', () => {
  it('maps internal milestone keys to plain labels', () => {
    assert.equal(plainMilestoneLabel('ticketLink deadline'), 'Ticket link approval due')
    assert.equal(plainMilestoneLabel('website deadline'), 'Website live by')
    assert.equal(plainMilestoneLabel('Website go-live'), 'Website live by')
    assert.equal(plainMilestoneLabel('fbEvent deadline'), 'FB Event live by')
    assert.equal(plainMilestoneLabel('pixel deadline'), 'Pixel check due')
    assert.equal(plainMilestoneLabel('erAd deadline', 'ER ad not created within 24h of FB Event live'), 'ER ad due')
    assert.equal(plainMilestoneLabel('erAd deadline', 'ER ad paused waiting on GO'), 'Ad GO due')
    assert.equal(plainMilestoneLabel('ticketAd deadline'), 'Ad GO due')
    assert.equal(plainMilestoneLabel('Announce'), 'Announce')
  })

  it('shortens ticket and website links', () => {
    assert.equal(ticketLinkLabel('Ticketek', 'https://premier.ticketek.com.au/shows/show.aspx?sh=QUEENEVE27'), 'Ticketek ↗')
    assert.equal(ticketLinkLabel(null, 'https://www.ticketmaster.com.au/event/123'), 'Ticketmaster ↗')
    assert.equal(websiteLinkLabel(11069), 'WP 11069')
    assert.equal(websiteLinkLabel(null), 'Website ↗')
  })
})

describe('Melbourne wall clock', () => {
  it('stores 10:00 AEST as 00:00 UTC and 10:00 AEDT as 23:00 UTC the day before', () => {
    assert.equal(wallTimeToUtcIso('2026-09-28T10:00', MELBOURNE_TZ), '2026-09-28T00:00:00.000Z')
    assert.equal(wallTimeToUtcIso('2026-10-05T10:00', MELBOURNE_TZ), '2026-10-04T23:00:00.000Z')
  })

  it('round-trips a Melbourne datetime-local value', () => {
    const iso = wallTimeToUtcIso('2026-09-28T10:00', MELBOURNE_TZ)
    assert.equal(isoToWallInput(iso, MELBOURNE_TZ), '2026-09-28T10:00')
    assert.equal(isoToWallInput('2026-10-04T23:00:00.000Z', MELBOURNE_TZ), '2026-10-05T10:00')
    assert.equal(isoToWallInput('2026-09-25T05:00:12.000Z', MELBOURNE_TZ), '2026-09-25T15:00:12')
    assert.equal(wallTimeToUtcIso('2026-09-25T15:00:12', MELBOURNE_TZ), '2026-09-25T05:00:12.000Z')
  })
})

describe('test clock', () => {
  const realNow = new Date('2026-09-25T05:00:00.000Z')

  it('ignores ?now= on production unless the flag is set', () => {
    const ignored = resolveOnsaleNow({
      nowParam: '2026-09-26T15:00:00+10:00',
      vercelEnv: 'production',
      testClockFlag: undefined,
      realNow,
    })
    assert.equal(ignored.active, false)
    assert.equal(ignored.now.toISOString(), realNow.toISOString())

    const flagged = resolveOnsaleNow({
      nowParam: '2026-09-26T15:00:00+10:00',
      vercelEnv: 'production',
      testClockFlag: '1',
      realNow,
    })
    assert.equal(flagged.active, true)
    assert.equal(flagged.now.toISOString(), '2026-09-26T05:00:00.000Z')
  })

  it('honours a valid clock on preview and ignores a bad one', () => {
    const preview = resolveOnsaleNow({
      nowParam: '2026-09-26T15:00:00+10:00',
      vercelEnv: 'preview',
      testClockFlag: undefined,
      realNow,
    })
    assert.equal(preview.active, true)
    const bad = resolveOnsaleNow({
      nowParam: 'not-a-date',
      vercelEnv: 'preview',
      testClockFlag: undefined,
      realNow,
    })
    assert.equal(bad.active, false)
    assert.equal(bad.now.toISOString(), realNow.toISOString())
  })
})

describe('which shows are on the tracker', () => {
  const today = '2026-09-25'
  const now = new Date('2026-09-25T05:00:00.000Z')

  it('includes 2027+ shows that are not retired, with or without a tracker', () => {
    assert.equal(includeInOnsaleTracker({
      showDate: '2027-04-02', harbourStatus: null, hasTracker: false, onSale: false, today,
    }), true)
    assert.equal(includeInOnsaleTracker({
      showDate: '2027-04-02', harbourStatus: 'RETIRED', hasTracker: false, onSale: false, today,
    }), false)
  })

  it('keeps a tracker row that is not yet on sale, including a retired or 2026 show', () => {
    assert.equal(includeInOnsaleTracker({
      showDate: '2027-04-02', harbourStatus: 'RETIRED', hasTracker: true, onSale: false, today,
    }), true)
    assert.equal(includeInOnsaleTracker({
      showDate: '2026-12-01', harbourStatus: null, hasTracker: true, onSale: false, today,
    }), true)
    assert.equal(includeInOnsaleTracker({
      showDate: '2026-01-01', harbourStatus: null, hasTracker: true, onSale: false, today,
    }), true)
    assert.equal(includeInOnsaleTracker({
      showDate: '2026-12-01', harbourStatus: null, hasTracker: true, onSale: true, today,
    }), false)
    assert.equal(includeInOnsaleTracker({
      showDate: '2026-12-01', harbourStatus: null, hasTracker: false, onSale: false, today,
    }), false)
  })

  it('matches the status on-sale rule', () => {
    const live = { ticket_link_state: 'live', general_onsale_at: null }
    assert.equal(isTrackerOnSale(live, now), true)
    const future = { ticket_link_state: 'received', general_onsale_at: '2026-09-29T00:00:00.000Z' }
    assert.equal(isTrackerOnSale(future, now), false)
    const row: OnsaleRow = {
      show_id: 'x', show_date: '2027-01-01', announce_at: null, presale_at: null, general_onsale_at: '2026-09-29T00:00:00.000Z',
      ticket_link_state: 'received', ticket_link_received_at: null, edm_state: null, edm_received_at: null,
      website_state: null, website_go_live_at: null, fb_event_state: null, fb_event_live_at: null,
      er_ad_state: null, er_paused_since: null, ticket_ad_state: null, ticket_paused_since: null,
      pixel_state: null, next_action_owner: null, manual_red_flag: false, manual_red_reason: null,
    }
    assert.equal(isTrackerOnSale(row, now), computeRowStatus(row, now).onSale)
  })
})

describe('onsale patch', () => {
  it('reads a Melbourne wall time and rejects an unknown state', () => {
    const ok = parseOnsalePatch({ announce_at: '2026-09-28T10:00', ticket_link_state: null }, null)
    assert.equal(ok.ok, true)
    if (ok.ok) assert.equal(ok.values.announce_at, '2026-09-28T00:00:00.000Z')

    const bad = parseOnsalePatch({ ticket_link_state: 'liveish' }, null)
    assert.equal(bad.ok, false)
  })

  it('sets website source back to manual only when a website field changes', () => {
    const existing = { website_state: 'live', website_url: 'https://www.queenforever.com.au/tour-dates/perth-wa/', website_source: 'wp' }
    const same = parseOnsalePatch({ website_state: 'live', notes: 'checked' }, existing)
    assert.equal(same.ok, true)
    if (same.ok) {
      assert.equal(same.values.website_source, undefined)
      assert.equal(same.values.notes, 'checked')
    }
    const changed = parseOnsalePatch({ website_url: 'https://www.queenforever.com.au/tour-dates/perth-wa-2/' }, existing)
    assert.equal(changed.ok, true)
    if (changed.ok) assert.equal(changed.values.website_source, 'manual')
  })

  it('turns the edit form into a patch body', () => {
    const form = emptyOnsaleForm()
    form.ticket_link_state = 'received'
    form.ticket_link_received_at = '2026-09-25T14:34'
    form.notes = 'Harbour email'
    form.manual_red_flag = 'false'
    const built = formValuesToPatch(form)
    assert.equal(built.ok, true)
    if (!built.ok) return
    const parsed = parseOnsalePatch(built.body, null)
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.values.ticket_link_state, 'received')
      assert.equal(parsed.values.ticket_link_received_at, '2026-09-25T04:34:00.000Z')
      assert.equal(parsed.values.notes, 'Harbour email')
      assert.equal(parsed.values.manual_red_flag, false)
    }
  })

  it('fills Melbourne inputs from a stored timestamp', () => {
    const form = trackerToForm({
      show_id: 'x',
      announce_at: '2026-09-28T00:00:00.000Z',
      presale_at: null,
      general_onsale_at: null,
      show_local_tz: 'Australia/Perth',
      ticket_link_state: null,
      ticket_link_url: null,
      ticket_link_platform: null,
      ticket_link_received_at: null,
      ticket_link_approved_at: null,
      ticket_link_live_at: null,
      edm_state: null,
      edm_received_at: null,
      edm_send_date: null,
      edm_send_at: null,
      website_state: null,
      website_go_live_at: null,
      website_wp_post_id: null,
      website_url: null,
      website_source: 'manual',
      website_synced_at: null,
      fb_event_state: null,
      fb_event_id: null,
      fb_event_url: null,
      fb_event_live_at: null,
      fb_event_venue_cohost: null,
      fb_event_source: 'manual',
      fb_event_synced_at: null,
      er_ad_state: null,
      er_campaign_id: null,
      er_paused_since: null,
      er_spend_to_date: null,
      er_budget: null,
      er_ad_source: 'manual',
      er_ad_synced_at: null,
      ticket_ad_state: null,
      ticket_campaign_id: null,
      ticket_paused_since: null,
      ticket_spend_to_date: null,
      ticket_budget: null,
      ticket_ad_source: 'manual',
      ticket_ad_synced_at: null,
      pixel_state: null,
      pixel_platform: null,
      pixel_verified_at: null,
      pixel_source: 'manual',
      pixel_synced_at: null,
      next_action: null,
      next_action_owner: null,
      manual_red_flag: false,
      manual_red_reason: null,
      notes: null,
      source_of_data: null,
    })
    assert.equal(form.announce_at, '2026-09-28T10:00')
    assert.equal(form.show_local_tz, 'Australia/Perth')
  })
})
