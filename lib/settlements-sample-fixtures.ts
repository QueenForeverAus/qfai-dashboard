/**
 * Staging SAMPLE completed shows — invented venues, invented figures.
 * Never real QF 2026 venues. Codes SAMP01–SAMP08 only.
 *
 * Accuracy:
 *   01–03 Accurate (Col3 ≈ Advancing within ~1–2% when settlement exists)
 *   04–06 A little out (hire/staff/AV ~5–15% or tickets slightly wrong)
 *   07–08 Completely wrong (wrong hire basis, missing lines, wild tickets, dupes)
 *
 * Lifecycle (Settlements buckets — remittance / Col3 actuals, not runs.status):
 *   not_settled:          SAMP01, SAMP04, SAMP07
 *   settled:              SAMP02, SAMP05
 *   settled_remitted:     SAMP03, SAMP06, SAMP08
 *
 * Booking status: every SAMPLE run stays BOOKED (`runs.status = confirmed`)
 * so Run Advancing stays open. Settlements completed-only still includes them
 * because show_date is in the past. Do not seed `post_show` / `settled` —
 * that regresses Advancing. Real non-SAMPLE shows stay BOOKED-only; this is
 * not a production Advancing exception.
 *
 * SAMP04 Northwharf Studio Theatre is the Advancing + Settlements test vehicle.
 */

import { BOOKED_BOOKING_STATUS } from './booked-cost-freeze.ts'
import {
  PRODUCTION_BOUGHT_IN_LABEL,
  VENUE_PRODUCTION_AV_LABEL,
  type CostFieldState,
} from './cost-fields.ts'
import { SOCIAL_ADS_PER_TICKET } from './settlements-sheet.ts'

export const SETTLEMENTS_SAMPLE_CONFIRM = 'SAMPLE_ONLY' as const

export const SETTLEMENTS_SAMPLE_CODES = [
  'SAMP01',
  'SAMP02',
  'SAMP03',
  'SAMP04',
  'SAMP05',
  'SAMP06',
  'SAMP07',
  'SAMP08',
] as const

export type SettlementsSampleCode = (typeof SETTLEMENTS_SAMPLE_CODES)[number]

/** Real staging runs this seed must never touch. */
export const SETTLEMENTS_SEED_PROTECTED_CODES = ['R01', 'TRECV1', 'TCOMP1', 'R12'] as const

export const PROD_SUPABASE_PROJECT_REF = 'pfbgrukqxegkiaksuatm'
export const STAGING_SUPABASE_PROJECT_REF = 'nlenbzhwnyigsihcphoz'

export type SampleAccuracy = 'accurate' | 'a_little_out' | 'completely_wrong'
export type SampleLifecycle = 'not_settled' | 'settled' | 'settled_remitted'

/** SAMPLE completed runs stay BOOKED so Advancing UI stays open. */
export const SAMPLE_RUN_BOOKING_STATUS = BOOKED_BOOKING_STATUS

export function sampleRunBookingStatus(): typeof SAMPLE_RUN_BOOKING_STATUS {
  return SAMPLE_RUN_BOOKING_STATUS
}

export const SAMPLE_SOCIAL_ADS_LABEL = 'Social Media Marketing Co. — $1/ticket'
export const SAMPLE_SOCIAL_ADS_NOTES =
  'SAMPLE AUTO CALC · $1.10/ticket — Daniel Champagne / Social Media Marketing Co.'

export type SampleCostLine = {
  field_key: string
  category: string
  label: string
  amount: number
  scope: 'show' | 'run'
  notes?: string
  /** cost_fields.state — default estimated; confirmed/PAID lines roll up to known. */
  state?: CostFieldState
  /** Entry confirm tick. PAID implies confirmed. */
  entryConfirmed?: boolean
  entryPaid?: boolean
}

export type SampleActualLine = {
  line_key: string
  amount: number
  notes?: string
}

export type SampleShowFixture = {
  show_order: number
  venue_name: string
  venue_city: string
  state_territory: string
  show_date: string
  capacity: number
  ticket_price: number
  tickets_sold: number
  booking_fee_per_payer?: number | null
}

export type SettlementsSampleFixture = {
  code: SettlementsSampleCode
  name: string
  notes: string
  accuracy: SampleAccuracy
  lifecycle: SampleLifecycle
  region: 'group1' | 'group2' | 'group3'
  show: SampleShowFixture
  advancing: SampleCostLine[]
  /** Col3 venue/band actuals — only when lifecycle is settled or remitted. */
  actuals: SampleActualLine[]
  remittanceAmount: number | null
}

