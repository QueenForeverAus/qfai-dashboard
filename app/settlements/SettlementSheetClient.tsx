'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateAU, formatDateShortAU } from '@/lib/dates'
import { SETTLEMENTS_MODULE_LABEL, formatSettlementsMoney } from '@/lib/settlements'
import type { CostingSnapshotField } from '@/lib/settlements'
import type { SettlementShow } from '@/lib/settlements-load'
import {
  COL1_HEADER,
  COL2_HEADER,
  COL3_CELL,
  COL3_HEADER,
  COL3_PLACEHOLDER_NOTE,
  PRE_SHOW_BLOCK_COPY,
  PRE_SHOW_STAKEHOLDER_NOTE,
  SHEET_HEADING,
  TICKETS_SOLD_HELP,
  TICKETS_SOLD_LABEL,
  buildRunSheet,
  buildShowSheetLines,
  resolveTicketsSold,
  settlementSheetHref,
  showHasOccurred,
  type SheetLine,
} from '@/lib/settlements-sheet'
import type { InsideFactorValues, KnownInsideLine } from '@/lib/pnl-run-costing'
import SettlementsTabBar from './SettlementsTabBar'

function fmtExpected(line: SheetLine): string {
  if (line.expected == null) return '—'
  if (line.kind === 'count') return line.expected.toLocaleString('en-AU')
  return formatSettlementsMoney(line.expected)
}

