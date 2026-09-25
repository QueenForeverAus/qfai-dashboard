// Reference implementation for lib/onsale-tracker-status.ts (pure; injectable `now`).
// Rules follow the 25 Sep 2026 brief. null state = unknown (never red, rendered "unknown").

export type Tone = 'green' | 'amber' | 'red' | 'grey' | 'none'
export type Owner = 'Gareth' | 'Comms' | 'Website' | 'Marketing' | 'Harbour'

export interface OnsaleRow {
  show_id: string
  show_date: string | null
  announce_at: string | null
  presale_at: string | null
  general_onsale_at: string | null
  ticket_link_state: 'none' | 'received' | 'approved' | 'live' | null
  ticket_link_received_at: string | null
  edm_state: 'none' | 'draft_received' | 'approved' | 'sent_scheduled' | null
  edm_received_at: string | null
  website_state: 'not_built' | 'scheduled' | 'live' | null
  website_go_live_at: string | null
  fb_event_state: 'none' | 'drafted' | 'live' | null
  fb_event_live_at: string | null
  er_ad_state: 'none' | 'paused' | 'running' | 'ended' | null
  er_paused_since: string | null
  ticket_ad_state: 'none' | 'paused' | 'running' | 'ended' | null
  ticket_paused_since: string | null
  pixel_state: 'ours_added' | 'chasing' | 'cant_add' | null
  next_action_owner: Owner | null
  manual_red_flag: boolean
  manual_red_reason: string | null
}

export interface Cell { tone: Tone; reason: string | null; deadline: Date | null }
export type CellKey = 'dates' | 'ticketLink' | 'edm' | 'website' | 'fbEvent' | 'erAd' | 'ticketAd' | 'pixel' | 'flag'

export interface RowStatus {
  cells: Record<CellKey, Cell>
  worst: Tone                    // row badge: red > amber > green > none/grey
  badge: 'Overdue' | 'Due ≤48h' | 'On track' | 'No data'
  nextMilestone: { label: string; at: Date } | null
  onSale: boolean
  waitingOnGareth: boolean
}

export const HOUR = 3_600_000
const AMBER_WINDOW = 48 * HOUR

const t = (s: string | null): Date | null => (s ? new Date(s) : null)
const cell = (tone: Tone, reason: string | null = null, deadline: Date | null = null): Cell => ({ tone, reason, deadline })

/** Deadline-based tone: red once now >= deadline, amber within 48h before it, else none. */
function byDeadline(now: Date, deadline: Date | null, redReason: string, amberReason: string): Cell {
  if (!deadline) return cell('none')
  const ms = deadline.getTime() - now.getTime()
  if (ms <= 0) return cell('red', redReason, deadline)
  if (ms <= AMBER_WINDOW) return cell('amber', amberReason, deadline)
  return cell('none', null, deadline)
}

export function earliestOnsale(r: OnsaleRow): Date | null {
  return t(r.presale_at) ?? t(r.general_onsale_at)
}

function adCell(now: Date, state: OnsaleRow['er_ad_state'], pausedSince: string | null, label: string): Cell {
  if (state === 'running' || state === 'ended') return cell('green')
  if (state === 'paused') {
    const since = t(pausedSince)
    if (!since) return cell('amber', `${label} paused waiting on GO (since unknown)`)
    const deadline = new Date(since.getTime() + 48 * HOUR)
    return now >= deadline
      ? cell('red', `${label} paused waiting on GO > 48h`, deadline)
      : cell('amber', `${label} paused waiting on GO`, deadline)
  }
  return cell('none')
}