export const SETTLEMENTS_SAMPLE_FIXTURES: SettlementsSampleFixture[] = [
  {
    code: 'SAMP01',
    name: 'SAMPLE · The Marble Room (Port Rowan)',
    notes: 'SAMPLE DEMO completed show — Accurate advancing; not settled. BOOKED (`confirmed`) so Advancing stays open. Invented venue, not a QF 2026 date.',
    accuracy: 'accurate',
    lifecycle: 'not_settled',
    region: 'group1',
    show: {
      show_order: 1,
      venue_name: 'The Marble Room',
      venue_city: 'Port Rowan',
      state_territory: 'VIC',
      show_date: '2026-07-18',
      capacity: 420,
      ticket_price: 79,
      tickets_sold: 318,
    },
    advancing: sampleAdvancingLines({
      venue_hire: 2800,
      venue_staff: 3600,
      venue_marketing: 220,
      production_costs: 800,
      flights: 1840,
      accommodation: 1260,
      crew_fees_total: 2650,
      lighting_hire: 900,
      tickets_sold: 318,
    }),
    actuals: [],
    remittanceAmount: null,
  },
  {
    code: 'SAMP02',
    name: 'SAMPLE · Willowgate Civic Hall (Kestrel Bay)',
    notes: 'SAMPLE DEMO completed show — Accurate Col3 (~1%); settled, not remitted. BOOKED (`confirmed`) so Advancing stays open. Invented venue.',
    accuracy: 'accurate',
    lifecycle: 'settled',
    region: 'group2',
    show: {
      show_order: 1,
      venue_name: 'Willowgate Civic Hall',
      venue_city: 'Kestrel Bay',
      state_territory: 'NSW',
      show_date: '2026-06-22',
      capacity: 560,
      ticket_price: 85,
      tickets_sold: 441,
    },
    advancing: sampleAdvancingLines({
      venue_hire: 3200,
      venue_staff: 4100,
      venue_marketing: 250,
      production_costs: 950,
      flights: 2100,
      accommodation: 1480,
      crew_fees_total: 2650,
      lighting_hire: 900,
      tickets_sold: 441,
    }),
    actuals: [
      { line_key: 'tickets_sold', amount: 441, notes: 'SAMPLE Harbour fixture — tickets match' },
      { line_key: 'show:venue_hire', amount: 3232, notes: 'SAMPLE +1.0% vs Advancing' },
      { line_key: 'show:venue_staff', amount: 4060, notes: 'SAMPLE −1.0% vs Advancing' },
      { line_key: 'show:venue_marketing', amount: 252, notes: 'SAMPLE +0.8% vs Advancing' },
      { line_key: 'show:production_costs', amount: 941, notes: 'SAMPLE −0.9% vs Advancing' },
    ],
    remittanceAmount: null,
  },
  {
    code: 'SAMP03',
    name: 'SAMPLE · Red Lantern Pavilion (Ironbark)',
    notes: 'SAMPLE DEMO completed show — Accurate Col3 (~1.5%); settled & remitted. BOOKED (`confirmed`) so Advancing stays open. Invented venue.',
    accuracy: 'accurate',
    lifecycle: 'settled_remitted',
    region: 'group2',
    show: {
      show_order: 1,
      venue_name: 'Red Lantern Pavilion',
      venue_city: 'Ironbark',
      state_territory: 'SA',
      show_date: '2026-05-09',
      capacity: 380,
      ticket_price: 72,
      tickets_sold: 290,
    },
    advancing: sampleAdvancingLines({
      venue_hire: 2100,
      venue_staff: 2750,
      venue_marketing: 180,
      production_costs: 600,
      flights: 1620,
      accommodation: 980,
      crew_fees_total: 2650,
      lighting_hire: 900,
      tickets_sold: 290,
    }),
    actuals: [
      { line_key: 'tickets_sold', amount: 290 },
      { line_key: 'show:venue_hire', amount: 2132, notes: 'SAMPLE +1.5% vs Advancing' },
      { line_key: 'show:venue_staff', amount: 2710, notes: 'SAMPLE −1.5% vs Advancing' },
      { line_key: 'show:venue_marketing', amount: 183, notes: 'SAMPLE +1.7% vs Advancing' },
      { line_key: 'show:production_costs', amount: 609, notes: 'SAMPLE +1.5% vs Advancing' },
    ],
    remittanceAmount: 14850,
  },
  {
    code: 'SAMP04',
    name: 'SAMPLE · Northwharf Studio Theatre (Cape Lumen)',
    notes: 'SAMPLE DEMO Advancing + Settlements test vehicle — A little out (tickets −8% vs a 390 expected note); not settled. BOOKED (`confirmed`) + past show_date so Gareth can open Advancing and Settlements. Invented venue.',
    accuracy: 'a_little_out',
    lifecycle: 'not_settled',
    region: 'group2',
    show: {
      show_order: 1,
      venue_name: 'Northwharf Studio Theatre',
      venue_city: 'Cape Lumen',
      state_territory: 'TAS',
      show_date: '2026-04-03',
      capacity: 500,
      ticket_price: 80,
      tickets_sold: 359,
    },
    advancing: sampleAdvancingLines({
      venue_hire: 3000,
      venue_staff: 3900,
      venue_marketing: 200,
      production_costs: 700,
      flights: 1980,
      accommodation: 1320,
      crew_fees_total: 2650,
      lighting_hire: 900,
      tickets_sold: 359,
    }, {
      venue_hire: 'SAMPLE expected ~$3,000 — settlement not in yet',
    }),
    actuals: [],
    remittanceAmount: null,
  },
  {
    code: 'SAMP05',
    name: 'SAMPLE · Clocktower Rooms (Millhaven)',
    notes: 'SAMPLE DEMO completed show — A little out (hire/staff/AV 8–12%); settled, not remitted. BOOKED (`confirmed`) so Advancing stays open. Invented venue.',
    accuracy: 'a_little_out',
    lifecycle: 'settled',
    region: 'group3',
    show: {
      show_order: 1,
      venue_name: 'Clocktower Rooms',
      venue_city: 'Millhaven',
      state_territory: 'QLD',
      show_date: '2026-03-14',
      capacity: 640,
      ticket_price: 82,
      tickets_sold: 505,
    },
    advancing: sampleAdvancingLines({
      venue_hire: 3600,
      venue_staff: 4800,
      venue_marketing: 280,
      production_costs: 1100,
      flights: 2480,
      accommodation: 1680,
      crew_fees_total: 2650,
      lighting_hire: 900,
      tickets_sold: 505,
    }),
    actuals: [
      { line_key: 'tickets_sold', amount: 528, notes: 'SAMPLE tickets +4.6% vs Advancing count' },
      { line_key: 'show:venue_hire', amount: 4032, notes: 'SAMPLE hire +12% vs Advancing' },
      { line_key: 'show:venue_staff', amount: 4416, notes: 'SAMPLE staff −8% vs Advancing' },
      { line_key: 'show:venue_marketing', amount: 280 },
      { line_key: 'show:production_costs', amount: 1210, notes: 'SAMPLE AV +10% vs Advancing' },
    ],
    remittanceAmount: null,
  },
  {
    code: 'SAMP06',
    name: 'SAMPLE · Saltwind Arts House (Greyhaven)',
    notes: 'SAMPLE DEMO completed show — A little out (staff +14%, hire −6%); settled & remitted. BOOKED (`confirmed`) so Advancing stays open. Invented venue.',
    accuracy: 'a_little_out',
    lifecycle: 'settled_remitted',
    region: 'group3',
    show: {
      show_order: 1,
      venue_name: 'Saltwind Arts House',
      venue_city: 'Greyhaven',
      state_territory: 'WA',
      show_date: '2026-02-28',
      capacity: 480,
      ticket_price: 76,
      tickets_sold: 352,
    },
    advancing: sampleAdvancingLines({
      venue_hire: 2900,
      venue_staff: 3500,
      venue_marketing: 210,
      production_costs: 740,
      flights: 3120,
      accommodation: 1540,
      crew_fees_total: 2650,
      lighting_hire: 900,
      tickets_sold: 352,
    }),
    actuals: [
      { line_key: 'tickets_sold', amount: 338, notes: 'SAMPLE tickets −4% vs Advancing count' },
      { line_key: 'show:venue_hire', amount: 2726, notes: 'SAMPLE hire −6% vs Advancing' },
      { line_key: 'show:venue_staff', amount: 3990, notes: 'SAMPLE staff +14% vs Advancing' },
      { line_key: 'show:venue_marketing', amount: 210 },
      { line_key: 'show:production_costs', amount: 814, notes: 'SAMPLE AV +10% vs Advancing' },
    ],
    remittanceAmount: 12140,
  },
  {
    code: 'SAMP07',
    name: 'SAMPLE · The Copper Attic (Finchley Vale)',
    notes: 'SAMPLE DEMO completed show — Completely wrong advancing (hire as hotel nights, missing staff, wild tickets, duplicate flights); not settled. BOOKED (`confirmed`) so Advancing stays open. Invented venue.',
    accuracy: 'completely_wrong',
    lifecycle: 'not_settled',
    region: 'group3',
    show: {
      show_order: 1,
      venue_name: 'The Copper Attic',
      venue_city: 'Finchley Vale',
      state_territory: 'NT',
      show_date: '2026-01-11',
      capacity: 600,
      ticket_price: 70,
      tickets_sold: 47,
    },
    advancing: sampleAdvancingLines({
      venue_hire: 540,
      venue_staff: 0,
      venue_marketing: 90,
      production_costs: 0,
      flights: 4200,
      accommodation: 1600,
      crew_fees_total: 2650,
      lighting_hire: 900,
      tickets_sold: 47,
    }, {
      venue_hire: 'SAMPLE WRONG BASIS — $180×3 hotel nights booked as hall hire',
      venue_staff: 'SAMPLE missing big staff line',
      production_costs: 'SAMPLE missing AV',
      flights: 'SAMPLE duplicate SYD↔DRW charged twice in entries',
    }),
    actuals: [],
    remittanceAmount: null,
  },
  {
    code: 'SAMP08',
    name: 'SAMPLE · Harborlight Room (Newbridge-on-Murray)',
    notes: 'SAMPLE DEMO completed show — Completely wrong Col3 (wild tickets, hire as hotel, missing AV, duplicate ushers); settled & remitted. BOOKED (`confirmed`) so Advancing stays open. Invented venue.',
    accuracy: 'completely_wrong',
    lifecycle: 'settled_remitted',
    region: 'group1',
    show: {
      show_order: 1,
      venue_name: 'Harborlight Room',
      venue_city: 'Newbridge-on-Murray',
      state_territory: 'VIC',
      show_date: '2025-12-07',
      capacity: 540,
      ticket_price: 88,
      tickets_sold: 410,
    },
    advancing: sampleAdvancingLines({
      venue_hire: 3400,
      venue_staff: 4300,
      venue_marketing: 240,
      production_costs: 980,
      flights: 1760,
      accommodation: 1400,
      crew_fees_total: 2650,
      lighting_hire: 900,
      tickets_sold: 410,
    }),
    actuals: [
      { line_key: 'tickets_sold', amount: 89, notes: 'SAMPLE wildly off vs Advancing 410' },
      { line_key: 'show:venue_hire', amount: 540, notes: 'SAMPLE WRONG BASIS — 3 hotel nights billed as hire' },
      { line_key: 'show:venue_staff', amount: 4300, notes: 'SAMPLE ushers' },
      { line_key: 'show:venue_staff::duplicate', amount: 4300, notes: 'SAMPLE duplicate usher charge' },
      { line_key: 'show:venue_marketing', amount: 240 },
    ],
    remittanceAmount: 6200,
  },
]

