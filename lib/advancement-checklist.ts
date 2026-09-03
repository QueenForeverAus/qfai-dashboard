import type { RunRegion } from '@/lib/types'

export type { RunRegion }

export type AssignedTo =
  | 'gareth'
  | 'michael'
  | 'harbour'
  | 'anita'
  | 'brad'
  | 'finance'
  | 'nigel'
  // Legacy values still present in DB rows until synced
  | 'tour_manager'
  | 'production_manager'

export type AdvancementScope = 'run' | 'show'

export type AdvancementChecklistItem = {
  category: string
  item_key: string
  label: string
  assigned_to: AssignedTo
  sort_order: number
  scope: AdvancementScope
  payment_type?: 'upfront' | 'post_gig'
  /** Omit = applies to all regions. */
  regions?: RunRegion[]
  /** Item only applies if any show on the run has state_territory in this list (e.g. ['TAS']). */
  requiresShowStates?: string[]
}

export const REGION_LABELS: Record<RunRegion, string> = {
  group1: 'Group 1 · Self-drive',
  group2: 'Group 2 · Fly + Van',
  group3: 'Group 3 · Fly + Local Backline',
}

export const ASSIGNABLE_OWNERS: AssignedTo[] = [
  'harbour',
  'anita',
  'gareth',
  'michael',
  'brad',
  'finance',
  'nigel',
]

/**
 * Chronological Advancing Shows phases — consolidated outcomes (not micro-steps).
 * Phase 0 (offer) is outside this tab. Region / state filters gate travel rows.
 */
