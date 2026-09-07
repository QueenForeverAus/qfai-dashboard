'use client'

import BandedSellSlider from '@/components/BandedSellSlider'
import { formatDateShortAU } from '@/lib/dates'
import { normalizeCapacityBands } from '@/lib/capacity-bands'
import {
  HARBOUR_COMMISSION_RATE,
  type InsideSource,
  type PnlSummary,
  type RevenueWaterfall,
} from '@/lib/pnl'

export type OwnerVenueRevenue = {
  showId: string
  venueName: string
  venueCity: string
  stateTerritory: string | null
  showDate: string | null
  capacity: number | null
  capacityBands?: unknown | null
  ticketPrice: number | null
  sellThroughPct: number
  tickets: number | null
  waterfall: RevenueWaterfall
  insideSource: InsideSource
}

function fmt(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function Row({
  label,
  hint,
  value,
  tone,
  locked,
}: {
  label: string
  hint?: string
  value: string
  tone?: 'muted' | 'white' | 'red' | 'amber'
  locked?: boolean
}) {
  const color =
    tone === 'red' ? 'text-red-400' :
    tone === 'amber' ? 'text-amber-400' :
    tone === 'white' ? 'text-white' :
    'text-slate-200'
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-slate-400">
        {label}
        {locked ? <span className="text-slate-600"> · locked</span> : null}
        {hint ? <span className="text-slate-600 font-normal"> {hint}</span> : null}
      </span>
      <span className={`${color} font-medium flex-shrink-0`}>{value}</span>
    </div>
  )
}

