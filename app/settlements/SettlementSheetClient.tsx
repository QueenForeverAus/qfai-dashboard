'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateAU, formatDateShortAU } from '@/lib/dates'
import { SETTLEMENTS_MODULE_LABEL, formatSettlementsMoney, type BandCostLine } from '@/lib/settlements'
import type { CostingSnapshotField } from '@/lib/settlements'
import type { SettlementShow } from '@/lib/settlements-load'
import type { RemittanceChallenge } from '@/lib/remittance'
import {
  ADVANCING_COSTS_LABEL,
  COL1_HEADER,
  COL2_HEADER,
  COL3_HEADER,
  col2SourceNote,
  PRE_SHOW_BLOCK_COPY,
  PRE_SHOW_STAKEHOLDER_NOTE,
  SETTLEMENTS_DEMO_BANNER,
  SHEET_HEADING,
  TICKETS_SOLD_HELP,
  TICKETS_SOLD_LABEL,
  buildRunSheet,
  buildShowSheetLines,
  isSettlementsDemoRun,
  resolveTicketsSold,
  settlementSheetHref,
  showHasOccurred,
  type SettlementExpectedSource,
} from '@/lib/settlements-sheet'
import {
  ROLLUP_LABEL,
  SMART_MATCH_NOTE,
  buildDualPnlFooters,
  pnlFromSheetSides,
} from '@/lib/settlements-sheet-match'
import {
  DISTRIBUTE_BLOCKED_NOTE,
  DISTRIBUTE_CONTROL_LABEL,
  DISTRIBUTE_GATE_LABEL,
  DISTRIBUTE_GATE_RULE,
  DISTRIBUTE_STUB_NOTE,
  distributeGateFromSources,
} from '@/lib/settlements-distribute-gate'
import {
  CHALLENGE_BUTTON_LABEL,
  COL3_ACTUALS_NOTE,
  EMAIL_SCRAPE_INGEST_NOTE,
  SHEET_BAND_PAID_HELP,
  SHEET_CHALLENGE_NEVER_SEND_NOTE,
  VENUE_CHALLENGED_LABEL,
  VENUE_CONFIRMED_LABEL,
  applyCol3Actuals,
  applyCol3ToRunSheet,
  canEditSheetBandActual,
  isBandCostLine,
  isVenueSettlementLine,
  quoteInvoiceStubLabel,
  sheetLineToComparisonRow,
  type DecoratedSheetLine,
  type SettlementActualLine,
} from '@/lib/settlements-sheet-actuals'
import {
  GST_QUARANTINE_KEY,
  RESERVE_EX_GST_LABEL,
  gstQuarantineLineLabel,
  type InsideFactorValues,
  type KnownInsideLine,
  type PnlSummary,
} from '@/lib/pnl-run-costing'
import SettlementsTabBar from './SettlementsTabBar'

function fmtMoneyOrDash(value: number | null | undefined, kind: DecoratedSheetLine['kind']): string {
  if (value == null) return '—'
  if (kind === 'count') return value.toLocaleString('en-AU')
  return formatSettlementsMoney(value)
}