export const ADVANCEMENT_CHECKLIST: AdvancementChecklistItem[] = [
  // ── 1. Harbour — Deal lock (per show) ─────────────────────────────────
  { scope: 'show', category: '1. Harbour — Deal lock', item_key: 'venue_deal_locked', label: 'Venue deal locked; contacts ready for Michael', assigned_to: 'harbour', sort_order: 100 },
  { scope: 'show', category: '1. Harbour — Deal lock', item_key: 'ticketing_terms_confirmed', label: 'Ticketing terms / capacity / prices confirmed for announce', assigned_to: 'harbour', sort_order: 110 },

  // ── 2. Anita — Marketing assets (per show) ────────────────────────────
  { scope: 'show', category: '2. Anita — Marketing assets', item_key: 'venue_asset_brief', label: 'Venue asset brief received (sizes/layouts required)', assigned_to: 'anita', sort_order: 200 },
  { scope: 'show', category: '2. Anita — Marketing assets', item_key: 'assets_prepared_sent', label: 'Assets prepared & sent to Harbour', assigned_to: 'anita', sort_order: 210 },

  // ── 3. Harbour — Ticket release (per show) ────────────────────────────
  { scope: 'show', category: '3. Harbour — Ticket release', item_key: 'ticket_onsale_ready', label: 'Ticket on-sale / announce date set; any presale noted', assigned_to: 'harbour', sort_order: 300 },

  // ── 4. Announce — Our channels (per show) ─────────────────────────────
  { scope: 'show', category: '4. Announce — Our channels', item_key: 'announced_channels', label: 'Announced on QF socials / website / FB event', assigned_to: 'gareth', sort_order: 400 },

  // ── 5. Promo plan (per show) ──────────────────────────────────────────
  { scope: 'show', category: '5. Promo plan', item_key: 'promo_plan_started', label: 'Promo plan agreed & started (Harbour posters + Gareth ads/offline)', assigned_to: 'harbour', sort_order: 500 },
  { scope: 'show', category: '5. Promo plan', item_key: 'ongoing_promo_chase', label: 'Ongoing promo chase through to show', assigned_to: 'harbour', sort_order: 540 },

  // ── 6. Travel logistics plan (run) ────────────────────────────────────
  { scope: 'run', category: '6. Travel logistics plan', item_key: 'day_before_rules', label: 'Day-before rules applied (WA, NT, far Nth QLD, intl; Tas ferry timing)', assigned_to: 'gareth', sort_order: 610, regions: ['group2', 'group3'] },
  { scope: 'run', category: '6. Travel logistics plan', item_key: 'brad_availability', label: 'Brad availability confirmed for interstate drive days', assigned_to: 'brad', sort_order: 620, regions: ['group1', 'group2'] },
  { scope: 'run', category: '6. Travel logistics plan', item_key: 'driver_confirmed', label: 'Designated drivers locked', assigned_to: 'gareth', sort_order: 630 },
  { scope: 'run', category: '6. Travel logistics plan', item_key: 'open_jaw_airport_plan', label: 'Open-jaw / airport plan locked', assigned_to: 'gareth', sort_order: 640, regions: ['group2', 'group3'] },
  { scope: 'run', category: '6. Travel logistics plan', item_key: 'ferry_plan_locked', label: 'Ferry plan locked (cabin, not recliner)', assigned_to: 'gareth', sort_order: 650, regions: ['group2'], requiresShowStates: ['TAS'] },

  // ── 7. Michael — Venue / tech (per show) ──────────────────────────────
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'first_venue_contact', label: 'Venue advance started', assigned_to: 'michael', sort_order: 700 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'loading_dock_info', label: 'Loading dock address & access instructions', assigned_to: 'michael', sort_order: 710 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'schedule_targets_confirmed', label: 'Schedule locked with venue (start / doors / access / soundcheck / dinner / M&G)', assigned_to: 'michael', sort_order: 720 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'bump_in_tech_audio', label: 'Bump-in tech — Audio (Adam via Michael)', assigned_to: 'michael', sort_order: 740 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'bump_in_tech_lighting', label: 'Bump-in tech — Lighting', assigned_to: 'michael', sort_order: 750 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'bump_out_techs', label: 'Bump-out techs', assigned_to: 'michael', sort_order: 760 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'followspot_op', label: 'Followspot op', assigned_to: 'michael', sort_order: 770 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'risers_confirmed', label: 'Risers: keys ≥300mm, drum ≥600mm, amp ≥600mm, guitar risers pre-assembled', assigned_to: 'michael', sort_order: 780 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'vision_input', label: 'Vision input at USL of drum riser (HDMI/SDI)', assigned_to: 'michael', sort_order: 790 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'extra_lx_pa', label: 'Extra LX / PA assessed', assigned_to: 'michael', sort_order: 800 },
  { scope: 'show', category: '7. Michael — Venue / tech', item_key: 'backline_hire_ordered', label: 'Backline hire quoted & ordered', assigned_to: 'michael', sort_order: 820, regions: ['group3'] },

  // ── 8. Book travel & stay (run) ───────────────────────────────────────
  { scope: 'run', category: '8. Book travel & stay', item_key: 'flights_complete', label: 'Flights booked; details & baggage recorded', assigned_to: 'gareth', sort_order: 900, regions: ['group2', 'group3'] },
  { scope: 'run', category: '8. Book travel & stay', item_key: 'car_hire_van', label: 'Car hire / van booked', assigned_to: 'gareth', sort_order: 930, regions: ['group2', 'group3'] },
  { scope: 'run', category: '8. Book travel & stay', item_key: 'spirit_ferry_cabin', label: 'Spirit ferry booked with cabin', assigned_to: 'gareth', sort_order: 940, regions: ['group2'], requiresShowStates: ['TAS'] },
  { scope: 'run', category: '8. Book travel & stay', item_key: 'hotel_confirmed', label: 'Hotel booked with names; details sent to Michael', assigned_to: 'gareth', sort_order: 950 },
  { scope: 'run', category: '8. Book travel & stay', item_key: 'tech_rooms_noon', label: 'Tech rooms noon / early check-in / late checkout as needed', assigned_to: 'gareth', sort_order: 960 },
  { scope: 'run', category: '8. Book travel & stay', item_key: 'brad_vehicle_pickup', label: 'Brad: vehicle pickup/return; fuel receipts to finance', assigned_to: 'brad', sort_order: 990, regions: ['group1', 'group2'] },

  // ── 9. Merch + Hospitality (per show) ─────────────────────────────────
  { scope: 'show', category: '9. Merch + Hospitality', item_key: 'merch_arranged', label: 'Merch plan locked (selling? seller + table/float)', assigned_to: 'michael', sort_order: 1000 },
  { scope: 'show', category: '9. Merch + Hospitality', item_key: 'hospitality_confirmed', label: 'Hospitality rider submitted & catering confirmed', assigned_to: 'michael', sort_order: 1020 },

  // ── 10. Finance — Show week / post (run) ──────────────────────────────
  { scope: 'run', category: '10. Finance — Show week / post', item_key: 'payment_terms_noted', label: 'Supplier payment terms noted (upfront vs post-gig)', assigned_to: 'michael', sort_order: 1100 },
  { scope: 'run', category: '10. Finance — Show week / post', item_key: 'upfront_payments_complete', label: 'Upfront payments notified & paid', assigned_to: 'finance', payment_type: 'upfront', sort_order: 1110 },
  { scope: 'run', category: '10. Finance — Show week / post', item_key: 'crew_band_fees_paid', label: 'Crew / band show fees paid / scheduled', assigned_to: 'finance', sort_order: 1130 },
  { scope: 'run', category: '10. Finance — Show week / post', item_key: 'settlement_complete', label: 'Settlement with Harbour; invoices & books updated', assigned_to: 'finance', sort_order: 1150 },

  // ── T-10 — Show worksheet (per show) ──────────────────────────────────
  { scope: 'show', category: 'T-10 — Show worksheet', item_key: 'worksheet_ready', label: 'Show worksheet drafted & Michael-approved', assigned_to: 'nigel', sort_order: 1200 },
  { scope: 'show', category: 'T-10 — Show worksheet', item_key: 'worksheet_issued', label: 'Worksheet issued to band/crew', assigned_to: 'nigel', sort_order: 1220 },
]

