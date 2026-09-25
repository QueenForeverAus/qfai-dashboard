/**
 * On-sale tracker helpers: test clock, Melbourne wall-clock conversion,
 * and which shows belong on the tracker. Status colours live in
 * lib/onsale-tracker-status.ts.
 */

import { fmtMelbourne, type Filter, type OnsaleRow, type Owner } from './onsale-tracker-status.ts'

export const MELBOURNE_TZ = 'Australia/Melbourne'

export type OnsaleFilter = Filter

const OWNERS: readonly Owner[] = ['Gareth', 'Comms', 'Website', 'Marketing', 'Harbour']

export interface OnsaleTrackerRecord {
  show_id: string
  announce_at: string | null
  presale_at: string | null
  general_onsale_at: string | null
  show_local_tz: string | null
  ticket_link_state: OnsaleRow['ticket_link_state']
  ticket_link_url: string | null
  ticket_link_platform: string | null
  ticket_link_received_at: string | null
  ticket_link_approved_at: string | null
  ticket_link_live_at: string | null
  edm_state: OnsaleRow['edm_state']
  edm_received_at: string | null
  edm_send_date: string | null
  edm_send_at: string | null
  website_state: OnsaleRow['website_state']
  website_go_live_at: string | null
  website_wp_post_id: number | null
  website_url: string | null
  website_source: string
  website_synced_at: string | null
  fb_event_state: OnsaleRow['fb_event_state']
  fb_event_id: string | null
  fb_event_url: string | null
  fb_event_live_at: string | null
  fb_event_venue_cohost: boolean | null
  fb_event_source: string
  fb_event_synced_at: string | null
  er_ad_state: OnsaleRow['er_ad_state']
  er_campaign_id: string | null
  er_paused_since: string | null
  er_spend_to_date: number | string | null
  er_budget: number | string | null
  er_ad_source: string
  er_ad_synced_at: string | null
  ticket_ad_state: OnsaleRow['ticket_ad_state']
  ticket_campaign_id: string | null
  ticket_paused_since: string | null
  ticket_spend_to_date: number | string | null
  ticket_budget: number | string | null
  ticket_ad_source: string
  ticket_ad_synced_at: string | null
  pixel_state: OnsaleRow['pixel_state']
  pixel_platform: string | null
  pixel_verified_at: string | null
  pixel_source: string
  pixel_synced_at: string | null
  next_action: string | null
  next_action_owner: Owner | null
  manual_red_flag: boolean
  manual_red_reason: string | null
  notes: string | null
  source_of_data: string | null
}

export function parseOnsaleFilter(value: string | null | undefined): OnsaleFilter {
  if (value === 'mine' || value === 'next14' || value === 'all') return value
  return 'all'
}

/**
 * `?now=` is honoured for owner/admin pages when this is not a production
 * deployment, or when ONSALE_TRACKER_TEST_CLOCK=1. Anything else is ignored.
 */
export function resolveOnsaleNow(opts: {
  nowParam: string | null | undefined
  vercelEnv: string | undefined
  testClockFlag: string | undefined
  realNow?: Date
}): { now: Date; active: boolean } {
  const realNow = opts.realNow ?? new Date()
  const allowed = opts.vercelEnv !== 'production' || opts.testClockFlag === '1'
  if (!allowed || !opts.nowParam) return { now: realNow, active: false }
  const parsed = new Date(opts.nowParam)
  if (Number.isNaN(parsed.getTime())) return { now: realNow, active: false }
  return { now: parsed, active: true }
}

/** Calendar YYYY-MM-DD in a zone. en-CA yields that order. */
export function calendarDateInZone(date: Date, timeZone = MELBOURNE_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat('en-AU', { timeZone })
    return true
  } catch {
    return false
  }
}

/** Milliseconds to add to UTC to get the wall clock in `timeZone` (east of UTC is positive). */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(instant).find(part => part.type === 'timeZoneName')?.value ?? ''
  const match = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? '0')) * 60_000
}

/** Interpret a `datetime-local` value as wall time in `timeZone` and return a UTC ISO string. */
export function wallTimeToUtcIso(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6] ?? 0)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const offset1 = timeZoneOffsetMs(guess, timeZone)
  let utc = new Date(guess.getTime() - offset1)
  const offset2 = timeZoneOffsetMs(utc, timeZone)
  if (offset2 !== offset1) utc = new Date(guess.getTime() - offset2)
  if (Number.isNaN(utc.getTime())) return null
  return utc.toISOString()
}