function DualPnlBlock({
  expected,
  actual,
}: {
  expected: PnlSummary | null
  actual: PnlSummary | null
}) {
  const footer = buildDualPnlFooters({ expected, actual })
  return (
    <section className="bg-slate-800 rounded-xl border border-amber-900/40 p-4" data-testid="settlements-sheet-pnl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div data-testid="settlements-sheet-expected-pnl">
          <h2 className="text-amber-400 font-semibold text-sm mb-2">{footer.expectedLabel}</h2>
          {footer.expected ? (
            <PnlRows summary={footer.expected} accent="expected" />
          ) : (
            <p className="text-slate-500 text-sm">Enter tickets sold on each occurred show to compute expected P&amp;L.</p>
          )}
        </div>
        <div data-testid="settlements-sheet-actual-pnl">
          <h2 className="text-teal-300 font-semibold text-sm mb-2">{footer.actualLabel}</h2>
          {footer.actual ? (
            <PnlRows summary={footer.actual} accent="actual" />
          ) : (
            <p className="text-slate-500 text-sm">Col3 sums confirmed actuals (including roll-ups) once tickets sold is entered.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function PnlRows({ summary, accent }: { summary: PnlSummary; accent: 'expected' | 'actual' }) {
  const strong = accent === 'expected' ? 'text-amber-400' : 'text-teal-300'
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between">
        <span className="text-slate-400">Net revenue</span>
        <span className="text-white tabular-nums">{formatSettlementsMoney(summary.netRevenue)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-400">Total costs</span>
        <span className="text-white tabular-nums">{formatSettlementsMoney(summary.totalCosts)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-400">Net Profit / (Loss)</span>
        <span className={`tabular-nums ${summary.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {formatSettlementsMoney(summary.netProfit)}
        </span>
      </div>
      <div className="flex justify-between text-slate-400" data-testid="pnl-gst-quarantine">
        <span>
          {gstQuarantineLineLabel(summary.gstKnown)}
          <span className="block text-[10px] text-slate-600 font-normal">{summary.gstSourceLabel}</span>
        </span>
        <span className="tabular-nums">{formatSettlementsMoney(summary.gstQuarantine)}</span>
      </div>
      <div className="flex justify-between text-slate-400" data-testid="pnl-reserve-ex-gst">
        <span>{RESERVE_EX_GST_LABEL}</span>
        <span className="tabular-nums">{formatSettlementsMoney(summary.reserve)}</span>
      </div>
      <div className="flex justify-between font-bold border-t border-slate-700 pt-2">
        <span className={strong}>Pre-Distribution Margin</span>
        <span className={`tabular-nums ${summary.preDistMargin >= 0 ? strong : 'text-red-400'}`}>
          {formatSettlementsMoney(summary.preDistMargin)}
        </span>
      </div>
    </div>
  )
}

function DistributeGateBlock({
  runId,
  gate,
  busy,
  onBusy,
  onError,
}: {
  runId: string
  gate: ReturnType<typeof distributeGateFromSources>
  busy: boolean
  onBusy: (v: boolean) => void
  onError: (msg: string | null) => void
}) {
  const [result, setResult] = useState<string | null>(null)
  async function distribute() {
    onBusy(true)
    onError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/settlements/${runId}/distribute`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || DISTRIBUTE_BLOCKED_NOTE)
      setResult(body.message || DISTRIBUTE_STUB_NOTE)
    } catch (err) {
      onError(err instanceof Error ? err.message : DISTRIBUTE_BLOCKED_NOTE)
    } finally {
      onBusy(false)
    }
  }
  return (
    <section
      className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-2"
      data-testid="distribute-gate"
      data-ready={gate.ready ? 'true' : 'false'}
    >
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{DISTRIBUTE_GATE_LABEL}</div>
      <p className="text-slate-300 text-sm" data-testid="distribute-gate-rule">{DISTRIBUTE_GATE_RULE}</p>
      <p
        data-testid="distribute-gate-summary"
        className={`text-xs ${gate.ready ? 'text-teal-300' : 'text-orange-300'}`}
      >
        {gate.ready ? '✓' : '○'} {gate.summary}
      </p>
      {gate.blockers.slice(0, 6).map(b => (
        <p key={b.id} className="text-[11px] text-slate-500" data-testid="distribute-gate-blocker">
          {b.label} — {b.reason}
        </p>
      ))}
      <button
        type="button"
        disabled={busy || !gate.ready}
        data-testid="distribute-funds"
        onClick={() => void distribute()}
        className="text-xs font-semibold px-3 py-1.5 rounded bg-amber-400 text-slate-900 hover:bg-amber-300 disabled:opacity-40"
      >
        {DISTRIBUTE_CONTROL_LABEL}
      </button>
      {result && (
        <p className="text-teal-300 text-xs" data-testid="distribute-stub-note">{result}</p>
      )}
    </section>
  )
}

function Col3Cell({
  line,
  showId,
  busy,
  onConfirmVenue,
  onChallenge,
  onSaveBand,
  onTogglePaid,
  onQuoteNote,
}: {
  line: DecoratedSheetLine
  showId: string | null
  busy: boolean
  onConfirmVenue: (line: DecoratedSheetLine, amount: number) => void
  onChallenge: (line: DecoratedSheetLine, showId: string | null) => void
  onSaveBand: (line: DecoratedSheetLine, amount: number) => void
  onTogglePaid: (line: DecoratedSheetLine, paid: boolean) => void
  onQuoteNote: (line: DecoratedSheetLine, note: string) => void
}) {
  const [draft, setDraft] = useState(line.actual == null ? '' : String(line.actual))
  const [note, setNote] = useState(line.quoteNote ?? '')
  const locked = isBandCostLine(line) && !canEditSheetBandActual(line.actualPaid)
  const varianceLabel = line.variance != null && line.variance !== 0
    ? `${line.variance > 0 ? '+' : ''}${line.kind === 'count' ? line.variance : formatSettlementsMoney(line.variance)}`
    : null

  if (line.actualKind === 'derived') {
    return (
      <div className="text-right" data-testid={`sheet-actual-${line.key}`}>
        <div className={`tabular-nums ${line.key === 'pre_dist_margin' || line.key === 'net_profit' ? 'text-amber-300 font-semibold' : 'text-white'}`}>
          {fmtMoneyOrDash(line.actual, line.kind)}
        </div>
      </div>
    )
  }

  if (isVenueSettlementLine(line)) {
    return (
      <div className="text-right space-y-1" data-testid={`sheet-actual-${line.key}`}>
        {line.group === 'venue_costs' || line.actual == null ? (
          <div className="flex justify-end items-center gap-1">
            <input
              type="number"
              step={line.kind === 'count' ? 1 : 0.01}
              min={0}
              inputMode="decimal"
              value={draft}
              disabled={busy}
              onChange={e => setDraft(e.target.value)}
              placeholder="Enter confirmed"
              data-testid={`sheet-actual-input-${line.key}`}
              className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right"
            />
            <button
              type="button"
              disabled={busy || draft === ''}
              data-testid={`sheet-actual-confirm-${line.key}`}
              onClick={() => onConfirmVenue(line, Number(draft))}
              className="text-[10px] font-semibold px-2 py-1 rounded bg-teal-900/50 text-teal-300 border border-teal-800 hover:bg-teal-900 disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        ) : (
          <div className="tabular-nums text-white" data-testid={`sheet-actual-value-${line.key}`}>
            {fmtMoneyOrDash(line.actual, line.kind)}
          </div>
        )}
        <div className="flex justify-end flex-wrap items-center gap-1">
          {line.actualStatus === 'challenged' ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-orange-900/30 text-orange-300 border-orange-800" data-testid={`sheet-actual-status-${line.key}`}>
              {VENUE_CHALLENGED_LABEL}
            </span>
          ) : line.actual != null ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-teal-900/40 text-teal-300 border-teal-800" data-testid={`sheet-actual-status-${line.key}`}>
              {VENUE_CONFIRMED_LABEL}
            </span>
          ) : null}
          {line.actual != null && (
            <button
              type="button"
              disabled={busy}
              data-testid={`sheet-challenge-${line.key}`}
              onClick={() => onChallenge(line, showId)}
              className="text-[10px] font-semibold px-2 py-1 rounded border border-amber-800 text-amber-300 hover:bg-amber-900/30 disabled:opacity-40"
            >
              {CHALLENGE_BUTTON_LABEL}
            </button>
          )}
        </div>
        {varianceLabel && line.varianceSeverity ? (
          <div
            className={`text-[10px] ${line.varianceSeverity === 'hard' ? 'text-red-300' : 'text-orange-300'}`}
            data-testid={`sheet-variance-${line.key}`}
          >
            Δ {varianceLabel}
          </div>
        ) : null}
        {line.match === 'rollup' && (line.matchChildren?.length ?? 0) > 0 ? (
          <div className="text-left mt-1 space-y-0.5" data-testid={`sheet-rollup-${line.key}`}>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{ROLLUP_LABEL}</div>
            {line.matchChildren!.map(child => (
              <div key={child.id} className="text-[11px] text-slate-400 flex justify-between gap-2" data-testid={`sheet-rollup-child-${child.lineKey}`}>
                <span>{child.label}</span>
                <span className="tabular-nums text-slate-200">{formatSettlementsMoney(child.amount)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="text-right space-y-1" data-testid={`sheet-actual-${line.key}`}>
      <div className="flex justify-end items-center gap-1">
        <input
          type="number"
          step={0.01}
          inputMode="decimal"
          value={draft}
          disabled={busy || locked}
          onChange={e => setDraft(e.target.value)}
          data-testid={`sheet-band-input-${line.key}`}
          className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right disabled:opacity-50"
        />
        <button
          type="button"
          disabled={busy || locked || draft === ''}
          data-testid={`sheet-band-save-${line.key}`}
          onClick={() => onSaveBand(line, Number(draft))}
          className="text-[10px] font-semibold px-2 py-1 rounded bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-40"
        >
          Save
        </button>
      </div>
      <div className="flex justify-end flex-wrap items-center gap-1">
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            line.actualPaid ? 'bg-teal-900/40 text-teal-300 border-teal-800' : 'bg-orange-900/30 text-orange-300 border-orange-800'
          }`}
          data-testid={`sheet-band-paid-${line.key}`}
        >
          {line.actualPaid ? 'PAID' : 'OPEN'}
        </span>
        {line.actualPaid ? (
          <button
            type="button"
            disabled={busy}
            data-testid={`sheet-band-reopen-${line.key}`}
            onClick={() => onTogglePaid(line, false)}
            className="text-[10px] text-slate-500 hover:text-slate-300"
          >
            Reopen
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            data-testid={`sheet-band-paid-btn-${line.key}`}
            onClick={() => onTogglePaid(line, true)}
            className="text-[10px] font-semibold text-teal-300 hover:text-teal-200"
          >
            Mark PAID
          </button>
        )}
      </div>
      <label className="block text-left">
        <span className="text-[10px] text-slate-600">{quoteInvoiceStubLabel()}</span>
        <input
          type="text"
          value={note}
          disabled={busy || locked}
          data-testid={`sheet-band-quote-${line.key}`}
          onChange={e => setNote(e.target.value)}
          onBlur={() => {
            if ((note.trim() || null) !== (line.quoteNote ?? null)) onQuoteNote(line, note)
          }}
          placeholder="Link quote/invoice later"
          className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 disabled:opacity-50"
        />
      </label>
    </div>
  )
}

function LineTable({
  lines,
  showId,
  busy,
  onConfirmVenue,
  onChallenge,
  onSaveBand,
  onTogglePaid,
  onQuoteNote,
}: {
  lines: DecoratedSheetLine[]
  showId: string
  busy: boolean
  onConfirmVenue: (line: DecoratedSheetLine, amount: number) => void
  onChallenge: (line: DecoratedSheetLine, showId: string | null) => void
  onSaveBand: (line: DecoratedSheetLine, amount: number) => void
  onTogglePaid: (line: DecoratedSheetLine, paid: boolean) => void
  onQuoteNote: (line: DecoratedSheetLine, note: string) => void
}) {
  return (
    <div className="overflow-x-auto" data-testid={`settlements-sheet-table-${showId}`}>
      <table className="w-full min-w-[720px] text-sm">
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
              <td className={`py-2 px-3 text-right tabular-nums ${line.key === 'pre_dist_margin' || line.key === 'net_profit' || line.key === GST_QUARANTINE_KEY ? 'text-amber-300 font-semibold' : 'text-white'}`}>
                {fmtMoneyOrDash(line.expected, line.kind)}
              </td>
              <td className="py-2 pl-3 align-top">
                <Col3Cell
                  key={`${line.key}:${line.actual}:${line.actualPaid}:${line.actualStatus}`}
                  line={line}
                  showId={showId === 'run' ? null : showId}
                  busy={busy}
                  onConfirmVenue={onConfirmVenue}
                  onChallenge={onChallenge}
                  onSaveBand={onSaveBand}
                  onTogglePaid={onTogglePaid}
                  onQuoteNote={onQuoteNote}
                />
              </td>
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
  expectedSource = 'advancing',
  focusedShowId,
  insideFactors,
  remittanceKnownLines,
  gstKnownLines,
  actuals,
  challenges,
  bandCosts = [],
}: {
  run: { id: string; code: string; name: string; status: string; start_date: string | null; end_date: string | null; notes?: string | null }
  shows: SettlementShow[]
  liveFields: CostingSnapshotField[]
  expectedSource?: SettlementExpectedSource
  focusedShowId: string | null
  insideFactors: InsideFactorValues
  remittanceKnownLines: KnownInsideLine[]
  gstKnownLines?: KnownInsideLine[]
  actuals: SettlementActualLine[]
  challenges: RemittanceChallenge[]
  bandCosts?: BandCostLine[]
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
  const [challengeLine, setChallengeLine] = useState<{ line: DecoratedSheetLine; showId: string | null } | null>(null)
  const [challengeReason, setChallengeReason] = useState('')
  const [draftPreview, setDraftPreview] = useState<RemittanceChallenge | null>(null)

  const focusedShow = shows.find(s => s.id === focusedShowId) ?? null
  const gstLines = gstKnownLines ?? remittanceKnownLines
  const runModel = useMemo(
    () => buildRunSheet({
      shows,
      fields: liveFields,
      factors: insideFactors,
      remittanceLines: remittanceKnownLines,
      gstLines,
    }),
    [shows, liveFields, insideFactors, remittanceKnownLines, gstLines],
  )
  const col3Run = useMemo(
    () => applyCol3ToRunSheet({
      sections: runModel.sections,
      runLines: runModel.runLines,
      actuals,
      remittanceLines: gstLines,
    }),
    [runModel, actuals, gstLines],
  )
  const distributeGate = useMemo(
    () => distributeGateFromSources({
      fields: liveFields,
      wave1BandCosts: bandCosts,
      sheetBandActuals: actuals
        .filter(a => a.line_kind === 'band_cost')
        .map(a => ({ id: a.id, line_key: a.line_key, paid: a.paid, notes: a.notes })),
    }),
    [liveFields, bandCosts, actuals],
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

  async function upsertActual(opts: {
    line: DecoratedSheetLine
    showId: string | null
    amount: number
    paid?: boolean
    quote_note?: string | null
    source?: 'manual' | 'advancing_copy'
  }) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/sheet/actuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          show_id: opts.showId,
          line_key: opts.line.key,
          line_kind: opts.line.actualKind === 'band_cost' ? 'band_cost' : 'venue_settlement',
          amount: opts.amount,
          paid: opts.paid,
          quote_note: opts.quote_note,
          source: opts.source ?? 'manual',
          label: opts.line.label,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not save actual')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save actual')
    } finally {
      setBusy(false)
    }
  }

  async function createChallenge() {
    if (!challengeLine) return
    if (!challengeReason.trim()) {
      setError('A reason is required for a challenge draft')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const row = sheetLineToComparisonRow({
        line: challengeLine.line,
        showId: challengeLine.showId,
      })
      const res = await fetch(`/api/settlements/${run.id}/sheet/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: challengeReason.trim(),
          rows: [row],
          show_id: challengeLine.showId,
          actual_id: challengeLine.line.actualId,
          line_key: challengeLine.line.key,
          send: false,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not create challenge draft')
      setDraftPreview(body.challenge)
      setChallengeLine(null)
      setChallengeReason('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create challenge draft')
    } finally {
      setBusy(false)
    }
  }

  const tableHandlers = {
    busy,
    onConfirmVenue: (line: DecoratedSheetLine, amount: number) => {
      const showId = focusedShow?.id ?? runModel.sections.find(sec =>
        sec.lines.some(l => l.key === line.key),
      )?.show.id ?? null
      void upsertActual({ line, showId, amount })
    },
    onChallenge: (line: DecoratedSheetLine, showId: string | null) => {
      setDraftPreview(null)
      setChallengeLine({ line, showId })
    },
    onSaveBand: (line: DecoratedSheetLine, amount: number) => {
      void upsertActual({ line, showId: null, amount, source: 'manual' })
    },
    onTogglePaid: (line: DecoratedSheetLine, paid: boolean) => {
      const amount = line.actual ?? line.expected ?? 0
      void upsertActual({ line, showId: null, amount, paid, source: line.actualSource === 'advancing_copy' ? 'advancing_copy' : 'manual' })
    },
    onQuoteNote: (line: DecoratedSheetLine, note: string) => {
      const amount = line.actual ?? line.expected ?? 0
      void upsertActual({ line, showId: null, amount, quote_note: note, source: line.actualSource === 'advancing_copy' ? 'advancing_copy' : 'manual' })
    },
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
          <p className="text-slate-500 text-xs mt-2 max-w-2xl" data-testid="settlements-sheet-col2-note">
            {col2SourceNote(expectedSource)}
          </p>
          {isSettlementsDemoRun(run) && (
            <p
              className="text-teal-300/90 text-xs mt-2 max-w-2xl"
              data-testid="settlements-demo-banner"
            >
              {SETTLEMENTS_DEMO_BANNER}
            </p>
          )}
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-[11px] text-slate-500 max-w-2xl" data-testid="settlements-sheet-col3-note">{COL3_ACTUALS_NOTE}</p>
          </div>
          <p className="text-[11px] text-slate-600" data-testid="settlements-email-scrape-note">{EMAIL_SCRAPE_INGEST_NOTE}</p>
          <p className="text-[11px] text-slate-600">{SHEET_BAND_PAID_HELP}</p>
          <p className="text-[11px] text-slate-600" data-testid="sheet-smart-match-note">{SMART_MATCH_NOTE}</p>

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
                  gstLines,
                  includeRunCosts: true,
                })
              : runModel.sections.find(sec => sec.show.id === show.id)!
            const rawLines = focusedShow ? built.lines : built.lines.filter(l => l.group !== 'run_costs' || l.key === 'run:social_ads_var')
            const lines = applyCol3Actuals({ lines: rawLines, actuals, showId: show.id, remittanceLines: gstLines })
            const showExpected = pnlFromSheetSides({
              netRevenueExpected: lines.find(l => l.key === 'net_revenue')?.expected ?? null,
              netRevenueActual: lines.find(l => l.key === 'net_revenue')?.actual ?? null,
              totalCostsExpected: lines.find(l => l.key === 'total_costs')?.expected ?? null,
              totalCostsActual: lines.find(l => l.key === 'total_costs')?.actual ?? null,
              remittanceLines: gstLines,
              showId: show.id,
            })
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
                <LineTable
                  lines={lines}
                  showId={show.id}
                  {...tableHandlers}
                  onConfirmVenue={(line, amount) => void upsertActual({ line, showId: show.id, amount })}
                  onChallenge={(line) => {
                    setDraftPreview(null)
                    setChallengeLine({ line, showId: show.id })
                  }}
                  onSaveBand={(line, amount) => {
                    const sid = line.key.startsWith('run:') ? null : show.id
                    void upsertActual({ line, showId: sid, amount, source: 'manual' })
                  }}
                  onTogglePaid={(line, paid) => {
                    const sid = line.key.startsWith('run:') ? null : show.id
                    void upsertActual({
                      line,
                      showId: sid,
                      amount: line.actual ?? line.expected ?? 0,
                      paid,
                      source: line.actualSource === 'advancing_copy' ? 'advancing_copy' : 'manual',
                    })
                  }}
                  onQuoteNote={(line, note) => {
                    const sid = line.key.startsWith('run:') ? null : show.id
                    void upsertActual({
                      line,
                      showId: sid,
                      amount: line.actual ?? line.expected ?? 0,
                      quote_note: note,
                      source: line.actualSource === 'advancing_copy' ? 'advancing_copy' : 'manual',
                    })
                  }}
                />
                {focusedShow && (
                  <DualPnlBlock expected={showExpected.expected} actual={showExpected.actual} />
                )}
              </section>
            )
          })}

          {!focusedShow && (
            <section className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3" data-testid="settlements-sheet-run-costs">
              <h2 className="text-white font-semibold">{ADVANCING_COSTS_LABEL}</h2>
              <LineTable
                lines={col3Run.runLines}
                showId="run"
                {...tableHandlers}
                onSaveBand={(line, amount) => void upsertActual({ line, showId: null, amount, source: 'manual' })}
                onTogglePaid={(line, paid) => void upsertActual({
                  line,
                  showId: null,
                  amount: line.actual ?? line.expected ?? 0,
                  paid,
                  source: line.actualSource === 'advancing_copy' ? 'advancing_copy' : 'manual',
                })}
                onQuoteNote={(line, note) => void upsertActual({
                  line,
                  showId: null,
                  amount: line.actual ?? line.expected ?? 0,
                  quote_note: note,
                  source: line.actualSource === 'advancing_copy' ? 'advancing_copy' : 'manual',
                })}
              />
            </section>
          )}

          {!focusedShow && (
            <DualPnlBlock expected={runModel.summary} actual={col3Run.actualSummary} />
          )}

          <DistributeGateBlock
            runId={run.id}
            gate={distributeGate}
            busy={busy}
            onBusy={setBusy}
            onError={setError}
          />

          {challengeLine && (
            <section className="bg-slate-800 rounded-xl border border-amber-800/50 p-4 space-y-3" data-testid="sheet-challenge-panel">
              <h2 className="text-white font-semibold">Challenge {challengeLine.line.label}</h2>
              <p className="text-slate-500 text-xs">{SHEET_CHALLENGE_NEVER_SEND_NOTE}</p>
              <textarea
                data-testid="sheet-challenge-reason"
                value={challengeReason}
                onChange={e => setChallengeReason(e.target.value)}
                rows={3}
                placeholder="Reason (required)"
                className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="sheet-create-challenge-draft"
                  disabled={busy}
                  onClick={() => void createChallenge()}
                  className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
                >
                  Create challenge draft (not sent)
                </button>
                <button
                  type="button"
                  onClick={() => setChallengeLine(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </section>
          )}

          {draftPreview && (
            <section data-testid="sheet-challenge-draft-preview" className="bg-slate-900 rounded-xl border border-amber-800/50 p-4 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-amber-400">Draft only — not sent</div>
              <div className="text-slate-400 text-xs">To: {draftPreview.to_label}</div>
              <div className="text-white text-sm font-semibold">{draftPreview.subject}</div>
              <pre className="text-slate-300 text-xs whitespace-pre-wrap font-sans">{draftPreview.body}</pre>
            </section>
          )}

          {challenges.length > 0 && !draftPreview && (
            <section className="bg-slate-800 rounded-xl border border-slate-700 p-4" data-testid="sheet-saved-drafts">
              <h2 className="text-white font-semibold mb-2">Saved drafts</h2>
              <ul className="space-y-2">
                {challenges.map(d => (
                  <li key={d.id} className="text-sm text-slate-300">
                    <button type="button" className="text-amber-400 hover:underline" onClick={() => setDraftPreview(d)}>
                      {d.subject}
                    </button>
                    <span className="text-slate-600 text-xs ml-2">{d.sent_at ? 'SENT' : 'not sent'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
