'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  FLIGHT_TRAVEL_BAND_LABEL,
  isFlightTravelBand,
  nextAirportCall,
  resolveFlightTravelBand,
  type FlightTravelBand,
} from '@/lib/flight-lookup/airport-call'
import type { FlightSchedule } from '@/lib/flight-lookup/fixtures'
import { mergeFlightLookupIntoBlock } from '@/lib/flight-lookup/merge'
import type { FlightLookupResult } from '@/lib/flight-lookup/provider'
import {
  FLIGHT_KIND_LABEL,
  canExposeHotelPin,
  carHandoutFields,
  emptyCarBlock,
  emptyFerryBlock,
  emptyFlightBlock,
  emptyHotelBlock,
  emptyTransferBlock,
  ferryHandoutFields,
  flightHandoutFields,
  formatTravelPeople,
  hotelHandoutFields,
  isCarBlockComplete,
  isFlightBlockComplete,
  isHotelBlockComplete,
  omitBlankTravelFields,
  resolveTravelPersonName,
  sortFlightBlocks,
  transferHandoutFields,
  type CarBlock,
  type FerryBlock,
  type FlightBlock,
  type FlightKind,
  type HotelBlock,
  type ProfileDirectoryRow,
  type TransferBlock,
  type TravelPerson,
  type WorksheetTravelBlocks,
} from '@/lib/worksheet-travel-blocks'

const inputClass =
  'w-full text-sm bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 disabled:opacity-70'

type ViewMode = 'edit' | 'handout'

