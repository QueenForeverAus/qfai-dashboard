/**
 * Staging settlement-scrape-packet-v1 fixtures.
 * BNZ-shaped and Harbour-shaped attachment lines — ingest only, never a UI loader.
 */

import { BNZ_NETTED_DEPOSIT_LINES } from '../settlements-v3-bnz.ts'
import { HARBOUR_FIXTURE_BY_VENUE } from '../settlements-sheet-actuals.ts'
import { SETTLEMENT_SCRAPE_SCHEMA_VERSION, type SettlementScrapePacket } from './packet.ts'

export const NORTHWHARF_SETTLEMENT_SCRAPE_ID = 'samp04-northwharf-settlement' as const
export const BNZ_SETTLEMENT_SCRAPE_ID = 'bnz-shaped-settlement' as const
export const HARBOUR_SETTLEMENT_SCRAPE_ID = 'harbour-geelong-settlement' as const
export const LAYCOCK_TICKETS_SETTLEMENT_SCRAPE_ID = 'laycock-tickets-settlement' as const
export const NORTHWHARF_REMITTANCE_SCRAPE_ID = 'samp04-northwharf-remittance' as const

function email(partial: { subject: string; from: string; message_id: string }): SettlementScrapePacket['email'] {
  return {
    thread_id: `thread-${partial.message_id}`,
    message_id: partial.message_id,
    date: '2026-04-10T09:00:00.000Z',
    subject: partial.subject,
    from: partial.from,
  }
}

export const BNZ_SETTLEMENT_SCRAPE_PACKET: SettlementScrapePacket = {
  schema_version: SETTLEMENT_SCRAPE_SCHEMA_VERSION,
  kind: 'settlement',
  confidence: 'high',
  money_action: 'none',
  captured_at: '2026-09-10T00:00:00.000Z',
  apply_env: 'staging',
  email: email({
    subject: 'Settlement statement — BNZ-shaped venue',
    from: 'accounts@harbour.example',
    message_id: 'bnz-settlement-1',
  }),
  run_match: { run_id: null, show_ids: [], match_notes: 'BNZ-shaped classifier fixture' },
  attachments: [{
    filename: 'venue-settlement.txt',
    mime: 'text/plain',
    extracted_text: BNZ_NETTED_DEPOSIT_LINES
      .map(l => `${l.description}\t${l.amount}`)
      .join('\n'),
    lines: BNZ_NETTED_DEPOSIT_LINES.map(l => ({
      description: l.description,
      amount: l.amount,
    })),
  }],
}

const geelong = HARBOUR_FIXTURE_BY_VENUE['Geelong Performing Arts Centre'] ?? []

export const HARBOUR_SETTLEMENT_SCRAPE_PACKET: SettlementScrapePacket = {
  schema_version: SETTLEMENT_SCRAPE_SCHEMA_VERSION,
  kind: 'settlement',
  confidence: 'high',
  money_action: 'none',
  captured_at: '2026-09-10T00:00:00.000Z',
  apply_env: 'staging',
  email: email({
    subject: 'Harbour settlement — Geelong PAC',
    from: 'settlements@harbour.example',
    message_id: 'harbour-geelong-1',
  }),
  run_match: { run_id: null, show_ids: [], match_notes: 'Former Harbour fixture, now email-scrape only' },
  attachments: [{
    filename: 'harbour-settlement.csv',
    mime: 'text/csv',
    extracted_text: geelong.map(l => `${l.notes || l.line_key},${l.amount}`).join('\n'),
    lines: geelong.map(l => ({
      description: l.notes || l.line_key,
      amount: l.amount,
      line_key: l.line_key,
    })),
  }],
}