function LineTable({
  lines,
  showId,
}: {
  lines: SheetLine[]
  showId: string
}) {
  return (
    <div className="overflow-x-auto" data-testid={`settlements-sheet-table-${showId}`}>
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500">
            <th className="text-left font-semibold pb-2 pr-3" data-testid="settlements-sheet-col1">{COL1_HEADER}</th>
            <th className="text-right font-semibold pb-2 px-3" data-testid="settlements-sheet-col2">{COL2_HEADER}</th>
            <th className="text-right font-semibold pb-2 pl-3" data-testid="settlements-sheet-col3">{COL3_HEADER}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(line => (
            <tr
              key={line.key}
              className={`border-t border-slate-800 ${line.group === 'pnl' ? 'bg-slate-900/40' : ''}`}
              data-testid={`sheet-row-${line.key}`}
            >
              <td className="py-2 pr-3 text-slate-300">
                {line.label}
                {line.note ? <span className="block text-[10px] text-slate-600 font-normal">{line.note}</span> : null}
              </td>
              <td className={`py-2 px-3 text-right tabular-nums ${line.key === 'pre_dist_margin' || line.key === 'net_profit' ? 'text-amber-300 font-semibold' : 'text-white'}`}>
                {fmtExpected(line)}
              </td>
              <td className="py-2 pl-3 text-right text-slate-600">{COL3_CELL}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SettlementSheetClient({
  run,
  shows,
  liveFields,
  focusedShowId,
  insideFactors,
  remittanceKnownLines,
}: {
  run: { id: string; code: string; name: string; status: string; start_date: string | null; end_date: string | null }
  shows: SettlementShow[]
  liveFields: CostingSnapshotField[]
  focusedShowId: string | null
  insideFactors: InsideFactorValues
  remittanceKnownLines: KnownInsideLine[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftTickets, setDraftTickets] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const show of shows) {
      if (show.tickets_sold != null) initial[show.id] = String(show.tickets_sold)
    }
    return initial
  })

  const focusedShow = shows.find(s => s.id === focusedShowId) ?? null
  const runModel = useMemo(
    () => buildRunSheet({
      shows,
      fields: liveFields,
      factors: insideFactors,
      remittanceLines: remittanceKnownLines,
    }),
    [shows, liveFields, insideFactors, remittanceKnownLines],
  )

  const focusedBlocked = focusedShow ? !showHasOccurred(focusedShow.show_date) : runModel.blocked

  async function saveTickets(showId: string) {
    const raw = draftTickets[showId]
    const tickets = raw === '' || raw == null ? null : Number(raw)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/tickets-sold`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_id: showId, tickets_sold: tickets }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not save tickets sold')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save tickets sold')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-1">
        <Link href="/settlements" className="text-slate-500 text-sm hover:text-slate-300">← {SETTLEMENTS_MODULE_LABEL}</Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-400 font-bold text-lg">{run.code}</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-teal-900/40 text-teal-300 border-teal-800">
              {SHEET_HEADING}
            </span>
          </div>
          <h1 className="text-white text-2xl font-bold">{run.name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {focusedShow
              ? `${focusedShow.venue_name} · ${formatDateAU(focusedShow.show_date)}`
              : `${formatDateAU(run.start_date)}${run.start_date !== run.end_date ? ` – ${formatDateAU(run.end_date)}` : ''}`}
          </p>
          <p className="text-slate-500 text-xs mt-2 max-w-2xl">
            Col2 is a live read of Advancing / Run Costing. Tickets sold is the actual count — not a sell-through slider.
          </p>
        </div>
      </div>

      <SettlementsTabBar runCode={run.code} showId={focusedShowId} active="sheet" />

      {shows.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link
            href={settlementSheetHref(run.code)}
            className={`px-2.5 py-1 rounded-md text-xs border ${!focusedShowId ? 'bg-amber-400/10 text-amber-400 border-amber-700' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
          >
            All shows
          </Link>
          {shows.map(show => (
            <Link
              key={show.id}
              href={settlementSheetHref(run.code, show.id)}
              className={`px-2.5 py-1 rounded-md text-xs border ${focusedShowId === show.id ? 'bg-amber-400/10 text-amber-400 border-amber-700' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
            >
              {show.venue_name}
              <span className="text-slate-600 ml-1">{formatDateShortAU(show.show_date)}</span>
            </Link>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900 text-red-300 text-sm">{error}</div>
      )}

      {focusedBlocked ? (
        <div
          className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center"
          data-testid="settlements-sheet-pre-show"
        >
          <p className="text-white font-semibold">{PRE_SHOW_BLOCK_COPY}</p>
          <p className="text-slate-400 text-sm mt-2">{PRE_SHOW_STAKEHOLDER_NOTE}</p>
          {focusedShow ? (
            <p className="text-slate-600 text-xs mt-3">
              {focusedShow.venue_name} is {formatDateAU(focusedShow.show_date)}.
            </p>
          ) : runModel.upcoming.length > 0 ? (
            <p className="text-slate-600 text-xs mt-3">
              Next: {runModel.upcoming[0]!.venue_name} · {formatDateAU(runModel.upcoming[0]!.show_date)}.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4" data-testid="settlements-sheet">
          <p className="text-[11px] text-slate-500" data-testid="settlements-sheet-col3-note">{COL3_PLACEHOLDER_NOTE}</p>

          {(focusedShow ? [focusedShow] : runModel.occurred).map(show => {
            const resolved = resolveTicketsSold({ entered: show.tickets_sold })
            const built = focusedShow
              ? buildShowSheetLines({
                  show,
                  fields: liveFields,
                  tickets: resolved.tickets,
                  ticketsSource: resolved.source,
                  factors: insideFactors,
                  remittanceLines: remittanceKnownLines,
                  includeRunCosts: true,
                })
              : runModel.sections.find(sec => sec.show.id === show.id)!
            const lines = focusedShow ? built.lines : built.lines.filter(l => l.group !== 'run_costs' || l.key === 'run:social_ads_var')
            return (
              <section key={show.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-white font-semibold">{show.venue_name}</h2>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {show.venue_city} · {formatDateAU(show.show_date)}
                      {show.capacity ? ` · Cap ${show.capacity.toLocaleString()}` : ''}
                      {show.ticket_price != null ? ` · $${Number(show.ticket_price).toFixed(2)} nett` : ''}
                    </p>
                  </div>
                  <form
                    className="flex flex-wrap items-end gap-2"
                    data-testid={`sheet-tickets-form-${show.id}`}
                    onSubmit={e => {
                      e.preventDefault()
                      void saveTickets(show.id)
                    }}
                  >
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      {TICKETS_SOLD_LABEL}
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={draftTickets[show.id] ?? ''}
                        onChange={e => setDraftTickets(prev => ({ ...prev, [show.id]: e.target.value }))}
                        placeholder="Actual count"
                        data-testid={`sheet-tickets-input-${show.id}`}
                        className="mt-1 block w-28 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={busy}
                      data-testid={`sheet-tickets-save-${show.id}`}
                      className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
                    >
                      {busy ? 'Saving…' : 'Save count'}
                    </button>
                  </form>
                </div>
                <p className="text-[11px] text-slate-600">{TICKETS_SOLD_HELP}</p>
                <LineTable lines={lines} showId={show.id} />
              </section>
            )
          })}

          {!focusedShow && (
            <section className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3" data-testid="settlements-sheet-run-costs">
              <h2 className="text-white font-semibold">Run-level advancing costs</h2>
              <LineTable lines={runModel.runLines} showId="run" />
            </section>
          )}

          {!focusedShow && (
            <section className="bg-slate-800 rounded-xl border border-amber-900/40 p-4" data-testid="settlements-sheet-pnl">
              <h2 className="text-amber-400 font-semibold text-sm mb-2">Expected P&amp;L</h2>
              {runModel.summary ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Net Profit / (Loss)</span>
                    <span className={runModel.summary.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {formatSettlementsMoney(runModel.summary.netProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>− 20% Reserve</span>
                    <span>{formatSettlementsMoney(runModel.summary.reserve)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-slate-700 pt-2">
                    <span className="text-amber-400">Pre-Distribution Margin</span>
                    <span className={runModel.summary.preDistMargin >= 0 ? 'text-amber-400' : 'text-red-400'}>
                      {formatSettlementsMoney(runModel.summary.preDistMargin)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Enter tickets sold on each occurred show to compute expected P&amp;L.</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