export default function WorksheetTravelBlocks({
  blocks,
  workspaceId,
  runId,
  region,
  profiles,
  canEdit,
  role,
  legacyNotes,
  onSave,
  onSaveLegacy,
}: {
  blocks: WorksheetTravelBlocks
  workspaceId: string | null
  runId: string
  region: string
  profiles: ProfileDirectoryRow[]
  canEdit: boolean
  role: string | undefined
  legacyNotes: { flights_notes: string; vehicles_notes: string; hotels_overview_notes: string }
  onSave: (next: WorksheetTravelBlocks) => void
  onSaveLegacy: (fields: Record<string, string>) => void
}) {
  const runTravelBand = resolveFlightTravelBand(region)
  const [view, setView] = useState<ViewMode>('edit')
  const handout = view === 'handout'
  const canSeePin = canExposeHotelPin(role)
  const locked = !canEdit || !workspaceId
  const flights = useMemo(() => sortFlightBlocks(blocks.flights), [blocks.flights])
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  function apply(mutator: (prev: WorksheetTravelBlocks) => WorksheetTravelBlocks) {
    if (locked) return
    const next = mutator(blocksRef.current)
    blocksRef.current = next
    onSave(next)
  }

  function patchFlight(id: string, partial: Partial<FlightBlock>) {
    apply(prev => ({
      ...prev,
      flights: prev.flights.map(row => row.id === id ? { ...row, ...partial } : row),
    }))
  }

  function patchCar(id: string, partial: Partial<CarBlock>) {
    apply(prev => ({
      ...prev,
      cars: prev.cars.map(row => row.id === id ? { ...row, ...partial } : row),
    }))
  }

  function patchHotel(id: string, partial: Partial<HotelBlock>) {
    apply(prev => ({
      ...prev,
      hotels: prev.hotels.map(row => row.id === id ? { ...row, ...partial } : row),
    }))
  }

  function patchTransfer(id: string, partial: Partial<TransferBlock>) {
    apply(prev => ({
      ...prev,
      transfers: prev.transfers.map(row => row.id === id ? { ...row, ...partial } : row),
    }))
  }

  function patchFerry(id: string, partial: Partial<FerryBlock>) {
    apply(prev => ({
      ...prev,
      ferries: prev.ferries.map(row => row.id === id ? { ...row, ...partial } : row),
    }))
  }

  return (
    <section className="space-y-4" data-testid="worksheet-travel-blocks">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80">
            Travel
          </div>
          <p className="text-slate-500 text-xs mt-0.5">
            Structured cards · BOOKED Advancing workspace · scrape later
          </p>
        </div>
        <div className="flex items-center gap-1" data-testid="travel-view-toggle">
          <button
            type="button"
            onClick={() => setView('edit')}
            className={`text-xs px-2 py-1 rounded border ${
              view === 'edit'
                ? 'border-amber-400 text-amber-400 bg-amber-900/20'
                : 'border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
            data-testid="travel-view-edit"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setView('handout')}
            className={`text-xs px-2 py-1 rounded border ${
              view === 'handout'
                ? 'border-amber-400 text-amber-400 bg-amber-900/20'
                : 'border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
            data-testid="travel-view-handout"
          >
            Handout preview
          </button>
        </div>
      </div>

      {!workspaceId && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-amber-200/90 text-xs">
          Travel cards save on the BOOKED Run Advancing workspace. Accept / BOOK the run first.
        </div>
      )}

      <TravelSection
        title="Flights"
        testId="travel-flights"
        addLabel={canEdit && workspaceId && !handout ? (
          <div className="flex gap-1">
            {(['dep', 'mid', 'ret'] as const).map(kind => (
              <button
                key={kind}
                type="button"
                onClick={() => apply(prev => ({ ...prev, flights: [...prev.flights, emptyFlightBlock(kind)] }))}
                className="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-amber-400 hover:border-amber-400"
              >
                + {FLIGHT_KIND_LABEL[kind]}
              </button>
            ))}
          </div>
        ) : null}
      >
        {flights.length === 0 && (
          <p className="text-slate-600 text-xs italic">No flight blocks yet.</p>
        )}
        {flights.map(block => (
          <FlightCard
            key={block.id}
            block={block}
            runId={runId}
            runTravelBand={runTravelBand}
            profiles={profiles}
            handout={handout}
            locked={locked}
            onPatch={partial => patchFlight(block.id, partial)}
            onDelete={() => apply(prev => ({ ...prev, flights: prev.flights.filter(row => row.id !== block.id) }))}
          />
        ))}
      </TravelSection>

      <TravelSection
        title="Cars"
        testId="travel-cars"
        addLabel={canEdit && workspaceId && !handout ? (
          <AddBtn onClick={() => apply(prev => ({ ...prev, cars: [...prev.cars, emptyCarBlock()] }))}>+ Hire</AddBtn>
        ) : null}
      >
        {blocks.cars.length === 0 && <p className="text-slate-600 text-xs italic">No car hire blocks yet.</p>}
        {blocks.cars.map(block => (
          <CarCard
            key={block.id}
            block={block}
            profiles={profiles}
            handout={handout}
            locked={locked}
            onPatch={partial => patchCar(block.id, partial)}
            onDelete={() => apply(prev => ({ ...prev, cars: prev.cars.filter(row => row.id !== block.id) }))}
          />
        ))}
      </TravelSection>

      <TravelSection
        title="Hotels"
        testId="travel-hotels"
        addLabel={canEdit && workspaceId && !handout ? (
          <AddBtn onClick={() => apply(prev => ({ ...prev, hotels: [...prev.hotels, emptyHotelBlock()] }))}>+ Night / city</AddBtn>
        ) : null}
      >
        {blocks.hotels.length === 0 && <p className="text-slate-600 text-xs italic">No hotel night blocks yet.</p>}
        {blocks.hotels.map(block => (
          <HotelCard
            key={block.id}
            block={block}
            profiles={profiles}
            handout={handout}
            locked={locked}
            canSeePin={canSeePin}
            onPatch={partial => patchHotel(block.id, partial)}
            onDelete={() => apply(prev => ({ ...prev, hotels: prev.hotels.filter(row => row.id !== block.id) }))}
          />
        ))}
      </TravelSection>

      <TravelSection
        title="Uber / transfers"
        testId="travel-transfers"
        optional
        addLabel={canEdit && workspaceId && !handout ? (
          <AddBtn onClick={() => apply(prev => ({ ...prev, transfers: [...prev.transfers, emptyTransferBlock()] }))}>+ Transfer</AddBtn>
        ) : null}
      >
        {blocks.transfers.length === 0 && <p className="text-slate-600 text-xs italic">Optional — no transfers yet.</p>}
        {blocks.transfers.map(block => (
          <TransferCard
            key={block.id}
            block={block}
            handout={handout}
            locked={locked}
            onPatch={partial => patchTransfer(block.id, partial)}
            onDelete={() => apply(prev => ({ ...prev, transfers: prev.transfers.filter(row => row.id !== block.id) }))}
          />
        ))}
      </TravelSection>

      <TravelSection
        title="Ferry"
        testId="travel-ferries"
        optional
        addLabel={canEdit && workspaceId && !handout ? (
          <AddBtn onClick={() => apply(prev => ({ ...prev, ferries: [...prev.ferries, emptyFerryBlock()] }))}>+ Ferry</AddBtn>
        ) : null}
      >
        {blocks.ferries.length === 0 && <p className="text-slate-600 text-xs italic">Optional — no ferry blocks yet.</p>}
        {blocks.ferries.map(block => (
          <FerryCard
            key={block.id}
            block={block}
            profiles={profiles}
            handout={handout}
            locked={locked}
            onPatch={partial => patchFerry(block.id, partial)}
            onDelete={() => apply(prev => ({ ...prev, ferries: prev.ferries.filter(row => row.id !== block.id) }))}
          />
        ))}
      </TravelSection>

      <details className="bg-slate-800/20 border border-slate-800 rounded-xl p-4">
        <summary className="text-slate-500 text-xs cursor-pointer hover:text-slate-300">
          Legacy free-text notes (kept readable)
        </summary>
        <div className="mt-3 space-y-1">
          <LegacyNote
            label="Flights / PAX"
            value={legacyNotes.flights_notes}
            canEdit={canEdit}
            onSave={v => onSaveLegacy({ flights_notes: v })}
          />
          <LegacyNote
            label="Cars / vans"
            value={legacyNotes.vehicles_notes}
            canEdit={canEdit}
            onSave={v => onSaveLegacy({ vehicles_notes: v })}
          />
          <LegacyNote
            label="Hotel nights"
            value={legacyNotes.hotels_overview_notes}
            canEdit={canEdit}
            onSave={v => onSaveLegacy({ hotels_overview_notes: v })}
          />
        </div>
      </details>
    </section>
  )
}

function TravelSection({
  title,
  testId,
  optional,
  addLabel,
  children,
}: {
  title: string
  testId: string
  optional?: boolean
  addLabel: ReactNode
  children: ReactNode
}) {
  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5" data-testid={testId}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
          {title}
          {optional ? <span className="ml-2 text-slate-600 font-normal normal-case tracking-normal">optional</span> : null}
        </div>
        {addLabel}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function AddBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-amber-400 hover:border-amber-400"
    >
      {children}
    </button>
  )
}