/** UTC ISO → `YYYY-MM-DDTHH:mm` wall clock for a datetime-local input. */
export function isoToWallInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  let hour = get('hour')
  if (hour === '24') hour = '00'
  const second = get('second')
  const seconds = second && second !== '00' ? `:${second}` : ''
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}${seconds}`
}

export function showYear(showDate: string | null | undefined): number | null {
  const match = showDate?.match(/^(\d{4})-/)
  return match ? Number(match[1]) : null
}

/** Same on-sale rule as computeRowStatus: live ticket link, or general on-sale at/before now. */
export function isTrackerOnSale(
  tracker: { ticket_link_state: string | null; general_onsale_at: string | null } | null,
  now: Date,
): boolean {
  if (!tracker) return false
  if (tracker.ticket_link_state === 'live') return true
  if (!tracker.general_onsale_at) return false
  const gp = new Date(tracker.general_onsale_at)
  if (Number.isNaN(gp.getTime())) return false
  return gp.getTime() <= now.getTime()
}

/**
 * 2027+ shows except RETIRED, plus any show that has a tracker row and is not
 * yet on sale (including a 2026 upcoming show with a tracker row).
 */
export function includeInOnsaleTracker(opts: {
  showDate: string | null
  harbourStatus: string | null
  hasTracker: boolean
  onSale: boolean
  today: string
}): boolean {
  const year = showYear(opts.showDate)
  if (year != null && year >= 2027 && opts.harbourStatus !== 'RETIRED') return true
  if (opts.hasTracker && !opts.onSale) return true
  const upcoming2026 = year === 2026 && opts.showDate != null && opts.showDate.slice(0, 10) >= opts.today
  if (upcoming2026 && opts.hasTracker && !opts.onSale) return true
  return false
}

export function toStatusRow(
  showId: string,
  showDate: string | null,
  tracker: OnsaleTrackerRecord | null,
): OnsaleRow {
  const owner = tracker?.next_action_owner
  return {
    show_id: showId,
    show_date: showDate,
    announce_at: tracker?.announce_at ?? null,
    presale_at: tracker?.presale_at ?? null,
    general_onsale_at: tracker?.general_onsale_at ?? null,
    ticket_link_state: tracker?.ticket_link_state ?? null,
    ticket_link_received_at: tracker?.ticket_link_received_at ?? null,
    edm_state: tracker?.edm_state ?? null,
    edm_received_at: tracker?.edm_received_at ?? null,
    website_state: tracker?.website_state ?? null,
    website_go_live_at: tracker?.website_go_live_at ?? null,
    fb_event_state: tracker?.fb_event_state ?? null,
    fb_event_live_at: tracker?.fb_event_live_at ?? null,
    er_ad_state: tracker?.er_ad_state ?? null,
    er_paused_since: tracker?.er_paused_since ?? null,
    ticket_ad_state: tracker?.ticket_ad_state ?? null,
    ticket_paused_since: tracker?.ticket_paused_since ?? null,
    pixel_state: tracker?.pixel_state ?? null,
    next_action_owner: owner && OWNERS.includes(owner) ? owner : null,
    manual_red_flag: tracker?.manual_red_flag ?? false,
    manual_red_reason: tracker?.manual_red_reason ?? null,
  }
}

/** Melbourne label, or null when the value is missing or not a real timestamp. */
export function fmtSafe(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  try {
    return timeZone ? fmtMelbourne(date, timeZone) : fmtMelbourne(date)
  } catch {
    return null
  }
}

/** Cell date without the weekday, so a key-date line stays on one row. */
export function fmtCompactMelbourne(date: Date, timeZone = MELBOURNE_TZ): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()} ${get('timeZoneName')}`.replace(/\s+/g, ' ').trim()
}

export function fmtCompactSafe(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  try {
    return fmtCompactMelbourne(date, timeZone)
  } catch {
    return null
  }
}

const LINK_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['ticketek', 'Ticketek'],
  ['ticketmaster', 'Ticketmaster'],
  ['ticketsearch', 'TicketSearch'],
  ['spektrix', 'Spektrix'],
  ['facebook', 'Facebook'],
  ['brec', 'BREC'],
]

