'use client'

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateAU, formatDateShortAU } from '@/lib/dates'
import { SETTLEMENTS_MODULE_LABEL, formatSettlementsMoney, type BandCostLine } from '@/lib/settlements'
import type { CostingSnapshotField } from '@/lib/settlements'
import type { SettlementShow } from '@/lib/settlements-load'
import type { RemittanceChallenge, RemittanceLine } from '@/lib/remittance'
import {
  COL2_LIVE_ADVANCING_NOTE,
  PRE_SHOW_BLOCK_COPY,
  PRE_SHOW_STAKEHOLDER_NOTE,
  SETTLEMENTS_DEMO_BANNER,
  TICKETS_SOLD_HELP,
  TICKETS_SOLD_LABEL,
  buildRunSheet,
  col2SourceNote,
  isSettlementsDemoRun,
  settlementSheetHref,
  type SettlementExpectedSource,
} from '@/lib/settlements-sheet'
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
  EMAIL_SCRAPE_INGEST_NOTE,
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
import type { InsideFactorValues, KnownInsideLine } from '@/lib/pnl-run-costing'
import {
  ADVANCING_COSTS_LABEL,
  V3_COL_ACTUAL,
  V3_COL_DELTA,
  V3_COL_EXPECTED,
  V3_COL_LINE,
  V3_HEADING,
  buildV3RunModel,
  v3SectionMeta,
  type V3RollupRow,
  type V3SectionId,
  type V3ShowModel,
} from '@/lib/settlements-v3'
import { buildV3RedFlags, formatV3NigelAssessment, prominentFlags } from '@/lib/settlements-v3-flags'
import {
  ASSESSMENT_CHAT_NOTE,
  ASSESSMENT_DRAFT_NEVER_SEND,
  MICHAEL_FACTCHECK_FROM,
  defaultDraftKindFromFlags,
  type AssessmentDraftKind,
  type SettlementAssessmentMessage,
} from '@/lib/settlements-v3-assessment'
import SettlementsTabBar from './SettlementsTabBar'

function hireActualConfirmed(row: V3RollupRow): boolean {
  return row.children.some(child => {
    const source = child.sheetLine?.actualSource
    return child.sheetLine?.actualStatus === 'confirmed'
      && (source === 'manual' || source === 'harbour_fixture' || source === 'email_scrape')
  })
}

function fmtMoneyOrDash(value: number | null | undefined, kind: 'count' | 'money' = 'money'): string {
  if (value == null) return '—'
  if (kind === 'count') return value.toLocaleString('en-AU')
  return formatSettlementsMoney(value)
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
    <div data-testid="distribute-gate" data-ready={gate.ready ? 'true' : 'false'} className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{DISTRIBUTE_GATE_LABEL}</div>
      <p className="text-slate-300 text-sm" data-testid="distribute-gate-rule">{DISTRIBUTE_GATE_RULE}</p>
      <p data-testid="distribute-gate-summary" className={`text-xs ${gate.ready ? 'text-teal-300' : 'text-orange-300'}`}>
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
      {result && <p className="text-teal-300 text-xs" data-testid="distribute-stub-note">{result}</p>}
    </div>
  )
}

