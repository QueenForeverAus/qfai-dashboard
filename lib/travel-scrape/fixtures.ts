/**
 * Staging travel-scrape-packet-v1 fixtures.
 * Thornton / Tamworth hotel cards + an R01 / TRECV1-friendly dep flight.
 * Synthetic — real booking emails are not in this repo.
 */

import type { TravelScrapePacket } from './packet.ts'

export const THORNTON_SCRAPE_FIXTURE_ID = 'thornton-executive-scrape' as const
export const TAMWORTH_SCRAPE_FIXTURE_ID = 'tamworth-hotel-scrape' as const
export const R01_DEP_FLIGHT_FIXTURE_ID = 'r01-dep-flight' as const
export const TRECV1_CAR_FIXTURE_ID = 'trecv1-avis-car' as const

export type TravelScrapeFixtureId =
  | typeof THORNTON_SCRAPE_FIXTURE_ID
  | typeof TAMWORTH_SCRAPE_FIXTURE_ID
  | typeof R01_DEP_FLIGHT_FIXTURE_ID
  | typeof TRECV1_CAR_FIXTURE_ID

export const THORNTON_SCRAPE_PACKET: TravelScrapePacket = {
  schema_version: 'travel-scrape-packet-v1',
  category: 'hotel',
  confidence: 'high',
  details_action: 'auto',
  money_action: 'confirm',
  captured_at: '2026-09-17T10:04:00+10:00',
  email: {
    thread_id: 'th-te-91718',
    message_id: 'msg-te-91718',
    date: '2026-09-17T09:12:00+10:00',
    subject: 'Booking confirmation — Thornton Executive',
    from: 'reservations@thorntonexecutive.com.au',
    vendor_domain: 'thorntonexecutive.com.au',
  },
  run_match: {
    run_id: null,
    show_ids: [],
    match_score: null,
    match_notes: 'Thornton / Maitland → Newcastle catchment (one night / city).',
    ambiguous_candidates: [],
  },
  money: {
    amount: 214,
    currency: 'AUD',
    gst: 'inc',
    status_if_applied: 'PAID',
    advancing_line_hint: 'accom_night',
  },
  worksheet: {
    name: 'Thornton Executive',
    address: '1 Weakleys Dr, Thornton NSW 2322',
    phone: '',
    check_in_date: '2026-09-17',
    check_in_time: '14:00',
    check_out_date: '2026-09-18',
    check_out_time: '10:00',
    rooms: 1,
    room_type: 'Executive',
    confirmation: 'TE-91718',
    pin: '',
    guests_tbc: false,
    eta_notes: 'Day-before first show. Newcastle catchment.',
    city: 'Thornton',
  },
  travellers: [
    { raw_name: 'Gareth Hill', profile_user_id: null, match: 'unknown' },
    { raw_name: 'Michael', profile_user_id: null, match: 'unknown' },
  ],
  checklist: {
    items_to_tick: ['hotel_confirmed'],
    source_note: 'from Thornton Executive email 17/09/26 · conf TE-91718',
    partial_names: false,
  },
  supersedes: { prior_conf_id: null, prior_message_id: null },
  flags: [],
  apply_env: 'staging',
}

export const TAMWORTH_SCRAPE_PACKET: TravelScrapePacket = {
  schema_version: 'travel-scrape-packet-v1',
  category: 'hotel',
  confidence: 'high',
  details_action: 'auto',
  money_action: 'confirm',
  captured_at: '2026-09-18T11:20:00+10:00',
  email: {
    thread_id: 'th-th-1819',
    message_id: 'msg-th-1819',
    date: '2026-09-18T08:40:00+10:00',
    subject: 'Your booking at Tamworth Hotel',
    from: 'stay@tamworthhotel.com.au',
    vendor_domain: 'tamworthhotel.com.au',
  },
  run_match: {
    run_id: null,
    show_ids: [],
    match_score: null,
    match_notes: 'Tamworth show night — one night / city.',
    ambiguous_candidates: [],
  },
  money: {
    amount: 189,
    currency: 'AUD',
    gst: 'inc',
    status_if_applied: 'PAID',
    advancing_line_hint: 'accom_night',
  },
  worksheet: {
    name: 'Tamworth Hotel',
    address: '152 Ebsworth St, Tamworth NSW 2340',
    phone: '',
    check_in_date: '2026-09-18',
    check_in_time: '14:00',
    check_out_date: '2026-09-19',
    check_out_time: '10:00',
    rooms: 1,
    room_type: 'Queen',
    confirmation: 'TH-1819',
    pin: '',
    guests_tbc: false,
    eta_notes: '',
    city: 'Tamworth',
  },
  travellers: [
    { raw_name: 'Gareth Hill', profile_user_id: null, match: 'unknown' },
  ],
  checklist: {
    items_to_tick: ['hotel_confirmed'],
    source_note: 'from Tamworth Hotel email 18/09/26 · conf TH-1819',
    partial_names: false,
  },
  supersedes: { prior_conf_id: null, prior_message_id: null },
  flags: [],
  apply_env: 'staging',
}