export function OwnerRevenueBlock({
  venues,
  slidersUnlocked,
  incompleteFields,
  hasGuessFields,
  onSellThrough,
}: {
  venues: OwnerVenueRevenue[]
  slidersUnlocked: boolean
  incompleteFields: string[]
  hasGuessFields: boolean
  onSellThrough: (showId: string, pct: number) => void
}) {
  const harbourPct = Math.round(HARBOUR_COMMISSION_RATE * 100)
  const totals = venues.reduce(
    (acc, v) => ({
      gross: acc.gross + v.waterfall.gross,
      inside: acc.inside + v.waterfall.inside,
      commissionable: acc.commissionable + v.waterfall.commissionable,
      harbour: acc.harbour + v.waterfall.harbour,
      netRevenue: acc.netRevenue + v.waterfall.netRevenue,
    }),
    { gross: 0, inside: 0, commissionable: 0, harbour: 0, netRevenue: 0 },
  )

  return (
    <div data-testid="run-costing-owner-revenue" className="space-y-3">
      <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Revenue — per venue</h3>

      {!slidersUnlocked && (
        <div data-testid="pnl-sliders-locked" className="bg-red-950/40 border border-red-800/60 rounded-xl p-4">
          <p className="text-red-300 font-semibold text-sm">Sliders locked — cost lines still FIGURES NEEDED</p>
          <p className="text-red-400/80 text-xs mt-1 mb-2">
            Set these to Estimate, Guess, Confirmed, or PAID to unlock. Gross Box Office / revenue FIGURES NEEDED is ignored — sliders supply revenue.
          </p>
          <ul className="space-y-0.5">
            {incompleteFields.map(f => (
              <li key={f} className="text-red-400/70 text-xs flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {slidersUnlocked && hasGuessFields && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3 flex items-start gap-2">
          <span className="text-amber-500 text-sm shrink-0 mt-0.5">~</span>
          <p className="text-amber-400/80 text-xs">Some figures are estimates or unconfirmed — treat this P&amp;L as indicative only.</p>
        </div>
      )}

      <div className="space-y-3">
        {venues.map(show => {
          const bands = normalizeCapacityBands(show.capacityBands)
          const cap = show.capacity
          const pct = show.sellThroughPct
          const wf = show.waterfall
          const insideHint = show.insideSource === 'known'
            ? '· remittance/contract known'
            : '· Factors estimated'
          return (
            <div key={show.showId} className="bg-slate-800 rounded-xl border border-slate-700 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="text-white text-sm font-semibold truncate">{show.venueName}</div>
                  <div className="text-slate-500 text-xs mt-0.5 truncate">
                    {show.venueCity}{show.stateTerritory ? `, ${show.stateTerritory}` : ''} · {formatDateShortAU(show.showDate)}
                    {cap ? ` · Cap ${cap.toLocaleString()}` : ''}
                    {bands.length > 1 ? ` · ${bands.length} bands` : ''}
                    {show.ticketPrice != null ? ` · $${Number(show.ticketPrice).toFixed(2)} nett/ticket` : ' · Ticket price —'}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-amber-400 font-bold">{pct}%</div>
                  <div className="text-slate-500 text-xs">{show.tickets != null ? `${show.tickets.toLocaleString()} tix` : '—'}</div>
                </div>
              </div>
              <BandedSellSlider
                value={pct}
                onChange={v => onSellThrough(show.showId, v)}
                capacity={cap}
                capacityBands={show.capacityBands}
                disabled={!slidersUnlocked}
                className="mb-3"
              />
              <div className="space-y-1.5">
                <Row
                  label="Gross Box Office"
                  hint={cap && show.ticketPrice != null
                    ? `· ${cap.toLocaleString()} × ${pct}% × $${Number(show.ticketPrice).toFixed(2)}`
                    : undefined}
                  value={fmt(wf.gross)}
                  tone="white"
                />
                <Row
                  label="− Inside (ticketing / CC)"
                  hint={insideHint}
                  value={fmt(wf.inside)}
                  tone="red"
                />
                <Row label="= Commissionable" value={fmt(wf.commissionable)} tone="white" />
                <Row
                  label={`− Harbour Agency (${harbourPct}%)`}
                  value={fmt(wf.harbour)}
                  tone="red"
                  locked
                />
                <div
                  data-testid="harbour-commission"
                  data-harbour-rate={String(HARBOUR_COMMISSION_RATE)}
                  className="flex justify-between text-sm gap-2 border-t border-slate-700 pt-1.5 font-medium"
                >
                  <span className="text-slate-300">Net Revenue</span>
                  <span className="text-white">{fmt(wf.netRevenue)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-slate-800/60 rounded-lg border border-slate-700/60 p-3 space-y-1.5 text-sm">
        <Row label="Total Gross" value={fmt(totals.gross)} />
        <Row label="− Inside" value={fmt(totals.inside)} tone="red" />
        <Row label="= Commissionable" value={fmt(totals.commissionable)} />
        <Row label={`− Harbour Agency (${harbourPct}%)`} value={fmt(totals.harbour)} tone="red" locked />
        <div className="flex justify-between border-t border-slate-700 pt-1.5 font-medium">
          <span className="text-slate-300">Net Revenue</span>
          <span className="text-white">{fmt(totals.netRevenue)}</span>
        </div>
      </div>
    </div>
  )
}

export function OwnerPnlSummary({
  summary,
  unlocked,
}: {
  summary: PnlSummary
  unlocked: boolean
}) {
  return (
    <div data-testid="run-costing-owner-pnl">
      <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">P&amp;L Summary</h3>
      {unlocked ? (
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
            <span className={summary.netPl >= 0 ? 'text-green-400' : 'text-red-400'}>{fmt(summary.netPl)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>− 20% Reserve</span>
            <span className="text-red-400/70">{fmt(summary.reserve)}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-slate-600 pt-2">
            <span className="text-amber-400">Pre-Distribution Margin</span>
            <span className={summary.preDistMargin >= 0 ? 'text-amber-400' : 'text-red-400'}>{fmt(summary.preDistMargin)}</span>
          </div>
          <p className="text-slate-600 text-xs pt-1">GST quarantine not included — calculated by Scott at settlement.</p>
        </div>
      ) : (
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-5 text-center">
          <p className="text-slate-400 text-sm font-medium">P&amp;L not available</p>
          <p className="text-slate-600 text-xs mt-1.5">Clear FIGURES NEEDED on cost lines before a go/no-go decision can be made.</p>
        </div>
      )}
    </div>
  )
}