function IncompleteBadge({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      data-testid="travel-incomplete-badge"
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide bg-amber-900/40 text-amber-300 border-amber-700"
    >
      Incomplete
    </span>
  )
}

function CardShell({
  title,
  incomplete,
  handout,
  locked,
  onDelete,
  testId,
  children,
}: {
  title: string
  incomplete: boolean
  handout: boolean
  locked: boolean
  onDelete: () => void
  testId: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3" data-testid={testId}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-slate-200 text-sm font-semibold">{title}</div>
        <div className="flex items-center gap-2">
          <IncompleteBadge show={!handout && incomplete} />
          {!handout && !locked && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-slate-600 hover:text-red-400"
              title="Delete block"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

function HandoutRows({ fields }: { fields: { label: string; value: string }[] }) {
  if (fields.length === 0) {
    return <p className="text-slate-600 text-xs italic">Nothing filled — omitted from handout.</p>
  }
  return (
    <div className="space-y-0.5" data-testid="travel-handout-fields">
      {fields.map(field => (
        <div key={field.label} className="flex gap-2 text-sm py-0.5">
          <span className="text-slate-500 w-28 flex-shrink-0">{field.label}</span>
          <span className="text-slate-200">{field.value}</span>
        </div>
      ))}
    </div>
  )
}

function Slot({
  label,
  value,
  handout,
  children,
}: {
  label: string
  value: string | number | boolean | null | undefined
  handout: boolean
  children: ReactNode
}) {
  if (handout) return null
  return (
    <label className="block">
      <span className="block text-[11px] text-slate-500 mb-0.5">{label}</span>
      {children}
    </label>
  )
}

function FlightCard({
  block,
  runId,
  runTravelBand,
  profiles,
  handout,
  locked,
  onPatch,
  onDelete,
}: {
  block: FlightBlock
  runId: string
  runTravelBand: FlightTravelBand | null
  profiles: ProfileDirectoryRow[]
  handout: boolean
  locked: boolean
  onPatch: (partial: Partial<FlightBlock>) => void
  onDelete: () => void
}) {
  const [bandOverride, setBandOverride] = useState<FlightTravelBand | ''>('')
  const [airportCallDirty, setAirportCallDirty] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const travelBand = bandOverride || runTravelBand
  const onPatchRef = useRef(onPatch)
  onPatchRef.current = onPatch

  useEffect(() => {
    if (locked) return
    const next = nextAirportCall({
      depTime: block.dep_time,
      band: travelBand,
      current: block.airport_call,
      dirty: airportCallDirty && Boolean(block.airport_call.trim()),
    })
    if (next && next !== block.airport_call) onPatchRef.current({ airport_call: next })
  }, [airportCallDirty, block.airport_call, block.dep_time, locked, travelBand])

  const title = [
    FLIGHT_KIND_LABEL[block.kind],
    block.flight_number || 'Flight',
    block.from && block.to ? `${block.from}→${block.to}` : null,
  ].filter(Boolean).join(' · ')

  if (handout) {
    return (
      <CardShell title={title} incomplete={!isFlightBlockComplete(block)} handout locked onDelete={onDelete} testId="travel-flight-card">
        <HandoutRows fields={omitBlankTravelFields(flightHandoutFields(block, profiles))} />
      </CardShell>
    )
  }

  function patchDep(depTime: string) {
    onPatch({
      dep_time: depTime,
      airport_call: nextAirportCall({
        depTime,
        band: travelBand,
        current: block.airport_call,
        previousDepTime: block.dep_time,
        previousBand: travelBand,
        dirty: airportCallDirty && Boolean(block.airport_call.trim()),
      }),
    })
  }

  function patchBand(nextBand: FlightTravelBand | '') {
    setBandOverride(nextBand)
    const band = nextBand || runTravelBand
    onPatch({
      airport_call: nextAirportCall({
        depTime: block.dep_time,
        band,
        current: block.airport_call,
        previousDepTime: block.dep_time,
        previousBand: travelBand,
        dirty: airportCallDirty && Boolean(block.airport_call.trim()),
      }),
    })
  }

  function patchAirportCall(value: string) {
    setAirportCallDirty(Boolean(value.trim()))
    onPatch({ airport_call: value })
  }

  async function lookup() {
    if (locked) return
    setLookupBusy(true)
    setLookupError(null)
    try {
      const res = await fetch(`/api/runs/${runId}/flight-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight_number: block.flight_number, date: block.date }),
      })
      const data = await res.json() as {
        ok?: boolean
        error?: string | null
        code?: FlightLookupResult['code']
        provider?: 'mock' | 'live' | null
        schedule?: FlightSchedule | null
      }
      if (!res.ok) {
        setLookupError(data.error ?? 'Lookup failed')
        return
      }
      const result: FlightLookupResult = data.ok && data.schedule
        ? { ok: true, provider: data.provider === 'live' ? 'live' : 'mock', schedule: data.schedule, error: null, code: 'ok' }
        : {
            ok: false,
            provider: data.provider ?? null,
            schedule: null,
            error: data.error ?? 'No schedule for that flight # + date — leave fields blank and fill manually.',
            code: data.code === 'not_configured' || data.code === 'invalid' || data.code === 'provider_error'
              ? data.code
              : 'not_found',
          }
      const merged = mergeFlightLookupIntoBlock({
        block,
        result,
        travelBand,
        airportCallDirty,
      })
      if (!merged.filled) {
        setLookupError(merged.error)
        return
      }
      onPatch({
        flight_number: merged.block.flight_number,
        date: merged.block.date,
        airline: merged.block.airline,
        from: merged.block.from,
        to: merged.block.to,
        dep_time: merged.block.dep_time,
        arr_time: merged.block.arr_time,
        dep_terminal: merged.block.dep_terminal,
        arr_terminal: merged.block.arr_terminal,
        airport_call: merged.block.airport_call,
      })
    } catch {
      setLookupError('Lookup failed')
    } finally {
      setLookupBusy(false)
    }
  }

  return (
    <CardShell title={title} incomplete={!isFlightBlockComplete(block)} handout={false} locked={locked} onDelete={onDelete} testId="travel-flight-card">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <Slot label="Leg" value={block.kind} handout={handout}>
          <select
            value={block.kind}
            disabled={locked}
            onChange={e => onPatch({ kind: e.target.value as FlightKind })}
            className={inputClass}
          >
            <option value="dep">Dep</option>
            <option value="mid">Mid</option>
            <option value="ret">Ret</option>
          </select>
        </Slot>
        <TextSlot
          label="Flight #"
          value={block.flight_number}
          locked={locked}
          testId="flight-number"
          onChange={v => onPatch({ flight_number: v })}
        />
        <DateSlot
          label="Date"
          value={block.date}
          locked={locked}
          testId="flight-date"
          onChange={v => onPatch({ date: v })}
        />
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button
            type="button"
            data-testid="flight-lookup-btn"
            disabled={locked || lookupBusy}
            onClick={lookup}
            className="text-xs px-3 py-1.5 rounded bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-50"
          >
            {lookupBusy ? 'Looking up…' : 'Lookup'}
          </button>
          <p className="text-[11px] text-slate-500">
            Flight # + date · mock on staging · e.g. QF441 · 10 Feb 2027 · terminals only if known
          </p>
        </div>
        {lookupError && (
          <p
            data-testid="flight-lookup-error"
            className="sm:col-span-2 lg:col-span-3 text-xs text-amber-300/90"
          >
            {lookupError}
          </p>
        )}
        <TextSlot label="Airline" value={block.airline} locked={locked} testId="flight-airline" onChange={v => onPatch({ airline: v })} />
        <TextSlot label="From (airport)" value={block.from} locked={locked} testId="flight-from" onChange={v => onPatch({ from: v })} />
        <TextSlot label="To (airport)" value={block.to} locked={locked} testId="flight-to" onChange={v => onPatch({ to: v })} />
        <TimeSlot label="Dep" value={block.dep_time} locked={locked} testId="flight-dep-time" onChange={patchDep} />
        <TimeSlot label="Arr" value={block.arr_time} locked={locked} testId="flight-arr-time" onChange={v => onPatch({ arr_time: v })} />
        <TextSlot label="Dep terminal" value={block.dep_terminal} locked={locked} testId="flight-dep-terminal" onChange={v => onPatch({ dep_terminal: v })} />
        <TextSlot label="Arr terminal" value={block.arr_terminal} locked={locked} testId="flight-arr-terminal" onChange={v => onPatch({ arr_terminal: v })} />
        <Slot label="Travel type" value={travelBand} handout={false}>
          <select
            data-testid="flight-travel-band"
            value={travelBand ?? ''}
            disabled={locked}
            onChange={e => {
              const value = e.target.value
              patchBand(isFlightTravelBand(value) ? value : '')
            }}
            className={inputClass}
          >
            {!runTravelBand && <option value="">Select G2 / G3</option>}
            <option value="G2">{FLIGHT_TRAVEL_BAND_LABEL.G2}</option>
            <option value="G3">{FLIGHT_TRAVEL_BAND_LABEL.G3}</option>
          </select>
        </Slot>
        <TimeSlot
          label="Airport call"
          value={block.airport_call}
          locked={locked}
          testId="flight-airport-call"
          onChange={patchAirportCall}
        />
        <TextSlot label="Check-in open" value={block.check_in_open} locked={locked} onChange={v => onPatch({ check_in_open: v })} />
        <TextSlot label="Conf / PNR" value={block.confirmation} locked={locked} onChange={v => onPatch({ confirmation: v })} />
      </div>
      <PeoplePicker
        label="Travellers"
        people={block.travellers}
        profiles={profiles}
        locked={locked}
        onChange={travellers => onPatch({ travellers })}
      />
    </CardShell>
  )
}

function CarCard({
  block, profiles, handout, locked, onPatch, onDelete,
}: {
  block: CarBlock
  profiles: ProfileDirectoryRow[]
  handout: boolean
  locked: boolean
  onPatch: (partial: Partial<CarBlock>) => void
  onDelete: () => void
}) {
  const title = [block.provider || 'Car hire', block.confirmation].filter(Boolean).join(' · ')
  if (handout) {
    return (
      <CardShell title={title} incomplete={!isCarBlockComplete(block)} handout locked onDelete={onDelete} testId="travel-car-card">
        <HandoutRows fields={omitBlankTravelFields(carHandoutFields(block, profiles))} />
      </CardShell>
    )
  }
  return (
    <CardShell title={title} incomplete={!isCarBlockComplete(block)} handout={false} locked={locked} onDelete={onDelete} testId="travel-car-card">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <TextSlot label="Provider" value={block.provider} locked={locked} onChange={v => onPatch({ provider: v })} />
        <TextSlot label="Vehicle class" value={block.vehicle_class} locked={locked} onChange={v => onPatch({ vehicle_class: v })} />
        <TextSlot label="Pickup location" value={block.pickup_location} locked={locked} onChange={v => onPatch({ pickup_location: v })} />
        <DateSlot label="Pickup date" value={block.pickup_date} locked={locked} onChange={v => onPatch({ pickup_date: v })} />
        <TimeSlot label="Pickup time" value={block.pickup_time} locked={locked} onChange={v => onPatch({ pickup_time: v })} />
        <TextSlot label="Return location" value={block.return_location} locked={locked} onChange={v => onPatch({ return_location: v })} />
        <DateSlot label="Return date" value={block.return_date} locked={locked} onChange={v => onPatch({ return_date: v })} />
        <TimeSlot label="Return time" value={block.return_time} locked={locked} onChange={v => onPatch({ return_time: v })} />
        <TextSlot label="Conf #" value={block.confirmation} locked={locked} onChange={v => onPatch({ confirmation: v })} />
        <TextSlot label="Fuel" value={block.fuel} locked={locked} onChange={v => onPatch({ fuel: v })} />
        <TextSlot label="E-tag" value={block.e_tag} locked={locked} onChange={v => onPatch({ e_tag: v })} />
        <Slot label="Unlimited km" value={block.unlimited_km} handout={false}>
          <select
            value={block.unlimited_km == null ? '' : block.unlimited_km ? 'yes' : 'no'}
            disabled={locked}
            onChange={e => onPatch({
              unlimited_km: e.target.value === '' ? null : e.target.value === 'yes',
            })}
            className={inputClass}
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Slot>
        <TextSlot label="After-hours" value={block.after_hours} locked={locked} onChange={v => onPatch({ after_hours: v })} />
        <TextSlot label="Notes" value={block.notes} locked={locked} onChange={v => onPatch({ notes: v })} />
      </div>
      <PeoplePicker
        label="Drivers"
        people={block.drivers}
        profiles={profiles}
        locked={locked}
        onChange={drivers => onPatch({ drivers })}
      />
    </CardShell>
  )
}

function HotelCard({
  block, profiles, handout, locked, canSeePin, onPatch, onDelete,
}: {
  block: HotelBlock
  profiles: ProfileDirectoryRow[]
  handout: boolean
  locked: boolean
  canSeePin: boolean
  onPatch: (partial: Partial<HotelBlock>) => void
  onDelete: () => void
}) {
  const title = [block.name || 'Hotel night', block.check_in_date].filter(Boolean).join(' · ')
  if (handout) {
    return (
      <CardShell title={title} incomplete={!isHotelBlockComplete(block)} handout locked onDelete={onDelete} testId="travel-hotel-card">
        <HandoutRows fields={omitBlankTravelFields(hotelHandoutFields(block, profiles))} />
      </CardShell>
    )
  }
  return (
    <CardShell title={title} incomplete={!isHotelBlockComplete(block)} handout={false} locked={locked} onDelete={onDelete} testId="travel-hotel-card">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <TextSlot label="Name" value={block.name} locked={locked} onChange={v => onPatch({ name: v })} />
        <TextSlot label="Address" value={block.address} locked={locked} onChange={v => onPatch({ address: v })} />
        <TextSlot label="Phone" value={block.phone} locked={locked} onChange={v => onPatch({ phone: v })} />
        <DateSlot label="Check-in date" value={block.check_in_date} locked={locked} onChange={v => onPatch({ check_in_date: v })} />
        <TimeSlot label="Check-in time" value={block.check_in_time} locked={locked} onChange={v => onPatch({ check_in_time: v })} />
        <DateSlot label="Check-out date" value={block.check_out_date} locked={locked} onChange={v => onPatch({ check_out_date: v })} />
        <TimeSlot label="Check-out time" value={block.check_out_time} locked={locked} onChange={v => onPatch({ check_out_time: v })} />
        <Slot label="# rooms" value={block.rooms} handout={false}>
          <input
            type="number"
            min={1}
            max={99}
            value={block.rooms ?? ''}
            disabled={locked}
            onChange={e => onPatch({
              rooms: e.target.value === '' ? null : Number(e.target.value),
            })}
            className={inputClass}
          />
        </Slot>
        <TextSlot label="Room type" value={block.room_type} locked={locked} onChange={v => onPatch({ room_type: v })} />
        <TextSlot label="Conf #" value={block.confirmation} locked={locked} onChange={v => onPatch({ confirmation: v })} />
        {canSeePin ? (
          <TextSlot label="PIN" value={block.pin} locked={locked} onChange={v => onPatch({ pin: v })} />
        ) : (
          <p className="text-[11px] text-slate-600 sm:col-span-1 self-end pb-1">PIN hidden (admin/owner)</p>
        )}
        <TextSlot label="ETA / notes" value={block.eta_notes} locked={locked} onChange={v => onPatch({ eta_notes: v })} />
      </div>
      <label className="flex items-center gap-2 mt-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={block.guests_tbc}
          disabled={locked}
          onChange={e => onPatch({ guests_tbc: e.target.checked })}
        />
        TBC guests
      </label>
      <PeoplePicker
        label="Guests"
        people={block.guests}
        profiles={profiles}
        locked={locked}
        onChange={guests => onPatch({ guests })}
      />
    </CardShell>
  )
}

function TransferCard({
  block, handout, locked, onPatch, onDelete,
}: {
  block: TransferBlock
  handout: boolean
  locked: boolean
  onPatch: (partial: Partial<TransferBlock>) => void
  onDelete: () => void
}) {
  const title = [block.provider || 'Transfer', block.from && block.to ? `${block.from}→${block.to}` : null]
    .filter(Boolean).join(' · ')
  if (handout) {
    return (
      <CardShell title={title} incomplete={false} handout locked onDelete={onDelete} testId="travel-transfer-card">
        <HandoutRows fields={omitBlankTravelFields(transferHandoutFields(block))} />
      </CardShell>
    )
  }
  return (
    <CardShell title={title} incomplete={false} handout={false} locked={locked} onDelete={onDelete} testId="travel-transfer-card">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <DateSlot label="Date" value={block.date} locked={locked} onChange={v => onPatch({ date: v })} />
        <TimeSlot label="Time" value={block.time} locked={locked} onChange={v => onPatch({ time: v })} />
        <TextSlot label="From" value={block.from} locked={locked} onChange={v => onPatch({ from: v })} />
        <TextSlot label="To" value={block.to} locked={locked} onChange={v => onPatch({ to: v })} />
        <TextSlot label="Provider" value={block.provider} locked={locked} onChange={v => onPatch({ provider: v })} />
        <Slot label="Amount" value={block.amount} handout={false}>
          <input
            type="number"
            step="0.01"
            value={block.amount ?? ''}
            disabled={locked}
            onChange={e => onPatch({
              amount: e.target.value === '' ? null : Number(e.target.value),
            })}
            className={inputClass}
          />
        </Slot>
        <TextSlot label="Notes" value={block.notes} locked={locked} onChange={v => onPatch({ notes: v })} />
      </div>
    </CardShell>
  )
}

function FerryCard({
  block, profiles, handout, locked, onPatch, onDelete,
}: {
  block: FerryBlock
  profiles: ProfileDirectoryRow[]
  handout: boolean
  locked: boolean
  onPatch: (partial: Partial<FerryBlock>) => void
  onDelete: () => void
}) {
  const title = [block.operator || 'Ferry', block.dep_port && block.arr_port ? `${block.dep_port}→${block.arr_port}` : null]
    .filter(Boolean).join(' · ')
  if (handout) {
    return (
      <CardShell title={title} incomplete={false} handout locked onDelete={onDelete} testId="travel-ferry-card">
        <HandoutRows fields={omitBlankTravelFields(ferryHandoutFields(block, profiles))} />
      </CardShell>
    )
  }
  return (
    <CardShell title={title} incomplete={false} handout={false} locked={locked} onDelete={onDelete} testId="travel-ferry-card">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <TextSlot label="Operator" value={block.operator} locked={locked} onChange={v => onPatch({ operator: v })} />
        <TextSlot label="Dep port" value={block.dep_port} locked={locked} onChange={v => onPatch({ dep_port: v })} />
        <TextSlot label="Arr port" value={block.arr_port} locked={locked} onChange={v => onPatch({ arr_port: v })} />
        <TimeSlot label="Dep" value={block.dep_time} locked={locked} onChange={v => onPatch({ dep_time: v })} />
        <TimeSlot label="Arr" value={block.arr_time} locked={locked} onChange={v => onPatch({ arr_time: v })} />
        <TextSlot label="Conf #" value={block.confirmation} locked={locked} onChange={v => onPatch({ confirmation: v })} />
      </div>
      <PeoplePicker
        label="Travellers"
        people={block.travellers}
        profiles={profiles}
        locked={locked}
        onChange={travellers => onPatch({ travellers })}
      />
    </CardShell>
  )
}

function TextSlot({
  label, value, locked, onChange, testId,
}: {
  label: string
  value: string
  locked: boolean
  onChange: (next: string) => void
  testId?: string
}) {
  return (
    <Slot label={label} value={value} handout={false}>
      <input
        type="text"
        value={value}
        disabled={locked}
        placeholder=""
        data-testid={testId}
        onChange={e => onChange(e.target.value)}
        className={inputClass}
      />
    </Slot>
  )
}

function DateSlot({
  label, value, locked, onChange, testId,
}: {
  label: string
  value: string
  locked: boolean
  onChange: (next: string) => void
  testId?: string
}) {
  return (
    <Slot label={label} value={value} handout={false}>
      <input
        type="date"
        value={value}
        disabled={locked}
        data-testid={testId}
        onChange={e => onChange(e.target.value)}
        className={inputClass}
      />
    </Slot>
  )
}

function TimeSlot({
  label, value, locked, onChange, testId,
}: {
  label: string
  value: string
  locked: boolean
  onChange: (next: string) => void
  testId?: string
}) {
  return (
    <Slot label={label} value={value} handout={false}>
      <input
        type="time"
        value={value}
        disabled={locked}
        data-testid={testId}
        onChange={e => onChange(e.target.value)}
        className={inputClass}
      />
    </Slot>
  )
}

function PeoplePicker({
  label,
  people,
  profiles,
  locked,
  onChange,
}: {
  label: string
  people: TravelPerson[]
  profiles: ProfileDirectoryRow[]
  locked: boolean
  onChange: (next: TravelPerson[]) => void
}) {
  const [freeText, setFreeText] = useState('')
  const selectedIds = new Set(people.map(p => p.profile_id).filter(Boolean))

  function toggleProfile(row: ProfileDirectoryRow) {
    if (selectedIds.has(row.id)) {
      onChange(people.filter(p => p.profile_id !== row.id))
      return
    }
    onChange([...people, { profile_id: row.id, name: row.full_name }])
  }

  function addFree() {
    const name = freeText.trim()
    if (!name) return
    onChange([...people, { profile_id: null, name }])
    setFreeText('')
  }

  return (
    <div className="mt-3">
      <div className="text-[11px] text-slate-500 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {people.map((person, idx) => (
          <span
            key={`${person.profile_id ?? 'free'}-${idx}`}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-200"
          >
            {resolveTravelPersonName(person, profiles) || person.name || 'Unnamed'}
            {!locked && (
              <button
                type="button"
                onClick={() => onChange(people.filter((_, i) => i !== idx))}
                className="text-slate-500 hover:text-red-400"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {people.length === 0 && (
          <span className="text-xs text-slate-600 italic">None yet — pick a Profile or add a name</span>
        )}
      </div>
      {!locked && (
        <>
          <div className="flex flex-wrap gap-1 mb-2">
            {profiles.map(row => (
              <button
                key={row.id}
                type="button"
                onClick={() => toggleProfile(row)}
                className={`text-xs px-2 py-0.5 rounded border ${
                  selectedIds.has(row.id)
                    ? 'border-amber-400 text-amber-400 bg-amber-900/20'
                    : 'border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {row.nickname || row.full_name}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={freeText}
              placeholder="Unmatched name"
              onChange={e => setFreeText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFree() } }}
              className={inputClass}
            />
            <button
              type="button"
              onClick={addFree}
              className="text-xs px-2 py-1 rounded bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300"
            >
              Add
            </button>
          </div>
        </>
      )}
      {people.length > 0 && (
        <p className="sr-only">{formatTravelPeople(people, profiles)}</p>
      )}
    </div>
  )
}

function LegacyNote({
  label,
  value,
  canEdit,
  onSave,
}: {
  label: string
  value: string
  canEdit: boolean
  onSave: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)
  return (
    <div className="flex gap-2 text-sm py-0.5 items-start">
      <span className="text-slate-500 w-28 flex-shrink-0 pt-1">{label}</span>
      <textarea
        value={dirty ? draft : value}
        disabled={!canEdit}
        rows={2}
        onChange={e => { setDraft(e.target.value); setDirty(true) }}
        onBlur={() => {
          if (!canEdit || !dirty) return
          setDirty(false)
          if (draft !== value) onSave(draft)
        }}
        className={inputClass}
      />
    </div>
  )
}
