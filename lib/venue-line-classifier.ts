/** Classify a venue remittance / schedule line into a show cost field. */

export type VenueLineClass =
  | 'venue_marketing'
  | 'production_costs'
  | 'venue_staff'
  | 'unknown'

const MARKETING =
  /\b(marketing|levy|promo|promotional|advertis|edm|email campaign|campaign|brochure|poster|foyer poster|signage|social media|dedicated edm)\b/i
const GEAR =
  /\b(production package|package|equipment|small equip|av\b|a\/v|mic|microphone|projector|atmospheric|smoke|pa\b|backline|lighting package|gear|console|speaker)\b/i
const PEOPLE =
  /\b(usher|security|technician|techs?\b|warden|foh|stage door|stagehand|labour|labor|crew|staff|rider|audio technicians?|lighting technicians?)\b/i

/**
 * Classify a single description/notes string.
 * Unknown = leave in place + flag (caller must not silent-move).
 */
export function classifyVenueLine(text: string): VenueLineClass {
  const t = (text || '').trim()
  if (!t) return 'unknown'
  // Marketing before people when "Event Marketing + Selling Staff" style — mixed FLAG stays unknown if both strong?
  // Prefer marketing when marketing cues present unless clearly people-only labour.
  if (MARKETING.test(t) && !GEAR.test(t)) {
    // mixed marketing+staff → still marketing bucket but callers may FLAG
    return 'venue_marketing'
  }
  if (GEAR.test(t) && !PEOPLE.test(t)) return 'production_costs'
  if (GEAR.test(t) && PEOPLE.test(t)) {
    // e.g. "lighting technicians" is people; "lighting package" is gear — PEOPLE+lighting without package → staff
    if (/\b(package|equipment|mic|projector|atmospheric|pa\b|gear)\b/i.test(t)) return 'production_costs'
    return 'venue_staff'
  }
  if (PEOPLE.test(t)) return 'venue_staff'
  if (MARKETING.test(t)) return 'venue_marketing'
  return 'unknown'
}

/** True when classification is confident enough to move. */
export function canAutoMove(c: VenueLineClass): boolean {
  return c === 'venue_marketing' || c === 'production_costs' || c === 'venue_staff'
}

/**
 * Filter planned-role line_items, dropping gear roles that belong under production_costs.
 * Keeps people/ops roles. Does not invent replacements.
 */
export function filterStaffLineItems<T extends { role?: string; source?: string }>(
  items: T[] | null | undefined,
): { kept: T[]; removed: T[] } {
  const kept: T[] = []
  const removed: T[] = []
  for (const item of items ?? []) {
    const text = `${item.role ?? ''} ${item.source ?? ''}`
    const c = classifyVenueLine(text)
    if (c === 'production_costs' || c === 'venue_marketing') removed.push(item)
    else kept.push(item)
  }
  return { kept, removed }
}