function ChildActions({
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
  onConfirmVenue: (line: DecoratedSheetLine, amount: number, showId: string | null) => void
  onChallenge: (line: DecoratedSheetLine, showId: string | null) => void
  onSaveBand: (line: DecoratedSheetLine, amount: number, showId: string | null) => void
  onTogglePaid: (line: DecoratedSheetLine, paid: boolean, showId: string | null) => void
  onQuoteNote: (line: DecoratedSheetLine, note: string, showId: string | null) => void
}) {
  const [draft, setDraft] = useState(line.actual == null ? '' : String(line.actual))
  const [note, setNote] = useState(line.quoteNote ?? '')
  const locked = isBandCostLine(line) && !canEditSheetBandActual(line.actualPaid)

  if (isVenueSettlementLine(line) && line.group === 'venue_costs') {
    return (
      <div className="flex flex-wrap justify-end items-center gap-1" data-testid={`sheet-actual-${line.key}`}>
        {line.actual == null ? (
          <>
            <input
              type="number"
              step={0.01}
              min={0}
              value={draft}
              disabled={busy}
              onChange={e => setDraft(e.target.value)}
              data-testid={`sheet-actual-input-${line.key}`}
              className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right"
            />
            <button
              type="button"
              disabled={busy || draft === ''}
              data-testid={`sheet-actual-confirm-${line.key}`}
              onClick={() => onConfirmVenue(line, Number(draft), showId)}
              className="text-[10px] font-semibold px-2 py-1 rounded bg-teal-900/50 text-teal-300 border border-teal-800 disabled:opacity-40"
            >
              Confirm
            </button>
          </>
        ) : (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-teal-900/40 text-teal-300 border-teal-800" data-testid={`sheet-actual-status-${line.key}`}>
            {line.actualStatus === 'challenged' ? VENUE_CHALLENGED_LABEL : VENUE_CONFIRMED_LABEL}
          </span>
        )}
        {line.actual != null && (
          <button
            type="button"
            disabled={busy}
            data-testid={`sheet-challenge-${line.key}`}
            onClick={() => onChallenge(line, showId)}
            className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-600 text-slate-400 hover:text-amber-300"
          >
            {CHALLENGE_BUTTON_LABEL} line
          </button>
        )}
      </div>
    )
  }

  if (isBandCostLine(line)) {
    return (
      <div className="space-y-1 text-right" data-testid={`sheet-actual-${line.key}`}>
        <div className="flex justify-end items-center gap-1">
          <input
            type="number"
            step={0.01}
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
            onClick={() => onSaveBand(line, Number(draft), showId)}
            className="text-[10px] font-semibold px-2 py-1 rounded bg-slate-700 text-slate-200 disabled:opacity-40"
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
            <button type="button" disabled={busy} data-testid={`sheet-band-reopen-${line.key}`} onClick={() => onTogglePaid(line, false, showId)} className="text-[10px] text-slate-500">
              Reopen
            </button>
          ) : (
            <button type="button" disabled={busy} data-testid={`sheet-band-paid-btn-${line.key}`} onClick={() => onTogglePaid(line, true, showId)} className="text-[10px] font-semibold text-teal-300">
              Mark PAID
            </button>
          )}
        </div>
        <input
          type="text"
          value={note}
          disabled={busy || locked}
          data-testid={`sheet-band-quote-${line.key}`}
          onChange={e => setNote(e.target.value)}
          onBlur={() => {
            if ((note.trim() || null) !== (line.quoteNote ?? null)) onQuoteNote(line, note, showId)
          }}
          placeholder={quoteInvoiceStubLabel()}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 disabled:opacity-50"
        />
      </div>
    )
  }
  return null
}