export function isSettlementsSampleCode(code: string | null | undefined): boolean {
  return SETTLEMENTS_SAMPLE_CODES.includes(String(code ?? '').toUpperCase() as SettlementsSampleCode)
}

export function isProtectedSettlementsSeedCode(code: string | null | undefined): boolean {
  return (SETTLEMENTS_SEED_PROTECTED_CODES as readonly string[]).includes(String(code ?? '').toUpperCase())
}

/** Prod Supabase must never receive this seed. Local + staging are allowed. */
export function isSettlementsSeedTargetAllowed(supabaseUrl: string | null | undefined): boolean {
  const url = String(supabaseUrl ?? '')
  if (!url) return false
  if (url.includes(PROD_SUPABASE_PROJECT_REF)) return false
  return true
}

export function sampleFixtureInventory(): Array<{
  code: SettlementsSampleCode
  accuracy: SampleAccuracy
  lifecycle: SampleLifecycle
  venue: string
  show_date: string
  run_status: typeof SAMPLE_RUN_BOOKING_STATUS
}> {
  return SETTLEMENTS_SAMPLE_FIXTURES.map(f => ({
    code: f.code,
    accuracy: f.accuracy,
    lifecycle: f.lifecycle,
    venue: `${f.show.venue_name}, ${f.show.venue_city}`,
    show_date: f.show.show_date,
    run_status: SAMPLE_RUN_BOOKING_STATUS,
  }))
}