/** Short venue/platform name for a link label. Full URL stays on the anchor. */
export function shortPlaceName(platform: string | null | undefined, url?: string | null): string | null {
  const hay = `${platform ?? ''} ${url ?? ''}`.toLowerCase()
  for (const [needle, label] of LINK_NAMES) {
    if (hay.includes(needle)) return label
  }
  if (platform) {
    const word = platform.split(/[\s(/,–—-]/)[0]?.trim()
    if (word && word.length <= 18) return word
  }
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '')
      const stem = host.split('.')[0]
      if (stem) return stem
    } catch {
      return null
    }
  }
  return null
}

export function ticketLinkLabel(platform: string | null | undefined, url: string): string {
  return `${shortPlaceName(platform, url) ?? 'Tickets'} ↗`
}

export function websiteLinkLabel(wpPostId: number | string | null | undefined): string {
  if (wpPostId != null && String(wpPostId).trim() !== '') return `WP ${wpPostId}`
  return 'Website ↗'
}

/**
 * Plain next-milestone text. Status logic still stores internal keys
 * (`ticketLink deadline`); this only changes what the row shows.
 */
export function plainMilestoneLabel(label: string, erAdReason?: string | null): string {
  switch (label) {
    case 'ticketLink deadline': return 'Ticket link approval due'
    case 'edm deadline': return 'EDM approval due'
    case 'website deadline':
    case 'Website go-live': return 'Website live by'
    case 'fbEvent deadline': return 'FB Event live by'
    case 'pixel deadline': return 'Pixel check due'
    case 'ticketAd deadline': return 'Ad GO due'
    case 'erAd deadline': {
      const reason = (erAdReason ?? '').toLowerCase()
      if (reason.includes('paused') || reason.includes('waiting on go')) return 'Ad GO due'
      return 'ER ad due'
    }
    case 'dates deadline': return 'Key date due'
    default: return label
  }
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
  } catch {
    return null
  }
  return null
}

export const ONSALE_FIELD_LABELS: Record<string, string> = {
  announce_at: 'Announce',
  presale_at: 'Presale',
  general_onsale_at: 'General on-sale',
  show_local_tz: 'Show local time zone',
  ticket_link_state: 'Ticket link',
  ticket_link_url: 'Ticket link URL',
  ticket_link_platform: 'Ticket link platform',
  ticket_link_received_at: 'Ticket link received',
  ticket_link_approved_at: 'Ticket link approved',
  ticket_link_live_at: 'Ticket link live',
  edm_state: 'EDM',
  edm_received_at: 'EDM received',
  edm_send_date: 'EDM send date',
  edm_send_at: 'EDM send time',
  website_state: 'Website',
  website_go_live_at: 'Website go-live',
  website_wp_post_id: 'Website WP post',
  website_url: 'Website URL',
  website_source: 'Website source',
  website_synced_at: 'Website synced',
  fb_event_state: 'FB Event',
  fb_event_id: 'FB Event id',
  fb_event_url: 'FB Event URL',
  fb_event_live_at: 'FB Event live',
  fb_event_venue_cohost: 'FB Event venue co-host',
  fb_event_source: 'FB Event source',
  fb_event_synced_at: 'FB Event synced',
  er_ad_state: 'ER ad',
  er_campaign_id: 'ER campaign',
  er_paused_since: 'ER paused since',
  er_spend_to_date: 'ER spend to date',
  er_budget: 'ER budget',
  er_ad_source: 'ER ad source',
  er_ad_synced_at: 'ER ad synced',
  ticket_ad_state: 'Ticket ad',
  ticket_campaign_id: 'Ticket campaign',
  ticket_paused_since: 'Ticket ad paused since',
  ticket_spend_to_date: 'Ticket ad spend to date',
  ticket_budget: 'Ticket ad budget',
  ticket_ad_source: 'Ticket ad source',
  ticket_ad_synced_at: 'Ticket ad synced',
  pixel_state: 'Pixel',
  pixel_platform: 'Pixel platform',
  pixel_verified_at: 'Pixel verified',
  pixel_source: 'Pixel source',
  pixel_synced_at: 'Pixel synced',
  next_action: 'Next action',
  next_action_owner: 'Next action owner',
  manual_red_flag: 'Manual red flag',
  manual_red_reason: 'Manual red reason',
  notes: 'Notes',
  source_of_data: 'Source of Data',
}