export const NORTHWHARF_SETTLEMENT_SCRAPE_PACKET: SettlementScrapePacket = {
  schema_version: SETTLEMENT_SCRAPE_SCHEMA_VERSION,
  kind: 'settlement',
  confidence: 'high',
  money_action: 'none',
  captured_at: '2026-09-10T00:00:00.000Z',
  apply_env: 'staging',
  email: email({
    subject: 'Northwharf Studio Theatre — settlement statement',
    from: 'accounts@northwharf.example',
    message_id: 'northwharf-settlement-1',
  }),
  run_match: { run_id: null, show_ids: [], match_notes: 'SAMP04 smoke — settlement email' },
  attachments: [{
    filename: 'northwharf-settlement.txt',
    mime: 'text/plain',
    extracted_text: [
      'Gross Ticket Sales\t28400',
      'Booking Fees\t1600',
      'Credit Card Fees\t420',
      'Venue Hire\t2650',
      'Ushers\t1800',
      'Venue Production/AV\t750',
      'Due to Hirer\t21180',
    ].join('\n'),
  }],
}

/** Laycock-like sheet: attendance count + box-office gross both present. */
export const LAYCOCK_TICKETS_SETTLEMENT_SCRAPE_PACKET: SettlementScrapePacket = {
  schema_version: SETTLEMENT_SCRAPE_SCHEMA_VERSION,
  kind: 'settlement',
  confidence: 'high',
  money_action: 'none',
  captured_at: '2026-09-10T00:00:00.000Z',
  apply_env: 'staging',
  email: email({
    subject: 'Laycock St Theatre — settlement statement',
    from: 'accounts@laycock.example',
    message_id: 'laycock-tickets-1',
  }),
  run_match: { run_id: null, show_ids: [], match_notes: 'SOP: ticket count + gross from settlement sheet' },
  attachments: [{
    filename: 'laycock-settlement.txt',
    mime: 'text/plain',
    extracted_text: [
      'Tickets sold\t318',
      'Gross Ticket Sales\t22275.90',
      'Booking Fees\t890',
      'Credit Card Fees\t312',
      'Venue Hire\t1900',
    ].join('\n'),
    lines: [
      { description: 'Tickets sold', amount: 318, line_key: 'tickets_sold' },
      { description: 'Gross Ticket Sales', amount: 22_275.90, line_key: 'gross_ticket_sales' },
      { description: 'Booking Fees', amount: 890 },
      { description: 'Credit Card Fees', amount: 312 },
      { description: 'Venue Hire', amount: 1900 },
    ],
  }],
}

export const NORTHWHARF_REMITTANCE_SCRAPE_PACKET: SettlementScrapePacket = {
  schema_version: SETTLEMENT_SCRAPE_SCHEMA_VERSION,
  kind: 'remittance',
  confidence: 'high',
  money_action: 'none',
  captured_at: '2026-09-10T00:00:00.000Z',
  apply_env: 'staging',
  email: email({
    subject: 'Northwharf remittance / payment advice',
    from: 'remittance@harbour.example',
    message_id: 'northwharf-remittance-1',
  }),
  run_match: { run_id: null, show_ids: [], match_notes: 'SAMP04 smoke — remittance email' },
  attachments: [{
    filename: 'northwharf-remittance.txt',
    mime: 'text/plain',
    extracted_text: [
      'Remittance payment\t19000',
      'APRA withheld\t80',
    ].join('\n'),
    lines: [
      { description: 'Remittance payment', amount: 19_000, line_type: 'payment' },
      { description: 'APRA withheld', amount: 80, line_type: 'deduction' },
    ],
  }],
}

export const SETTLEMENT_SCRAPE_FIXTURES = [
  { id: BNZ_SETTLEMENT_SCRAPE_ID, packet: BNZ_SETTLEMENT_SCRAPE_PACKET },
  { id: HARBOUR_SETTLEMENT_SCRAPE_ID, packet: HARBOUR_SETTLEMENT_SCRAPE_PACKET },
  { id: NORTHWHARF_SETTLEMENT_SCRAPE_ID, packet: NORTHWHARF_SETTLEMENT_SCRAPE_PACKET },
  { id: LAYCOCK_TICKETS_SETTLEMENT_SCRAPE_ID, packet: LAYCOCK_TICKETS_SETTLEMENT_SCRAPE_PACKET },
  { id: NORTHWHARF_REMITTANCE_SCRAPE_ID, packet: NORTHWHARF_REMITTANCE_SCRAPE_PACKET },
] as const

export function settlementScrapeFixtureById(id: string) {
  return SETTLEMENT_SCRAPE_FIXTURES.find(f => f.id === id) ?? null
}