function RollupTable({
  rows,
  expanded,
  onToggle,
  busy,
  childHandlers,
  compareChrome = true,
}: {
  rows: V3RollupRow[]
  expanded: Set<string>
  onToggle: (key: string) => void
  busy: boolean
  compareChrome?: boolean
  childHandlers: {
    onConfirmVenue: (line: DecoratedSheetLine, amount: number, showId: string | null) => void
    onChallenge: (line: DecoratedSheetLine, showId: string | null) => void
    onSaveBand: (line: DecoratedSheetLine, amount: number, showId: string | null) => void
    onTogglePaid: (line: DecoratedSheetLine, paid: boolean, showId: string | null) => void
    onQuoteNote: (line: DecoratedSheetLine, note: string, showId: string | null) => void
  }
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500">
            <th className="text-left font-semibold pb-2 pr-3" data-testid="settlements-sheet-col1">{V3_COL_LINE}</th>
            {compareChrome ? (
              <>
                <th className="text-right font-semibold pb-2 px-3" data-testid="settlements-sheet-col2">{V3_COL_EXPECTED}</th>
                <th className="text-right font-semibold pb-2 px-3" data-testid="settlements-sheet-col3">{V3_COL_ACTUAL}</th>
                <th className="text-right font-semibold pb-2 pl-3">{V3_COL_DELTA}</th>
              </>
            ) : (
              <>
                <th className="text-right font-semibold pb-2 px-3" data-testid="settlements-sheet-advancing-costs">{ADVANCING_COSTS_LABEL}</th>
                <th className="text-right font-semibold pb-2 pl-3">Status</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const open = expanded.has(row.key)
            const canExpand = row.children.length > 0
            const advancingAmount = row.expected ?? row.actual
            return (
              <Fragment key={row.key}>
                <tr
                  className={`border-t border-slate-800 ${row.highlight ? 'bg-slate-900/50' : ''}`}
                  data-testid={row.testId ?? `v3-row-${row.key}`}
                >
                  <td className="py-2 pr-3 text-slate-300">
                    <button
                      type="button"
                      disabled={!canExpand}
                      data-testid={`v3-expand-${row.key}`}
                      onClick={() => canExpand && onToggle(row.key)}
                      className={`inline-flex items-center gap-1.5 ${canExpand ? 'text-left hover:text-white' : ''}`}
                    >
                      <span className="text-slate-600 w-3">{canExpand ? (open ? '▼' : '▶') : '·'}</span>
                      <span className={row.highlight ? 'text-amber-300 font-semibold' : ''}>{row.label}</span>
                    </button>
                    {row.note ? <span className="block text-[10px] text-slate-600 font-normal pl-5">{row.note}</span> : null}
                  </td>
                  {compareChrome ? (
                    <>
                      <td className={`py-2 px-3 text-right tabular-nums ${row.highlight ? 'text-amber-300 font-semibold' : 'text-white'}`}>
                        {fmtMoneyOrDash(row.expected, row.kind)}
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums ${row.highlight ? 'text-teal-300 font-semibold' : 'text-white'}`} data-testid={row.key === 'hire' ? 'sheet-actual-show:venue_hire' : undefined}>
                        {fmtMoneyOrDash(row.actual, row.kind)}
                        {row.key === 'hire' && hireActualConfirmed(row) && (
                          <div className="text-[10px] text-teal-400" data-testid="sheet-actual-status-show:venue_hire">{VENUE_CONFIRMED_LABEL}</div>
                        )}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-slate-400" data-testid={row.delta && row.delta !== 0 ? `sheet-variance-${row.key === 'hire' ? 'show:venue_hire' : row.key}` : undefined}>
                        {row.delta == null || row.delta === 0 ? '—' : `${row.delta > 0 ? '+' : ''}${fmtMoneyOrDash(row.delta, row.kind)}`}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={`py-2 px-3 text-right tabular-nums ${row.highlight ? 'text-amber-300 font-semibold' : 'text-white'}`}>
                        {fmtMoneyOrDash(advancingAmount, row.kind)}
                      </td>
                      <td className="py-2 pl-3 text-right text-[10px] text-slate-500">
                        {row.key === 'band_costs' ? 'from Advancing' : ''}
                      </td>
                    </>
                  )}
                </tr>
                {open && row.children.map(child => (
                  <tr key={child.key} className="border-t border-slate-800/60 bg-slate-900/30" data-testid={`sheet-rollup-child-${child.key}`}>
                    <td className="py-1.5 pr-3 pl-8 text-[12px] text-slate-400">
                      {child.label}
                      {child.note ? <span className="block text-[10px] text-slate-600">{child.note}</span> : null}
                    </td>
                    {compareChrome ? (
                      <>
                        <td className="py-1.5 px-3 text-right text-[12px] tabular-nums text-slate-300">{fmtMoneyOrDash(child.expected)}</td>
                        <td className="py-1.5 px-3 text-right text-[12px] tabular-nums text-slate-200">{fmtMoneyOrDash(child.actual)}</td>
                      </>
                    ) : (
                      <td className="py-1.5 px-3 text-right text-[12px] tabular-nums text-slate-200">
                        {fmtMoneyOrDash(child.expected ?? child.actual)}
                      </td>
                    )}
                    <td className="py-1.5 pl-3 align-top">
                      {child.sheetLine && (
                        <ChildActions
                          key={`${child.sheetLine.key}:${child.showId ?? ''}:${child.sheetLine.actual}:${child.sheetLine.actualPaid}`}
                          line={child.sheetLine}
                          showId={child.showId ?? null}
                          busy={busy}
                          {...childHandlers}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SectionCard({
  id,
  rows,
  extra,
  expanded,
  onToggle,
  busy,
  childHandlers,
}: {
  id: V3SectionId
  rows: V3RollupRow[]
  extra?: ReactNode
  expanded: Set<string>
  onToggle: (key: string) => void
  busy: boolean
  childHandlers: Parameters<typeof RollupTable>[0]['childHandlers']
}) {
  const meta = v3SectionMeta(id)
  return (
    <section className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3" data-testid={meta.testId}>
      <div>
        <h2 className="text-white font-semibold">{meta.title}</h2>
        <p className="text-[11px] text-slate-500 mt-1">{meta.note}</p>
      </div>
      <RollupTable
        rows={rows}
        expanded={expanded}
        onToggle={onToggle}
        busy={busy}
        childHandlers={childHandlers}
        compareChrome={id !== 3}
      />
      {extra}
    </section>
  )
}

export default function SettlementV3Client({
  run,
  shows,
  liveFields,
  expectedSource = 'advancing',
  focusedShowId,
  insideFactors,
  remittanceKnownLines,
  gstKnownLines,
  remittanceLines = [],
  actuals,
  challenges,
  bandCosts = [],
  assessmentMessages = [],
}: {
  run: { id: string; code: string; name: string; status: string; start_date: string | null; end_date: string | null; notes?: string | null }
  shows: SettlementShow[]
  liveFields: CostingSnapshotField[]
  expectedSource?: SettlementExpectedSource
  focusedShowId: string | null
  insideFactors: InsideFactorValues
  remittanceKnownLines: KnownInsideLine[]
  gstKnownLines?: KnownInsideLine[]
  remittanceLines?: RemittanceLine[]
  actuals: SettlementActualLine[]
  challenges: RemittanceChallenge[]
  bandCosts?: BandCostLine[]
  assessmentMessages?: SettlementAssessmentMessage[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['hire', 'marketing', 'band_costs']))
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
  const [chatBody, setChatBody] = useState('')

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

  const displayShows: SettlementShow[] = shows.filter(s => runModel.occurred.some(o => o.id === s.id))
  const focusedBlocked = runModel.blocked

  const model = useMemo(() => {
    const showSheets = displayShows.map(show => {
      const built = runModel.sections.find(sec => sec.show.id === show.id)
      const rawLines = (built?.lines ?? []).filter(l => l.group !== 'run_costs')
      const lines = applyCol3Actuals({ lines: rawLines, actuals, showId: show.id, remittanceLines: gstLines })
      return { show, lines }
    })
    return buildV3RunModel({
      shows: displayShows,
      showSheets,
      runLines: col3Run.runLines,
      fields: liveFields,
      actuals,
      remittanceLines,
      gstLines,
    })
  }, [displayShows, liveFields, gstLines, runModel, actuals, col3Run.runLines, remittanceLines])

  const flags = buildV3RedFlags(model)
  const nigel = formatV3NigelAssessment({
    runCode: run.code,
    venueName: run.name,
    model,
    flags,
  })

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
      const row = sheetLineToComparisonRow({ line: challengeLine.line, showId: challengeLine.showId })
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

  async function postComment() {
    if (!chatBody.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/assessment/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: chatBody.trim(), show_id: focusedShowId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not save comment')
      setChatBody('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save comment')
    } finally {
      setBusy(false)
    }
  }

  async function draftEmail(kind: AssessmentDraftKind) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/assessment/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          show_id: null,
          send: false,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not draft email')
      setDraftPreview(body.challenge)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft email')
    } finally {
      setBusy(false)
    }
  }

  const childHandlers = {
    onConfirmVenue: (line: DecoratedSheetLine, amount: number, showId: string | null) => {
      void upsertActual({ line, showId: line.key.startsWith('run:') ? null : showId, amount })
    },
    onChallenge: (line: DecoratedSheetLine, showId: string | null) => {
      setDraftPreview(null)
      setChallengeLine({ line, showId: line.key.startsWith('run:') ? null : showId })
    },
    onSaveBand: (line: DecoratedSheetLine, amount: number, showId: string | null) => {
      void upsertActual({ line, showId: line.key.startsWith('run:') ? null : showId, amount, source: 'manual' })
    },
    onTogglePaid: (line: DecoratedSheetLine, paid: boolean, showId: string | null) => {
      void upsertActual({
        line,
        showId: line.key.startsWith('run:') ? null : showId,
        amount: line.actual ?? line.expected ?? 0,
        paid,
        source: line.actualSource === 'advancing_copy' ? 'advancing_copy' : 'manual',
      })
    },
    onQuoteNote: (line: DecoratedSheetLine, note: string, showId: string | null) => {
      void upsertActual({
        line,
        showId: line.key.startsWith('run:') ? null : showId,
        amount: line.actual ?? line.expected ?? 0,
        quote_note: note,
        source: line.actualSource === 'advancing_copy' ? 'advancing_copy' : 'manual',
      })
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
              {V3_HEADING}
            </span>
          </div>
          <h1 className="text-white text-2xl font-bold">{run.name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {formatDateAU(run.start_date)}{run.start_date !== run.end_date ? ` – ${formatDateAU(run.end_date)}` : ''}
            {displayShows.length > 1 ? ` · ${displayShows.length} shows on this run` : ''}
          </p>
          <p className="text-slate-500 text-xs mt-2 max-w-2xl" data-testid="settlements-sheet-col2-note">
            {col2SourceNote(expectedSource)} Expected is Advancing. {COL2_LIVE_ADVANCING_NOTE}
          </p>
          {isSettlementsDemoRun(run) && (
            <p className="text-teal-300/90 text-xs mt-2 max-w-2xl" data-testid="settlements-demo-banner">
              {SETTLEMENTS_DEMO_BANNER}
            </p>
          )}
        </div>
      </div>

      <SettlementsTabBar runCode={run.code} showId={null} active="sheet" />

      {shows.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4" data-testid="settlements-run-venues">
          <span className="px-2.5 py-1 rounded-md text-xs border bg-amber-400/10 text-amber-400 border-amber-700">
            Run settlement
          </span>
          {shows.map(show => (
            <a
              key={show.id}
              href={`#venue-${show.id}`}
              className={`px-2.5 py-1 rounded-md text-xs border ${focusedShowId === show.id ? 'bg-slate-700 text-white border-slate-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
            >
              {show.venue_name}
              <span className="text-slate-600 ml-1">{formatDateShortAU(show.show_date)}</span>
            </a>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900 text-red-300 text-sm">{error}</div>
      )}

      {focusedBlocked ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center" data-testid="settlements-sheet-pre-show">
          <p className="text-white font-semibold">{PRE_SHOW_BLOCK_COPY}</p>
          <p className="text-slate-400 text-sm mt-2">{PRE_SHOW_STAKEHOLDER_NOTE}</p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="settlements-sheet">
          <section className="bg-slate-800 rounded-xl border border-red-900/40 p-4 space-y-3" data-testid="settlements-v3-assessment">
            <h2 className="text-white font-semibold">Nigel assessment</h2>
            <p className="text-slate-300 text-sm leading-relaxed" data-testid="v3-nigel-assessment">{nigel}</p>
            <div data-testid="settlements-v3-red-flags" className="space-y-1.5">
              {prominentFlags(flags).length === 0 ? (
                <p className="text-slate-500 text-xs">No prominent red flags on Expected vs Actual venue buckets.</p>
              ) : prominentFlags(flags).map(flag => (
                <div
                  key={flag.code}
                  data-testid={`v3-flag-${flag.code}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    flag.severity === 'hard'
                      ? 'border-red-700 bg-red-950/40 text-red-200'
                      : 'border-orange-800 bg-orange-950/30 text-orange-200'
                  }`}
                >
                  <span className="font-semibold">{flag.title}</span>
                  <span className="block text-xs opacity-80 mt-0.5">{flag.detail}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2" data-testid="settlements-v3-chat">
              <h3 className="text-slate-200 text-sm font-semibold">Assessment chat</h3>
              <p className="text-[11px] text-slate-500">{ASSESSMENT_CHAT_NOTE}</p>
              <ul className="space-y-1.5">
                {assessmentMessages.map(msg => (
                  <li key={msg.id} className="text-sm text-slate-300 bg-slate-900/50 rounded-lg px-3 py-2">
                    <span className="text-amber-400 text-xs font-semibold">{msg.author_name}</span>
                    <span className="block">{msg.body}</span>
                  </li>
                ))}
              </ul>
              <textarea
                data-testid="v3-chat-input"
                value={chatBody}
                onChange={e => setChatBody(e.target.value)}
                rows={2}
                placeholder="Gareth comment…"
                className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600"
              />
              <button
                type="button"
                disabled={busy || !chatBody.trim()}
                data-testid="v3-chat-post"
                onClick={() => void postComment()}
                className="text-xs font-semibold px-3 py-1.5 rounded bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-40"
              >
                Add comment
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                data-testid="v3-draft-harbour"
                onClick={() => void draftEmail(defaultDraftKindFromFlags(flags))}
                className="text-xs font-semibold px-3 py-1.5 rounded border border-amber-800 text-amber-300 hover:bg-amber-900/30 disabled:opacity-40"
              >
                Draft Harbour {defaultDraftKindFromFlags(flags) === 'harbour_challenge' ? 'challenge' : 'accept'}
              </button>
              <button
                type="button"
                disabled={busy}
                data-testid="v3-draft-michael"
                onClick={() => void draftEmail('michael_factcheck')}
                className="text-xs font-semibold px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Draft Michael fact-check
              </button>
            </div>
            <p className="text-[11px] text-slate-600">{ASSESSMENT_DRAFT_NEVER_SEND}</p>
          </section>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-[11px] text-slate-500 max-w-2xl" data-testid="settlements-sheet-col3-note">
              Venue settlement figures enter as confirmed from settlement / remittance email attachments. Assessment-thread drafts are the primary Harbour / Michael path (never auto-sent). Per-line challenge is optional and secondary.
            </p>
          </div>
          <p className="text-[11px] text-slate-600" data-testid="settlements-email-scrape-note">{EMAIL_SCRAPE_INGEST_NOTE}</p>

          <RunV3Blocks
            shows={displayShows}
            model={model}
            draftTickets={draftTickets}
            onTickets={(showId, v) => setDraftTickets(prev => ({ ...prev, [showId]: v }))}
            onSaveTickets={showId => void saveTickets(showId)}
            busy={busy}
            expanded={expanded}
            onToggle={toggle}
            childHandlers={childHandlers}
            gate={distributeGate}
            runId={run.id}
            onBusy={setBusy}
            onError={setError}
          />

          {challengeLine && (
            <section className="bg-slate-800 rounded-xl border border-amber-800/50 p-4 space-y-3" data-testid="sheet-challenge-panel">
              <h2 className="text-white font-semibold">Challenge {challengeLine.line.label} (secondary)</h2>
              <p className="text-slate-500 text-xs">{SHEET_CHALLENGE_NEVER_SEND_NOTE}</p>
              <textarea
                data-testid="sheet-challenge-reason"
                value={challengeReason}
                onChange={e => setChallengeReason(e.target.value)}
                rows={3}
                placeholder="Reason (required)"
                className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="sheet-create-challenge-draft"
                  disabled={busy}
                  onClick={() => void createChallenge()}
                  className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-50"
                >
                  Create challenge draft (not sent)
                </button>
                <button type="button" onClick={() => setChallengeLine(null)} className="text-xs text-slate-400">Cancel</button>
              </div>
            </section>
          )}

          {draftPreview && (
            <section data-testid="sheet-challenge-draft-preview" className="bg-slate-900 rounded-xl border border-amber-800/50 p-4 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-amber-400">Draft only — not sent</div>
              {/Nigel \(tours@\)/i.test(draftPreview.body) && (
                <div className="text-slate-400 text-xs">From: {MICHAEL_FACTCHECK_FROM}</div>
              )}
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

function RunV3Blocks({
  shows,
  model,
  draftTickets,
  onTickets,
  onSaveTickets,
  busy,
  expanded,
  onToggle,
  childHandlers,
  gate,
  runId,
  onBusy,
  onError,
}: {
  shows: SettlementShow[]
  model: V3ShowModel
  draftTickets: Record<string, string>
  onTickets: (showId: string, v: string) => void
  onSaveTickets: (showId: string) => void
  busy: boolean
  expanded: Set<string>
  onToggle: (key: string) => void
  childHandlers: Parameters<typeof RollupTable>[0]['childHandlers']
  gate: ReturnType<typeof distributeGateFromSources>
  runId: string
  onBusy: (v: boolean) => void
  onError: (msg: string | null) => void
}) {
  return (
    <div className="space-y-4" data-testid="settlements-run-grain">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
        <div>
          <h2 className="text-white font-semibold">Shows on this run</h2>
          <p className="text-[11px] text-slate-500 mt-1">
            One settlement covers every show. Ticket counts stay per venue; hire / staff / marketing / AV roll into the run.
          </p>
        </div>
        <ul className="space-y-3">
          {shows.map(show => (
            <li key={show.id} id={`venue-${show.id}`} className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-slate-200 text-sm">{show.venue_name}</div>
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
                  onSaveTickets(show.id)
                }}
              >
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {TICKETS_SOLD_LABEL}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draftTickets[show.id] ?? ''}
                    onChange={e => onTickets(show.id, e.target.value)}
                    data-testid={`sheet-tickets-input-${show.id}`}
                    className="mt-1 block w-28 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                  />
                </label>
                <button type="submit" disabled={busy} data-testid={`sheet-tickets-save-${show.id}`} className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-50">
                  {busy ? 'Saving…' : 'Save count'}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-600">{TICKETS_SOLD_HELP}</p>
      </div>

      <SectionCard id={1} rows={model.section1} expanded={expanded} onToggle={onToggle} busy={busy} childHandlers={childHandlers} />
      <SectionCard id={2} rows={model.section2} expanded={expanded} onToggle={onToggle} busy={busy} childHandlers={childHandlers} />
      <SectionCard
        id={3}
        rows={model.section3}
        expanded={expanded}
        onToggle={onToggle}
        busy={busy}
        childHandlers={childHandlers}
      />
      <SectionCard
        id={4}
        rows={model.section4}
        expanded={expanded}
        onToggle={onToggle}
        busy={busy}
        childHandlers={childHandlers}
        extra={(
          <DistributeGateBlock runId={runId} gate={gate} busy={busy} onBusy={onBusy} onError={onError} />
        )}
      />
    </div>
  )
}
