'use client'

import type { ReactNode } from 'react'
import { formatDateShortAU } from '@/lib/dates'
import { TICKETS_LOCKED_NOTE } from '@/lib/settlements-advancing-sync'
import BandedSellSlider from '@/components/BandedSellSlider'
import {
  normalizeCapacityBands,
  topBandSeats,
} from '@/lib/capacity-bands'
import type { CostEntry } from '@/lib/cost-fields'
import { knownInsideSeedLines, resolveSheetInsideCosts } from '@/lib/inside-fee-lines'
import {
  HARBOUR_COMMISSION_RATE,
  RESERVE_EX_GST_LABEL,
  computeVenueWaterfall,
  gstQuarantineLineLabel,
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
  remittanceLines: KnownInsideLine[]
  actualTickets?: number | null
  insideEntries?: CostEntry[] | null
  insideFieldState?: string | null
}): { gbo: number; tickets: number; waterfall: PnlVenueWaterfall; insideLabel: string } {
  const tickets = opts.actualTickets != null
    ? Math.max(0, Math.round(Number(opts.actualTickets) || 0))
    : (modelledTickets(opts.show, opts.pct) ?? 0)
  const gbo = opts.actualTickets != null
    ? Math.round(tickets * (Number(opts.show.ticket_price) || 0))
    : (projectedBoxOffice(opts.show, opts.pct) ?? 0)
  const contractLines = knownInsideSeedLines(opts.remittanceLines, opts.show.id)
  const inside = resolveSheetInsideCosts({
    grossTicketSales: gbo,
    payerCount: tickets,
    entries: opts.insideEntries,
    fieldState: opts.insideFieldState,
    contractLines,
    showId: opts.show.id,
  })
  const waterfall = computeVenueWaterfall({ grossTicketSales: gbo, insideTotal: inside.total })
  waterfall.inside = inside
  return { gbo, tickets, waterfall, insideLabel: inside.sourceLabel }
}

const AUTO_CALC_ROW = {
  bg: 'bg-slate-800/60',
  text: 'text-slate-400',
  border: 'border-slate-700',
  chip: 'AUTO CALC',
}

