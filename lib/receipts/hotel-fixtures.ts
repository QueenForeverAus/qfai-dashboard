/**
 * Teach-corpus hotel receipt packets (AUD) for staging smoke.
 * Synthetic structured JSON — real booking emails are not in this repo.
 */

import type { HotelReceiptPacket } from './packet.ts'

export const THORNTON_EXECUTIVE_FIXTURE_ID = 'thornton-executive' as const
export const TAMWORTH_HOTEL_FIXTURE_ID = 'tamworth-hotel' as const
export const PORT_OCALL_FIXTURE_ID = 'port-ocall' as const

export type HotelReceiptFixtureId =
  | typeof THORNTON_EXECUTIVE_FIXTURE_ID
  | typeof TAMWORTH_HOTEL_FIXTURE_ID
  | typeof PORT_OCALL_FIXTURE_ID

export const THORNTON_EXECUTIVE_PACKET: HotelReceiptPacket = {
  version: 1,
  kind: 'hotel',
  vendor: 'Thornton Executive',
  confirmation_id: 'TE-91718',
  currency: 'AUD',
  total_paid: 214,
  paid: true,
  charge_kind: 'charge',
  check_in: '2026-09-17',
  check_out: '2026-09-18',
  locality: 'Thornton',
  city: 'Maitland',
  address: '1 Weakleys Dr, Thornton NSW 2322',
  guest_names: ['Gareth Quinn', 'Michael Richardson'],
  notes: 'Day-before first show. Newcastle catchment (city ≠ show city).',
}

export const TAMWORTH_HOTEL_PACKET: HotelReceiptPacket = {
  version: 1,
  kind: 'hotel',
  vendor: 'Tamworth Hotel',
  confirmation_id: 'TH-1819',
  currency: 'AUD',
  total_paid: 189,
  paid: true,
  charge_kind: 'charge',
  check_in: '2026-09-18',
  check_out: '2026-09-19',
  locality: 'Tamworth',
  city: 'Tamworth',
  address: '152 Ebsworth St, Tamworth NSW 2340',
  guest_names: ['Gareth Quinn'],
}

export const PORT_OCALL_PACKET: HotelReceiptPacket = {
  version: 1,
  kind: 'hotel',
  vendor: "Port O'Call",
  confirmation_id: 'POC-1920',
  currency: 'AUD',
  total_paid: 245,
  paid: true,
  charge_kind: 'charge',
  check_in: '2026-09-19',
  check_out: '2026-09-20',
  locality: 'Port Macquarie',
  city: 'Port Macquarie',
  address: '1 Park St, Port Macquarie NSW 2444',
  guest_names: ['Gareth Quinn', 'Adam Dahl'],
}

export type HotelReceiptFixture = {
  id: HotelReceiptFixtureId
  label: string
  packet: HotelReceiptPacket
}

export const HOTEL_RECEIPT_FIXTURES: HotelReceiptFixture[] = [
  {
    id: THORNTON_EXECUTIVE_FIXTURE_ID,
    label: 'Thornton Executive (Maitland) 17–18 Sep',
    packet: THORNTON_EXECUTIVE_PACKET,
  },
  {
    id: TAMWORTH_HOTEL_FIXTURE_ID,
    label: 'Tamworth Hotel 18–19 Sep',
    packet: TAMWORTH_HOTEL_PACKET,
  },
  {
    id: PORT_OCALL_FIXTURE_ID,
    label: "Port O'Call (Port Macquarie) 19–20 Sep",
    packet: PORT_OCALL_PACKET,
  },
]

export function hotelReceiptFixtureById(id: string): HotelReceiptFixture | null {
  return HOTEL_RECEIPT_FIXTURES.find(row => row.id === id) ?? null
}
