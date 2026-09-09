/**
 * Known QF441-style schedule fixtures for staging smoke.
 * Terminals only when the corpus actually has them — never invent.
 *
 * Canonical dep matches W1/W3 R01 / TRECV1: QF441 SYD→BHQ 10 Feb 2027.
 */

export type FlightSchedule = {
  flight_number: string
  date: string
  airline: string
  from: string
  to: string
  dep_time: string
  arr_time: string
  /** Blank when unknown — Lookup must not invent. */
  dep_terminal: string
  arr_terminal: string
}

export const QF441_R01_DEP: FlightSchedule = {
  flight_number: 'QF441',
  date: '2027-02-10',
  airline: 'Qantas',
  from: 'SYD',
  to: 'BHQ',
  dep_time: '06:30',
  arr_time: '08:15',
  dep_terminal: 'T3',
  arr_terminal: '',
}

export const QF442_R01_RET: FlightSchedule = {
  flight_number: 'QF442',
  date: '2027-02-13',
  airline: 'Qantas',
  from: 'BHQ',
  to: 'SYD',
  dep_time: '16:00',
  arr_time: '17:45',
  dep_terminal: '',
  arr_terminal: '',
}

export const QF11_MID: FlightSchedule = {
  flight_number: 'QF11',
  date: '2027-02-11',
  airline: 'Qantas',
  from: 'BHQ',
  to: 'ADL',
  dep_time: '09:40',
  arr_time: '11:05',
  dep_terminal: '',
  arr_terminal: 'T1',
}

export const FLIGHT_LOOKUP_FIXTURES: FlightSchedule[] = [
  QF441_R01_DEP,
  QF442_R01_RET,
  QF11_MID,
]

export function normalizeFlightNumber(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizeFlightDate(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

export function findFlightLookupFixture(
  flightNumber: string,
  date: string,
): FlightSchedule | null {
  const number = normalizeFlightNumber(flightNumber)
  const day = normalizeFlightDate(date)
  if (!number || !day) return null
  return FLIGHT_LOOKUP_FIXTURES.find(row =>
    normalizeFlightNumber(row.flight_number) === number && row.date === day,
  ) ?? null
}
