'use client'

import { useState } from 'react'
import { formatDateShortAU } from '@/lib/dates'
import { TICKETS_LOCKED_NOTE } from '@/lib/settlements-advancing-sync'
import BandedSellSlider from '@/components/BandedSellSlider'
import {
  normalizeCapacityBands,
  topBandSeats,
} from '@/lib/capacity-bands'
import {
  HARBOUR_COMMISSION_RATE,
  RESERVE_EX_GST_LABEL,
  computeVenueWaterfall,
  gstQuarantineLineLabel,
  knownInsideForShow,
  remittanceHasCcSplit,
  resolveInsideCosts,
  type InsideFactorValues,
  type KnownInsideLine,
  type PnlSummary,
  type PnlVenueWaterfall,
} from '@/lib/pnl-run-costing'

export type AdvancingTicketLock = {
  locked: boolean
  tickets: number
  sourceNote: string | null
}

export type PnlShow = {
  id: string
  venue_name: string
  venue_city: string
  state_territory: string | null
  show_date: string | null
  capacity: number | null
  capacity_bands?: unknown | null
  ticket_price: number | null
  booking_fee_per_payer?: number | null
  cc_fee_pct?: number | null
}

type Show = PnlShow

function fmt(n: number | null) {
  if (n === null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function modelCapacity(show: Show): number | null {
  const bands = normalizeCapacityBands(show.capacity_bands)
  return topBandSeats(bands, show.capacity)
}

export function projectedBoxOffice(show: Show, pct: number): number | null {
  const cap = modelCapacity(show)
  if (!cap || !show.ticket_price) return null
  return Math.round(cap * (pct / 100) * show.ticket_price)
}

export function modelledTickets(show: Show, pct: number): number | null {
  const cap = modelCapacity(show)
  if (!cap) return null
  return Math.round(cap * pct / 100)
}

export function venuePnl(opts: {
  show: Show
  pct: number
  factors: InsideFactorValues
  remittanceLines: KnownInsideLine[]
  actualTickets?: number | null
}): { gbo: number; tickets: number; waterfall: PnlVenueWaterfall; insideLabel: string } {
  const tickets = opts.actualTickets != null
    ? Math.max(0, Math.round(Number(opts.actualTickets) || 0))
    : (modelledTickets(opts.show, opts.pct) ?? 0)
  const gbo = opts.actualTickets != null
    ? Math.round(tickets * (Number(opts.show.ticket_price) || 0))
    : (projectedBoxOffice(opts.show, opts.pct) ?? 0)
  const known = knownInsideForShow(opts.remittanceLines, opts.show.id)
  const inside = resolveInsideCosts({
    grossTicketSales: gbo,
    payerCount: tickets,
    factors: opts.factors,
    venueOverride: {
      bookingFeePerPayer: opts.show.booking_fee_per_payer,
      ccFeePct: opts.show.cc_fee_pct,
    },
    remittanceKnownTotal: known,
    hasCcSplitHistory: remittanceHasCcSplit(opts.remittanceLines, opts.show.id),
  })
  const waterfall = computeVenueWaterfall({ grossTicketSales: gbo, insideTotal: inside.total })
  waterfall.inside = inside
  return { gbo, tickets, waterfall, insideLabel: inside.sourceLabel }
}

export function PnlRevenueBlock({
  shows,
  sellThrough,
  slidersUnlocked,
  incompleteFields,
  hasGuessFields,
  factors,
  remittanceLines,
  onSellThrough,
  onShowUpdated,
  chromeReadOnly = false,
  onChromeSave,
  ticketLocks,
}: {
  shows: Show[]
  sellThrough: Record<string, number>
  slidersUnlocked: boolean
  incompleteFields: string[]
  hasGuessFields: boolean
  factors: InsideFactorValues
  remittanceLines: KnownInsideLine[]
  onSellThrough: (showId: string, pct: number) => void
  onShowUpdated: (updated: PnlShow) => void
  chromeReadOnly?: boolean
  onChromeSave?: (show: PnlShow, patch: { booking_fee_per_payer?: number | null; cc_fee_pct?: number | null }) => Promise<PnlShow>
  ticketLocks?: Record<string, AdvancingTicketLock>
}) {
  const perVenue = shows.map(show => {
    const lock = ticketLocks?.[show.id]
    const pct = sellThrough[show.id] ?? 75
    return {
      show,
      pct,
      lock,
      ...venuePnl({
        show,
        pct,
        factors,
        remittanceLines,
        actualTickets: lock?.locked ? lock.tickets : null,
      }),
    }
  })
  const totalGross = perVenue.reduce((s, v) => s + v.waterfall.grossTicketSales, 0)
  const totalInside = perVenue.reduce((s, v) => s + v.waterfall.inside.total, 0)
  const totals = computeVenueWaterfall({ grossTicketSales: totalGross, insideTotal: totalInside })

  return (
    <div className="space-y-4" data-testid="pnl-owner-revenue">
      {!slidersUnlocked && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-400 text-base shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-red-300 font-semibold text-sm">Sliders locked — cost lines still Figures Needed</p>
              <p className="text-red-400/80 text-xs mt-1 mb-2">Set these to Estimate, Guess, Confirmed, or PAID to unlock sell-through sliders. Gross Box Office / revenue FIGURES NEEDED is ignored — sliders supply revenue.</p>
              <ul className="space-y-0.5">
                {incompleteFields.map(f => (
                  <li key={f} className="text-red-400/70 text-xs flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {slidersUnlocked && hasGuessFields && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3 flex items-start gap-2">
          <span className="text-amber-500 text-sm shrink-0 mt-0.5">~</span>
          <p className="text-amber-400/80 text-xs">Some figures are estimates or unconfirmed — treat this P&L as indicative only.</p>
        </div>
      )}

      <div>
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Revenue — per venue</h3>
        <div className="space-y-3">
          {perVenue.map(({ show, pct, tickets, waterfall, lock }) => {
            const cap = modelCapacity(show)
            const bands = normalizeCapacityBands(show.capacity_bands)
            const ticketsLocked = Boolean(lock?.locked)
            return (
              <div key={show.id} className="bg-slate-800 rounded-xl border border-slate-700 p-3 sm:p-4" data-testid={`pnl-venue-${show.id}`}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-sm font-semibold truncate">{show.venue_name}</div>
                    <div className="text-slate-500 text-xs mt-0.5 truncate">
                      {show.venue_city}{show.state_territory ? `, ${show.state_territory}` : ''} · {formatDateShortAU(show.show_date)}
                      {cap ? ` · Cap ${cap.toLocaleString()}` : ''}
                      {bands.length > 1 ? ` · ${bands.length} bands` : ''}
                      {show.ticket_price != null ? ` · $${Number(show.ticket_price).toFixed(2)} nett/ticket` : ' · Ticket price —'}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-amber-400 font-bold">{ticketsLocked ? 'ACTUAL' : `${pct}%`}</div>
                    <div className="text-slate-500 text-xs">{tickets != null ? `${tickets.toLocaleString()} tix` : '—'}</div>
                  </div>
                </div>
                <BandedSellSlider
                  value={pct}
                  onChange={v => onSellThrough(show.id, v)}
                  capacity={cap}
                  capacityBands={show.capacity_bands}
                  disabled={!slidersUnlocked || ticketsLocked}
                  className="mb-3"
                />
                {ticketsLocked && (
                  <p className="text-teal-300/90 text-xs mb-2" data-testid={`advancing-tickets-locked-${show.id}`}>
                    {TICKETS_LOCKED_NOTE}
                    {lock?.sourceNote ? ` Source: ${lock.sourceNote}` : ''}
                  </p>
                )}
                {!slidersUnlocked && !ticketsLocked && (
                  <p className="text-slate-600 text-xs mb-2">Slider locked until no cost lines are Figures Needed.</p>
                )}
                <VenueOverrideRow
                  show={show}
                  onUpdated={onShowUpdated}
                  readOnly={chromeReadOnly}
                  onChromeSave={onChromeSave}
                />
                <div className="space-y-1.5 text-sm mt-2">
                  <Row label="Gross ticket sales" value={waterfall.grossTicketSales} />
                  <Row
                    label={`− Inside (pre-commission)`}
                    hint={waterfall.inside.sourceLabel}
                    value={waterfall.inside.total}
                    negative
                  />
                  <Row label="Commissionable" value={waterfall.commissionable} />
                  <Row
                    label={`− Harbour Agency (${Math.round(HARBOUR_COMMISSION_RATE * 100)}% locked)`}
                    value={waterfall.harbourCommission}
                    negative
                    testId="harbour-commission"
                  />
                  <div className="flex justify-between border-t border-slate-700 pt-1.5 font-medium">
                    <span className="text-slate-300">Net revenue</span>
                    <span className="text-white">{fmt(waterfall.netRevenue)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 bg-slate-800/60 rounded-lg border border-slate-700/60 p-3 space-y-1.5 text-sm">
          <Row label="Total gross ticket sales" value={totals.grossTicketSales} />
          <Row label="− Total inside (pre-commission)" value={totals.inside.total} negative />
          <Row label="Commissionable" value={totals.commissionable} />
          <Row
            label={`− Harbour Agency (${Math.round(HARBOUR_COMMISSION_RATE * 100)}% locked)`}
            value={totals.harbourCommission}
            negative
          />
          <div className="flex justify-between border-t border-slate-700 pt-1.5 font-medium">
            <span className="text-slate-300">Net revenue</span>
            <span className="text-white">{fmt(totals.netRevenue)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PnlSummaryBlock({
  summary,
  slidersUnlocked,
}: {
  summary: PnlSummary
  slidersUnlocked: boolean
}) {
  return (
    <div data-testid="pnl-owner-summary">
      <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">P&L Summary</h3>
      {slidersUnlocked ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Net Revenue</span>
            <span className="text-white">{fmt(summary.netRevenue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">− Total Costs</span>
            <span className="text-red-400">{fmt(summary.totalCosts)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-slate-700 pt-2">
            <span className="text-white">Net Profit / (Loss)</span>
            <span className={summary.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{fmt(summary.netProfit)}</span>
          </div>
          <div className="flex justify-between text-slate-400" data-testid="pnl-gst-quarantine">
            <span>
              {gstQuarantineLineLabel(summary.gstKnown)}
              <span className="block text-slate-600 text-xs font-normal">{summary.gstSourceLabel}</span>
            </span>
            <span className="text-red-400/70">{fmt(summary.gstQuarantine)}</span>
          </div>
          <div className="flex justify-between text-slate-400" data-testid="pnl-reserve-ex-gst">
            <span>{RESERVE_EX_GST_LABEL}</span>
            <span className="text-red-400/70">{fmt(summary.reserve)}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-slate-600 pt-2">
            <span className="text-amber-400">Pre-Distribution Margin</span>
            <span className={summary.preDistMargin >= 0 ? 'text-amber-400' : 'text-red-400'}>{fmt(summary.preDistMargin)}</span>
          </div>
          <p className="text-slate-600 text-xs pt-1">GST is not QF money — quarantined before the 20% ex-GST reserve. Harbour is 10% of commissionable (gross − inside), never editable.</p>
        </div>
      ) : (
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-5 text-center">
          <p className="text-slate-400 text-sm font-medium">P&L not available</p>
          <p className="text-slate-600 text-xs mt-1.5">Clear Figures Needed on cost lines (Estimate, Guess, Confirmed, or PAID) before a go/no-go decision can be made.</p>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  negative,
  hint,
  testId,
}: {
  label: string
  value: number
  negative?: boolean
  hint?: string
  testId?: string
}) {
  return (
    <div className="flex justify-between gap-2" data-testid={testId}>
      <span className="text-slate-400">
        {label}
        {hint ? <span className="block text-slate-600 text-xs font-normal">{hint}</span> : null}
      </span>
      <span className={`flex-shrink-0 ${negative ? 'text-red-400' : 'text-white font-medium'}`}>{fmt(value)}</span>
    </div>
  )
}

function VenueOverrideRow({
  show,
  onUpdated,
  readOnly = false,
  onChromeSave,
}: {
  show: Show
  onUpdated: (updated: PnlShow) => void
  readOnly?: boolean
  onChromeSave?: (show: PnlShow, patch: { booking_fee_per_payer?: number | null; cc_fee_pct?: number | null }) => Promise<PnlShow>
}) {
  const [editing, setEditing] = useState(false)
  const [booking, setBooking] = useState(show.booking_fee_per_payer?.toString() ?? '')
  const [cc, setCc] = useState(show.cc_fee_pct?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const patch = {
      booking_fee_per_payer: booking === '' ? null : parseFloat(booking),
      cc_fee_pct: cc === '' ? null : parseFloat(cc),
    }
    try {
      if (onChromeSave) {
        await onChromeSave(show, patch)
      } else {
        const res = await fetch(`/api/shows/${show.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError((data as { error?: string }).error ?? 'Save failed'); setSaving(false); return }
        onUpdated(data as Show)
      }
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    const hasOverride = show.booking_fee_per_payer != null || show.cc_fee_pct != null
    return (
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-slate-500">
          Venue inside override{hasOverride
            ? `: ${show.booking_fee_per_payer != null ? `$${Number(show.booking_fee_per_payer).toFixed(2)}/payer` : '—'} · ${show.cc_fee_pct != null ? `${Number(show.cc_fee_pct)}% CC` : '—'}`
            : ' — none (Factors / silent default)'}
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-slate-600 hover:text-amber-400"
          >
            Override
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-slate-900/60 rounded-lg border border-slate-700 p-2 mb-2 space-y-2">
      <p className="text-slate-500 text-xs">Venue override — estimated only. Remittance/contract known still wins.</p>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-slate-400 text-xs">
          $/payer
          <input
            type="number"
            step="0.01"
            value={booking}
            onChange={e => setBooking(e.target.value)}
            className="ml-1 w-20 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-white text-xs"
          />
        </label>
        <label className="text-slate-400 text-xs">
          CC %
          <input
            type="number"
            step="0.1"
            value={cc}
            onChange={e => setCc(e.target.value)}
            className="ml-1 w-16 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-white text-xs"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-amber-400 text-slate-900 text-xs font-semibold px-2 py-0.5 rounded disabled:opacity-50"
        >
          {saving ? '…' : 'Save'}
        </button>
        <button type="button" onClick={() => { setEditing(false); setError(null) }} className="text-slate-500 text-xs">Cancel</button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
