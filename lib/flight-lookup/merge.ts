/**
 * Merge a schedule lookup into a W1 FlightBlock.
 * On miss: leave fields as they are (blank stays blank) — never invent.
 */

import type { FlightBlock } from '../worksheet-travel-blocks.ts'
import {
  nextAirportCall,
  type FlightTravelBand,
} from './airport-call.ts'
import type { FlightLookupResult } from './provider.ts'
import type { FlightSchedule } from './fixtures.ts'

const LOOKUP_KEYS = [
  'airline',
  'from',
  'to',
  'dep_time',
  'arr_time',
  'dep_terminal',
  'arr_terminal',
] as const

export type FlightLookupMerge = {
  block: FlightBlock
  filled: boolean
  error: string | null
}

function applySchedule(block: FlightBlock, schedule: FlightSchedule): FlightBlock {
  return {
    ...block,
    flight_number: schedule.flight_number || block.flight_number,
    date: schedule.date || block.date,
    airline: schedule.airline,
    from: schedule.from,
    to: schedule.to,
    dep_time: schedule.dep_time,
    arr_time: schedule.arr_time,
    // Only write a terminal when the provider actually knew it.
    dep_terminal: schedule.dep_terminal,
    arr_terminal: schedule.arr_terminal,
  }
}

export function mergeFlightLookupIntoBlock(opts: {
  block: FlightBlock
  result: FlightLookupResult
  travelBand: FlightTravelBand | null
  airportCallDirty?: boolean
}): FlightLookupMerge {
  if (!opts.result.ok) {
    return { block: opts.block, filled: false, error: opts.result.error }
  }

  const previousDep = opts.block.dep_time
  const next = applySchedule(opts.block, opts.result.schedule)
  next.airport_call = nextAirportCall({
    depTime: next.dep_time,
    band: opts.travelBand,
    current: opts.block.airport_call,
    previousDepTime: previousDep,
    previousBand: opts.travelBand,
    dirty: opts.airportCallDirty === true && Boolean(opts.block.airport_call.trim()),
  })

  return { block: next, filled: true, error: null }
}

export function lookupFilledKeys(before: FlightBlock, after: FlightBlock): string[] {
  return LOOKUP_KEYS.filter(key => before[key] !== after[key])
}