type SampleLineMix = {
  notes?: string
  state?: CostFieldState
  confirmed?: boolean
  paid?: boolean
}

type SampleLineExtras = string | SampleLineMix

const PAID: SampleLineMix = { confirmed: true, paid: true }
const CONFIRMED: SampleLineMix = { confirmed: true, paid: false }

function parseLineExtras(extras?: SampleLineExtras): SampleLineMix {
  if (extras == null) return {}
  if (typeof extras === 'string') return { notes: extras }
  return extras
}

function withMix(base: SampleCostLine, extras?: SampleLineExtras): SampleCostLine {
  const mix = parseLineExtras(extras)
  return {
    ...base,
    notes: mix.notes ?? base.notes,
    state: mix.state ?? base.state,
    entryConfirmed: mix.confirmed === true || mix.paid === true,
    entryPaid: mix.paid === true,
  }
}

function showLine(field_key: string, label: string, amount: number, extras?: SampleLineExtras): SampleCostLine {
  return withMix({ field_key, category: 'Venue Costs', label, amount, scope: 'show' }, extras)
}

function runLine(field_key: string, label: string, amount: number, extras?: SampleLineExtras): SampleCostLine {
  const category = field_key === 'crew_fees_total' ? 'Crew & Operations'
    : field_key === 'lighting_hire' ? 'Production'
      : field_key === 'social_ads_var' ? 'Marketing'
        : 'Travel & Accommodation'
  return withMix({ field_key, category, label, amount, scope: 'run' }, extras)
}