/** R01 / TRECV1-friendly dep leg (Broken Hill outbound pattern from W1 cards). */
export const R01_DEP_FLIGHT_PACKET: TravelScrapePacket = {
  schema_version: 'travel-scrape-packet-v1',
  category: 'flight',
  confidence: 'high',
  details_action: 'auto',
  money_action: 'confirm',
  captured_at: '2027-01-12T16:05:00+11:00',
  email: {
    thread_id: 'qf-r01-dep',
    message_id: 'msg-qf441-r01',
    date: '2027-01-12T15:48:00+11:00',
    subject: 'Qantas itinerary — QF441 SYD to BHQ',
    from: 'noreply@qantas.com',
    vendor_domain: 'qantas.com',
  },
  run_match: {
    run_id: null,
    show_ids: [],
    match_score: null,
    match_notes: 'Dep leg for R01 / TRECV1-style BOOKED advancing workspace.',
    ambiguous_candidates: [],
  },
  money: {
    amount: 428,
    currency: 'AUD',
    gst: 'inc',
    status_if_applied: 'PAID',
    advancing_line_hint: 'flights',
  },
  worksheet: {
    kind: 'dep',
    flight_number: 'QF441',
    date: '2027-02-10',
    airline: 'Qantas',
    from: 'SYD',
    to: 'BHQ',
    dep_time: '06:30',
    arr_time: '08:15',
    dep_terminal: 'T3',
    arr_terminal: '',
    airport_call: '',
    check_in_open: '04:30',
    confirmation: 'QFR01DEP',
  },
  travellers: [
    { raw_name: 'Gareth Hill', profile_user_id: null, match: 'unknown' },
    { raw_name: 'Dave the driver', profile_user_id: null, match: 'free_text' },
  ],
  checklist: {
    items_to_tick: ['flights_complete'],
    source_note: 'from Qantas email 12/01/27 · conf QFR01DEP',
    partial_names: true,
  },
  supersedes: { prior_conf_id: null, prior_message_id: null },
  flags: [],
  apply_env: 'staging',
}

export const TRECV1_CAR_PACKET: TravelScrapePacket = {
  schema_version: 'travel-scrape-packet-v1',
  category: 'car',
  confidence: 'high',
  details_action: 'auto',
  money_action: 'confirm',
  captured_at: '2027-01-20T09:00:00+11:00',
  email: {
    thread_id: 'avis-trecv1',
    message_id: 'msg-avis-99',
    date: '2027-01-20T08:12:00+11:00',
    subject: 'Avis reservation AVI-99',
    from: 'confirm@avis.com.au',
    vendor_domain: 'avis.com.au',
  },
  run_match: {
    run_id: null,
    show_ids: [],
    match_score: null,
    match_notes: 'Open-jaw car for TRECV1 / R01-style fly + drive.',
    ambiguous_candidates: [],
  },
  money: {
    amount: 640,
    currency: 'AUD',
    gst: 'inc',
    status_if_applied: 'PAID',
    advancing_line_hint: 'car_hire',
  },
  worksheet: {
    provider: 'Avis',
    vehicle_class: 'Full size',
    pickup_location: 'Broken Hill airport',
    pickup_date: '2027-02-10',
    pickup_time: '08:30',
    return_location: 'Adelaide airport',
    return_date: '2027-02-13',
    return_time: '16:00',
    confirmation: 'AVI-99',
    fuel: 'full-full',
    e_tag: 'included',
    unlimited_km: true,
    after_hours: '',
    notes: '',
  },
  travellers: [
    { raw_name: 'Gareth Hill', profile_user_id: null, match: 'unknown' },
  ],
  checklist: {
    items_to_tick: ['car_hire_van'],
    source_note: 'from Avis email 20/01/27 · conf AVI-99',
    partial_names: false,
  },
  supersedes: { prior_conf_id: null, prior_message_id: null },
  flags: [],
  apply_env: 'staging',
}

export type TravelScrapeFixture = {
  id: TravelScrapeFixtureId
  label: string
  packet: TravelScrapePacket
}

export const TRAVEL_SCRAPE_FIXTURES: TravelScrapeFixture[] = [
  {
    id: THORNTON_SCRAPE_FIXTURE_ID,
    label: 'Thornton Executive hotel (one night / city)',
    packet: THORNTON_SCRAPE_PACKET,
  },
  {
    id: TAMWORTH_SCRAPE_FIXTURE_ID,
    label: 'Tamworth Hotel (one night / city)',
    packet: TAMWORTH_SCRAPE_PACKET,
  },
  {
    id: R01_DEP_FLIGHT_FIXTURE_ID,
    label: 'R01 / TRECV1 dep flight QF441 SYD→BHQ',
    packet: R01_DEP_FLIGHT_PACKET,
  },
  {
    id: TRECV1_CAR_FIXTURE_ID,
    label: 'TRECV1 / R01 Avis car hire',
    packet: TRECV1_CAR_PACKET,
  },
]

export function travelScrapeFixtureById(id: string): TravelScrapeFixture | null {
  return TRAVEL_SCRAPE_FIXTURES.find(row => row.id === id) ?? null
}
