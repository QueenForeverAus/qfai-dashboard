/**
 * Staging SAMPLE completed shows — invented venues, invented figures.
 * Never real QF 2026 venues. Codes SAMP01–SAMP08 only.
 *
 * Accuracy:
 *   01–03 Accurate (Col3 ≈ Advancing within ~1–2% when settlement exists)
 *   04–06 A little out (hire/staff/AV ~5–15% or tickets slightly wrong)
 *   07–08 Completely wrong (wrong hire basis, missing lines, wild tickets, dupes)
 *
 * Lifecycle:
 *   not_settled:          SAMP01, SAMP04, SAMP07
 *   settled:              SAMP02, SAMP05
 *   settled_remitted:     SAMP03, SAMP06, SAMP08
 */

import {
  PRODUCTION_BOUGHT_IN_LABEL,
  VENUE_PRODUCTION_AV_LABEL,
} from './cost-fields.ts'

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

export type SampleCostLine = {
  field_key: string
  category: string
  label: string
  amount: number
  scope: 'show' | 'run'
  notes?: string
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
    notes: 'SAMPLE DEMO completed show — Accurate advancing; not settled. Invented venue, not a QF 2026 date.',
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
    advancing: [
      showLine('venue_hire', 'Venue Hire', 2800),
      showLine('venue_staff', 'Venue Staff / On-costs', 3600),
      showLine('venue_marketing', 'Venue Marketing', 220),
      showLine('production_costs', VENUE_PRODUCTION_AV_LABEL, 800),
      runLine('flights', 'Flights', 1840),
      runLine('accommodation', 'Accommodation', 1260),
      runLine('crew_fees_total', 'Crew Fees (all shows)', 2650),
      runLine('lighting_hire', PRODUCTION_BOUGHT_IN_LABEL, 900),
    ],
    actuals: [],
    remittanceAmount: null,
  },
  {
    code: 'SAMP02',
    name: 'SAMPLE · Willowgate Civic Hall (Kestrel Bay)',
    notes: 'SAMPLE DEMO completed show — Accurate Col3 (~1%); settled, not remitted. Invented venue.',
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
    advancing: [
      showLine('venue_hire', 'Venue Hire', 3200),
      showLine('venue_staff', 'Venue Staff / On-costs', 4100),
      showLine('venue_marketing', 'Venue Marketing', 250),
      showLine('production_costs', VENUE_PRODUCTION_AV_LABEL, 950),
      runLine('flights', 'Flights', 2100),
      runLine('accommodation', 'Accommodation', 1480),
      runLine('crew_fees_total', 'Crew Fees (all shows)', 2650),
      runLine('lighting_hire', PRODUCTION_BOUGHT_IN_LABEL, 900),
    ],
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
    notes: 'SAMPLE DEMO completed show — Accurate Col3 (~1.5%); settled & remitted. Invented venue.',
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
    advancing: [
      showLine('venue_hire', 'Venue Hire', 2100),
      showLine('venue_staff', 'Venue Staff / On-costs', 2750),
      showLine('venue_marketing', 'Venue Marketing', 180),
      showLine('production_costs', VENUE_PRODUCTION_AV_LABEL, 600),
      runLine('flights', 'Flights', 1620),
      runLine('accommodation', 'Accommodation', 980),
      runLine('crew_fees_total', 'Crew Fees (all shows)', 2650),
      runLine('lighting_hire', PRODUCTION_BOUGHT_IN_LABEL, 900),
    ],
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
    notes: 'SAMPLE DEMO completed show — A little out (tickets −8% vs a 390 expected note); not settled. Invented venue.',
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
    advancing: [
      showLine('venue_hire', 'Venue Hire', 3000, 'SAMPLE expected ~$3,000 — settlement not in yet'),
      showLine('venue_staff', 'Venue Staff / On-costs', 3900),
      showLine('venue_marketing', 'Venue Marketing', 200),
      showLine('production_costs', VENUE_PRODUCTION_AV_LABEL, 700),
      runLine('flights', 'Flights', 1980),
      runLine('accommodation', 'Accommodation', 1320),
      runLine('crew_fees_total', 'Crew Fees (all shows)', 2650),
      runLine('lighting_hire', PRODUCTION_BOUGHT_IN_LABEL, 900),
    ],
    actuals: [],
    remittanceAmount: null,
  },
  {
    code: 'SAMP05',
    name: 'SAMPLE · Clocktower Rooms (Millhaven)',
    notes: 'SAMPLE DEMO completed show — A little out (hire/staff/AV 8–12%); settled, not remitted. Invented venue.',
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
    advancing: [
      showLine('venue_hire', 'Venue Hire', 3600),
      showLine('venue_staff', 'Venue Staff / On-costs', 4800),
      showLine('venue_marketing', 'Venue Marketing', 280),
      showLine('production_costs', VENUE_PRODUCTION_AV_LABEL, 1100),
      runLine('flights', 'Flights', 2480),
      runLine('accommodation', 'Accommodation', 1680),
      runLine('crew_fees_total', 'Crew Fees (all shows)', 2650),
      runLine('lighting_hire', PRODUCTION_BOUGHT_IN_LABEL, 900),
    ],
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
    notes: 'SAMPLE DEMO completed show — A little out (staff +14%, hire −6%); settled & remitted. Invented venue.',
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
    advancing: [
      showLine('venue_hire', 'Venue Hire', 2900),
      showLine('venue_staff', 'Venue Staff / On-costs', 3500),
      showLine('venue_marketing', 'Venue Marketing', 210),
      showLine('production_costs', VENUE_PRODUCTION_AV_LABEL, 740),
      runLine('flights', 'Flights', 3120),
      runLine('accommodation', 'Accommodation', 1540),
      runLine('crew_fees_total', 'Crew Fees (all shows)', 2650),
      runLine('lighting_hire', PRODUCTION_BOUGHT_IN_LABEL, 900),
    ],
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
    notes: 'SAMPLE DEMO completed show — Completely wrong advancing (hire as hotel nights, missing staff, wild tickets, duplicate flights); not settled. Invented venue.',
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
    advancing: [
      showLine('venue_hire', 'Venue Hire', 540, 'SAMPLE WRONG BASIS — $180×3 hotel nights booked as hall hire'),
      showLine('venue_staff', 'Venue Staff / On-costs', 0, 'SAMPLE missing big staff line'),
      showLine('venue_marketing', 'Venue Marketing', 90),
      showLine('production_costs', VENUE_PRODUCTION_AV_LABEL, 0, 'SAMPLE missing AV'),
      runLine('flights', 'Flights', 4200, 'SAMPLE duplicate SYD↔DRW charged twice in entries'),
      runLine('accommodation', 'Accommodation', 1600),
      runLine('crew_fees_total', 'Crew Fees (all shows)', 2650),
      runLine('lighting_hire', PRODUCTION_BOUGHT_IN_LABEL, 900),
    ],
    actuals: [],
    remittanceAmount: null,
  },
  {
    code: 'SAMP08',
    name: 'SAMPLE · Harborlight Room (Newbridge-on-Murray)',
    notes: 'SAMPLE DEMO completed show — Completely wrong Col3 (wild tickets, hire as hotel, missing AV, duplicate ushers); settled & remitted. Invented venue.',
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
    advancing: [
      showLine('venue_hire', 'Venue Hire', 3400),
      showLine('venue_staff', 'Venue Staff / On-costs', 4300),
      showLine('venue_marketing', 'Venue Marketing', 240),
      showLine('production_costs', VENUE_PRODUCTION_AV_LABEL, 980),
      runLine('flights', 'Flights', 1760),
      runLine('accommodation', 'Accommodation', 1400),
      runLine('crew_fees_total', 'Crew Fees (all shows)', 2650),
      runLine('lighting_hire', PRODUCTION_BOUGHT_IN_LABEL, 900),
    ],
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
}> {
  return SETTLEMENTS_SAMPLE_FIXTURES.map(f => ({
    code: f.code,
    accuracy: f.accuracy,
    lifecycle: f.lifecycle,
    venue: `${f.show.venue_name}, ${f.show.venue_city}`,
    show_date: f.show.show_date,
  }))
}

function showLine(field_key: string, label: string, amount: number, notes?: string): SampleCostLine {
  return { field_key, category: 'Venue Costs', label, amount, scope: 'show', notes }
}

function runLine(field_key: string, label: string, amount: number, notes?: string): SampleCostLine {
  const category = field_key === 'crew_fees_total' ? 'Crew & Operations'
    : field_key === 'lighting_hire' ? 'Production'
      : 'Travel & Accommodation'
  return { field_key, category, label, amount, scope: 'run', notes }
}