function socialAdsLine(ticketsSold: number): SampleCostLine {
  const amount = Math.round(ticketsSold * SOCIAL_ADS_PER_TICKET * 100) / 100
  return runLine('social_ads_var', SAMPLE_SOCIAL_ADS_LABEL, amount, {
    state: 'auto_calc',
    notes: SAMPLE_SOCIAL_ADS_NOTES,
  })
}

/** Realistic Advancing mix used by every SAMPLE fixture (SAMP04 Northwharf is the test vehicle). */
function sampleAdvancingLines(
  amounts: {
    venue_hire: number
    venue_staff: number
    venue_marketing: number
    production_costs: number
    flights: number
    accommodation: number
    crew_fees_total: number
    lighting_hire: number
    tickets_sold: number
  },
  notes?: Partial<Record<keyof typeof amounts | 'social_ads_var', string>>,
): SampleCostLine[] {
  return [
    showLine('venue_hire', 'Venue Hire', amounts.venue_hire, {
      ...CONFIRMED,
      notes: notes?.venue_hire,
    }),
    showLine('venue_staff', 'Venue Staff / On-costs', amounts.venue_staff, {
      ...CONFIRMED,
      notes: notes?.venue_staff,
    }),
    showLine('venue_marketing', 'Venue Marketing', amounts.venue_marketing, notes?.venue_marketing),
    showLine('production_costs', VENUE_PRODUCTION_AV_LABEL, amounts.production_costs, {
      ...CONFIRMED,
      notes: notes?.production_costs,
    }),
    runLine('flights', 'Flights', amounts.flights, { ...PAID, notes: notes?.flights }),
    runLine('accommodation', 'Accommodation', amounts.accommodation, {
      ...PAID,
      notes: notes?.accommodation,
    }),
    runLine('crew_fees_total', 'Crew Fees (all shows)', amounts.crew_fees_total, CONFIRMED),
    runLine('lighting_hire', PRODUCTION_BOUGHT_IN_LABEL, amounts.lighting_hire, PAID),
    socialAdsLine(amounts.tickets_sold),
  ]
}

export function sampleAdvancingMixCounts(advancing: SampleCostLine[]): {
  paid: number
  confirmedUnpaid: number
  autoCalc: number
} {
  return {
    paid: advancing.filter(l => l.entryPaid === true).length,
    confirmedUnpaid: advancing.filter(l => l.entryConfirmed === true && l.entryPaid !== true).length,
    autoCalc: advancing.filter(l => l.state === 'auto_calc' || l.field_key === 'social_ads_var').length,
  }
}