function normaliseState(state: string): string {
  return state.trim().toUpperCase()
}

function itemApplies(
  item: AdvancementChecklistItem,
  region: RunRegion,
  showStates: string[],
): boolean {
  if (item.regions && !item.regions.includes(region)) return false
  if (item.requiresShowStates && item.requiresShowStates.length > 0) {
    const required = item.requiresShowStates.map(normaliseState)
    const have = showStates.map(normaliseState)
    if (!required.some(r => have.includes(r))) return false
  }
  return true
}

/** Region-aware defaults; optional label tweaks per region. */
export function checklistForRun(
  region: RunRegion,
  showStates: string[] = [],
): AdvancementChecklistItem[] {
  return ADVANCEMENT_CHECKLIST
    .filter(item => itemApplies(item, region, showStates))
    .map(item => {
      if (item.item_key === 'car_hire_van' && region === 'group3') {
        return { ...item, label: 'Kia Carnival / local cars booked' }
      }
      if (item.item_key === 'car_hire_van' && region === 'group2') {
        return { ...item, label: 'MEL van hire booked' }
      }
      if (item.item_key === 'driver_confirmed' && region === 'group1') {
        return { ...item, label: 'Self-drive drivers locked' }
      }
      if (item.item_key === 'driver_confirmed' && region === 'group2') {
        return { ...item, label: 'Designated drivers locked (Brad van / band cars)' }
      }
      if (item.item_key === 'driver_confirmed' && region === 'group3') {
        return { ...item, label: 'Carnival / local drivers locked' }
      }
      return item
    })
}

export function knownKeysForRun(region: RunRegion, showStates: string[] = []): Set<string> {
  return new Set(checklistForRun(region, showStates).map(i => i.item_key))
}

/** Phase display order (chronological). */
export const PHASE_ORDER = [
  '1. Harbour — Deal lock',
  '2. Anita — Marketing assets',
  '3. Harbour — Ticket release',
  '4. Announce — Our channels',
  '5. Promo plan',
  '6. Travel logistics plan',
  '7. Michael — Venue / tech',
  '8. Book travel & stay',
  '9. Merch + Hospitality',
  '10. Finance — Show week / post',
  'T-10 — Show worksheet',
]

/** @deprecated use PHASE_ORDER */
export const RUN_CATEGORY_ORDER = PHASE_ORDER.filter(p =>
  ADVANCEMENT_CHECKLIST.some(i => i.category === p && i.scope === 'run'),
)

/** @deprecated use PHASE_ORDER */
export const SHOW_CATEGORY_ORDER = PHASE_ORDER.filter(p =>
  ADVANCEMENT_CHECKLIST.some(i => i.category === p && i.scope === 'show'),
)

/** @deprecated use PHASE_ORDER */
export const CATEGORY_ORDER = PHASE_ORDER

/** Map legacy assigned_to values → current owner keys. */
export function normalizeAssignedTo(value: string): AssignedTo {
  if (value === 'tour_manager') return 'gareth'
  if (value === 'production_manager') return 'michael'
  return value as AssignedTo
}