function AutoCalcFieldRow({
  label,
  value,
  hint,
  negative,
  testId,
}: {
  label: string
  value: number
  hint?: string
  negative?: boolean
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      data-chrome="auto_calc"
      className={`rounded-lg border ${AUTO_CALC_ROW.bg} ${AUTO_CALC_ROW.border}`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-slate-300 text-sm">{label}</div>
          {hint ? <div className="text-slate-500 text-xs mt-0.5">{hint}</div> : null}
        </div>
        <span className={`text-sm font-medium ${negative ? 'text-red-400' : AUTO_CALC_ROW.text}`}>
          {fmt(value)}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${AUTO_CALC_ROW.text} opacity-70 whitespace-nowrap`}>
          {AUTO_CALC_ROW.chip}
        </span>
      </div>
    </div>
  )
}

export function PnlRevenueBlock({
  shows,
  sellThrough,
  slidersUnlocked,
  incompleteFields,
  hasGuessFields,
  remittanceLines,
  onSellThrough,
  onShowUpdated: _onShowUpdated,
  chromeReadOnly: _chromeReadOnly = false,
  ticketLocks,
  insideByShow = {},
  renderInsideFees,
}: {
  shows: Show[]
  sellThrough: Record<string, number>
  slidersUnlocked: boolean
  incompleteFields: string[]
  hasGuessFields: boolean
  remittanceLines: KnownInsideLine[]
  onSellThrough: (showId: string, pct: number) => void
  onShowUpdated: (updated: PnlShow) => void
  chromeReadOnly?: boolean
  ticketLocks?: Record<string, AdvancingTicketLock>
  insideByShow?: Record<string, { entries: CostEntry[]; state?: string | null }>
  renderInsideFees?: (ctx: { show: PnlShow; tickets: number; gbo: number }) => ReactNode
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
        remittanceLines,
        actualTickets: lock?.locked ? lock.tickets : null,
        insideEntries: insideByShow[show.id]?.entries,
        insideFieldState: insideByShow[show.id]?.state,
      }),
    }
  })
  const totalGross = perVenue.reduce((s, v) => s + v.waterfall.grossTicketSales, 0)
  const totalInside = perVenue.reduce((s, v) => s + v.waterfall.inside.total, 0)
  const totals = computeVenueWaterfall({ grossTicketSales: totalGross, insideTotal: totalInside })
  const harbourPct = Math.round(HARBOUR_COMMISSION_RATE * 100)

  return (
    <div className="space-y-4" data-testid="pnl-owner-revenue">
      {!slidersUnlocked && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-400 text-base shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-red-300 font-semibold text-sm">Sliders locked — cost lines still Figures Needed</p>
              <p className="text-red-400/80 text-xs mt-1 mb-2">Set these to Estimate, Guess, Confirmed, or PAID to unlock sell-through sliders. Gross Ticket Sales FIGURES NEEDED is ignored — sliders supply revenue.</p>
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
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Revenue</h3>
        <div className="space-y-4">
          {perVenue.map(({ show, pct, tickets, gbo, waterfall, lock }) => {
            const cap = modelCapacity(show)
            const bands = normalizeCapacityBands(show.capacity_bands)
            const ticketsLocked = Boolean(lock?.locked)
            return (
              <div key={show.id} className="space-y-1.5" data-testid={`pnl-venue-${show.id}`}>
                <div className="flex items-center justify-between gap-3 mb-1">
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
                  className="mb-2"
                />
                {ticketsLocked && (
                  <p className="text-teal-300/90 text-xs mb-1" data-testid={`advancing-tickets-locked-${show.id}`}>
                    {TICKETS_LOCKED_NOTE}
                    {lock?.sourceNote ? ` Source: ${lock.sourceNote}` : ''}
                  </p>
                )}
                {!slidersUnlocked && !ticketsLocked && (
                  <p className="text-slate-600 text-xs mb-1">Slider locked until no cost lines are Figures Needed.</p>
                )}
                <AutoCalcFieldRow
                  label="Gross Ticket Sales"
                  value={waterfall.grossTicketSales}
                  testId={`revenue-gross-${show.id}`}
                />
                {renderInsideFees
                  ? renderInsideFees({ show, tickets, gbo })
                  : (
                    <AutoCalcFieldRow
                      label="Inside Fees"
                      value={waterfall.inside.total}
                      hint={waterfall.inside.sourceLabel}
                      negative
                      testId={`revenue-inside-${show.id}`}
                    />
                  )}
                <AutoCalcFieldRow
                  label="Commissionable"
                  value={waterfall.commissionable}
                  testId={`revenue-commissionable-${show.id}`}
                />
                <AutoCalcFieldRow
                  label={`Harbour Agency ${harbourPct}%`}
                  value={waterfall.harbourCommission}
                  hint="Hard-locked — 10% of commissionable (gross − insides)"
                  negative
                  testId="harbour-commission"
                />
                <AutoCalcFieldRow
                  label="Net Revenue"
                  value={waterfall.netRevenue}
                  testId={`revenue-net-${show.id}`}
                />
              </div>
            )
          })}
        </div>
        <div className="mt-3 space-y-1.5" data-testid="pnl-revenue-totals">
          <h4 className="text-slate-500 text-xs font-medium uppercase tracking-wider">Revenue totals</h4>
          <AutoCalcFieldRow label="Gross Ticket Sales" value={totals.grossTicketSales} />
          <AutoCalcFieldRow label="Inside Fees" value={totals.inside.total} negative />
          <AutoCalcFieldRow label="Commissionable" value={totals.commissionable} />
          <AutoCalcFieldRow label={`Harbour Agency ${harbourPct}%`} value={totals.harbourCommission} negative />
          <AutoCalcFieldRow label="Net Revenue" value={totals.netRevenue} />
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