export function computeRowStatus(r: OnsaleRow, now: Date): RowStatus {
  const onsale = earliestOnsale(r)
  const gp = t(r.general_onsale_at)

  // Key dates: amber if the next announce/presale/GP is within 48h
  const future = [
    ['Announce', t(r.announce_at)], ['Presale', t(r.presale_at)], ['General on-sale', gp],
  ].filter((x): x is [string, Date] => !!x[1] && (x[1] as Date) > now) as [string, Date][]
  future.sort((a, b) => a[1].getTime() - b[1].getTime())
  const nextDate = future[0] ?? null
  const dates = nextDate && nextDate[1].getTime() - now.getTime() <= AMBER_WINDOW
    ? cell('amber', `${nextDate[0]} within 48h`, nextDate[1])
    : (gp && gp <= now) || r.ticket_link_state === 'live' ? cell('green') : cell('none')

  // Ticket link: live green; received = awaiting Gareth, red after 24h
  let ticketLink: Cell = cell('none')
  if (r.ticket_link_state === 'live') ticketLink = cell('green')
  else if (r.ticket_link_state === 'received') {
    const rec = t(r.ticket_link_received_at)
    ticketLink = rec
      ? (now.getTime() - rec.getTime() > 24 * HOUR
        ? cell('red', 'Ticket link awaiting Gareth > 24h', new Date(rec.getTime() + 24 * HOUR))
        : cell('amber', 'Ticket link awaiting Gareth', new Date(rec.getTime() + 24 * HOUR)))
      : cell('amber', 'Ticket link awaiting Gareth (received time unknown)')
  }

  // EDM: sent/scheduled green; draft_received = awaiting Gareth, red after 24h
  let edm: Cell = cell('none')
  if (r.edm_state === 'sent_scheduled') edm = cell('green')
  else if (r.edm_state === 'draft_received') {
    const rec = t(r.edm_received_at)
    edm = rec
      ? (now.getTime() - rec.getTime() > 24 * HOUR
        ? cell('red', 'EDM awaiting Gareth > 24h', new Date(rec.getTime() + 24 * HOUR))
        : cell('amber', 'EDM awaiting Gareth', new Date(rec.getTime() + 24 * HOUR)))
      : cell('amber', 'EDM awaiting Gareth (received time unknown)')
  }

  // Website / FB Event: must be live by earliest on-sale (presale if any)
  const website = r.website_state === 'live' ? cell('green')
    : byDeadline(now, onsale, 'Website not live by on-sale', 'Website not live; on-sale within 48h')
  const fbEvent = r.fb_event_state === 'live' ? cell('green')
    : byDeadline(now, onsale, 'FB Event not live by on-sale', 'FB Event not live; on-sale within 48h')

  // ER ad: must exist within 24h of FB Event going live; paused > 48h red
  let erAd = adCell(now, r.er_ad_state, r.er_paused_since, 'ER ad')
  if (r.er_ad_state === 'none' || r.er_ad_state === null) {
    const live = r.fb_event_state === 'live' ? t(r.fb_event_live_at) : null
    if (live) {
      erAd = byDeadline(now, new Date(live.getTime() + 24 * HOUR), 'ER ad not created within 24h of FB Event live', 'ER ad due within 24h of FB Event live')
    }
  }
  const ticketAd = adCell(now, r.ticket_ad_state, r.ticket_paused_since, 'Ticket ad')

  // Pixel: cant_add = grey n/a; ours_added green; otherwise red 7 days after GP
  let pixel: Cell
  if (r.pixel_state === 'cant_add') pixel = cell('grey', "Can't add (n/a)")
  else if (r.pixel_state === 'ours_added') pixel = cell('green')
  else pixel = byDeadline(now, gp ? new Date(gp.getTime() + 7 * 24 * HOUR) : null, 'Pixel unconfirmed 7 days after general on-sale', 'Pixel unconfirmed; 7-day mark within 48h')

  const flag = r.manual_red_flag ? cell('red', r.manual_red_reason ?? 'Manual red flag') : cell('none')

  const cells = { dates, ticketLink, edm, website, fbEvent, erAd, ticketAd, pixel, flag }
  const tones = Object.values(cells).map(c => c.tone)
  const worst: Tone = tones.includes('red') ? 'red' : tones.includes('amber') ? 'amber' : tones.includes('green') ? 'green' : 'none'
  const badge = worst === 'red' ? 'Overdue' : worst === 'amber' ? 'Due ≤48h' : worst === 'green' ? 'On track' : 'No data'

  // Next milestone = soonest future date among key dates, website go-live and cell deadlines
  const candidates: { label: string; at: Date }[] = []
  for (const [label, at] of future) candidates.push({ label, at })
  const wgl = t(r.website_go_live_at)
  if (wgl && wgl > now && r.website_state !== 'live') candidates.push({ label: 'Website go-live', at: wgl })
  for (const [k, c] of Object.entries(cells)) if (c.deadline && c.deadline > now && c.tone !== 'green') candidates.push({ label: `${k} deadline`, at: c.deadline })
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime())

  const onSale = r.ticket_link_state === 'live' || (gp !== null && gp <= now)
  const waitingOnGareth = r.next_action_owner === 'Gareth'
  return { cells, worst, badge, nextMilestone: candidates[0] ?? null, onSale, waitingOnGareth }
}

/** Default sort: overdue (red) pinned first, then soonest next milestone, then show date. */
export function sortRows<T extends { status: RowStatus; row: OnsaleRow }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = a.status.worst === 'red' ? 0 : 1
    const rb = b.status.worst === 'red' ? 0 : 1
    if (ra !== rb) return ra - rb
    const na = a.status.nextMilestone?.at.getTime() ?? Infinity
    const nb = b.status.nextMilestone?.at.getTime() ?? Infinity
    if (na !== nb) return na - nb
    return (a.row.show_date ?? '').localeCompare(b.row.show_date ?? '')
  })
}

export type Filter = 'all' | 'mine' | 'next14'
export function applyFilter<T extends { status: RowStatus }>(rows: T[], filter: Filter, now: Date): T[] {
  if (filter === 'mine') return rows.filter(r => r.status.waitingOnGareth)
  if (filter === 'next14') {
    const limit = now.getTime() + 14 * 24 * HOUR
    return rows.filter(r => r.status.worst === 'red' || (r.status.nextMilestone && r.status.nextMilestone.at.getTime() <= limit))
  }
  return rows
}

export function summaryCounts(statuses: RowStatus[]) {
  return {
    overdue: statuses.filter(s => s.worst === 'red').length,
    due48h: statuses.filter(s => s.worst === 'amber').length,
    waitingOnGareth: statuses.filter(s => s.waitingOnGareth).length,
    onSale: statuses.filter(s => s.onSale).length,
    notYetOnSale: statuses.filter(s => !s.onSale).length,
  }
}

/** Melbourne display with AEST/AEDT label, e.g. "Mon 28 Sep, 10:00 am AEST". */
export function fmtMelbourne(d: Date, tz = 'Australia/Melbourne'): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()} ${get('timeZoneName')}`.replace(/\s+/g, ' ').trim()
}