/**
 * When seeding a new consolidated key, inherit status if all listed legacy
 * keys (same scope) are done. Soft-ignore only — legacy rows are left in DB.
 */
export const LEGACY_STATUS_SOURCES: Record<string, string[]> = {
  // Prior consolidations
  schedule_targets_confirmed: [
    'show_time_confirmed',
    'venue_access_confirmed',
    'soundcheck_time',
    'dinner_arranged',
    'doors_time',
    'meet_greet_confirmed',
  ],
  risers_confirmed: ['risers_keys', 'risers_drum', 'risers_amp', 'guitar_risers'],
  tech_rooms_noon: ['early_checkin_flights'],
  spirit_ferry_cabin: [],

  // Deal / contacts fold
  venue_deal_locked: ['venue_contacts_for_michael'],

  // Anita assets
  assets_prepared_sent: ['assets_prepared', 'fb_event_image', 'assets_sent_to_harbour'],

  // Harbour ticket release
  ticket_onsale_ready: ['ticket_onsale_date', 'presale_noted'],

  // Announce
  announced_channels: [
    'announced_qf_socials',
    'listed_qf_website',
    'fb_event_created',
    'presale_live',
  ],

  // Promo
  promo_plan_started: [
    'promo_plan_agreed',
    'harbour_poster_assist',
    'fb_ads_placed',
    'regional_offline_promo',
  ],

  // Michael extras / backline
  extra_lx_pa: ['extra_lighting', 'extra_pa'],
  backline_hire_ordered: ['backline_needed', 'backline_quotes', 'hire_orders_placed'],

  // Book travel
  flights_complete: ['flights_booked', 'flight_details_recorded', 'baggage_allowance'],
  hotel_confirmed: ['hotel_booked', 'names_on_booking', 'hotel_details_to_michael'],

  // Merch / hospitality
  merch_arranged: ['merch_decision', 'merch_seller'],
  hospitality_confirmed: [
    'catering_rider_submitted',
    'catering_quote_received',
    'catering_confirmed',
  ],

  // Finance
  upfront_payments_complete: ['accounts_notified', 'upfront_payments_made'],
  settlement_complete: [
    'vendor_invoices_processed',
    'settlement_with_harbour',
    'books_updated',
  ],

  // T-10
  worksheet_ready: ['worksheet_drafted', 'worksheet_approved'],
}

export const OWNER_LABELS: Record<AssignedTo, string> = {
  gareth: 'Gareth',
  michael: 'Michael',
  harbour: 'Harbour',
  anita: 'Anita',
  brad: 'Brad',
  finance: 'Dave',
  nigel: 'Nigel',
  tour_manager: 'Gareth',
  production_manager: 'Michael',
}

export const OWNER_STYLES: Record<AssignedTo, string> = {
  gareth: 'bg-blue-900/50 text-blue-300 border border-blue-800',
  michael: 'bg-purple-900/50 text-purple-300 border border-purple-800',
  harbour: 'bg-cyan-900/50 text-cyan-300 border border-cyan-800',
  anita: 'bg-pink-900/50 text-pink-300 border border-pink-800',
  brad: 'bg-orange-900/50 text-orange-300 border border-orange-800',
  finance: 'bg-emerald-900/50 text-emerald-300 border border-emerald-800',
  nigel: 'bg-slate-700/60 text-slate-300 border border-slate-600',
  tour_manager: 'bg-blue-900/50 text-blue-300 border border-blue-800',
  production_manager: 'bg-purple-900/50 text-purple-300 border border-purple-800',
}

export const FILTER_OWNERS: { key: AssignedTo; label: string }[] = [
  { key: 'harbour', label: 'Harbour' },
  { key: 'anita', label: 'Anita' },
  { key: 'gareth', label: 'Gareth' },
  { key: 'michael', label: 'Michael' },
  { key: 'brad', label: 'Brad' },
  { key: 'finance', label: 'Dave' },
  { key: 'nigel', label: 'Nigel' },
]

/** All known keys across regions (current catalog). Prefer knownKeysForRun for a run. */
export const KNOWN_ITEM_KEYS = new Set(ADVANCEMENT_CHECKLIST.map(i => i.item_key))
