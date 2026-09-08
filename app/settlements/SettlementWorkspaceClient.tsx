'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateAU, formatDateShortAU, formatDateTimeAU } from '@/lib/dates'
import { NOTES_INPUT_LABEL, NOTES_SOURCE_OF_DATA_LABEL } from '@/lib/cost-entry-source'
import {
  AGENT_SETTLEMENT_EMPTY_NOTE,
  BAND_COSTS_HELP,
  CLOSE_GATE_LABEL,
  CLOSE_GATE_RULE,
  FINALISE_CONTROL_LABEL,
  FINALISE_LOCK_NOTE,
  NUDGE_STUB_NOTE,
  SETTLEMENT_PROPOSED_NOTE,
  SETTLEMENTS_MODULE_LABEL,
  bandCostCloseGate,
  shouldShowAgentSettlementEmptyCopy,
  fieldsForShow,
  formatSettlementsMoney,
  isCostingFinalised,
  snapshotFieldTotal,
  type BandCostLine,
  type CostingSnapshotField,
  type RunSettlementRow,
} from '@/lib/settlements'
import type { AgentSettlementLine } from '@/lib/remittance'
import type { SettlementActualLine } from '@/lib/settlements-sheet-actuals'
import { wave1SettlementHref } from '@/lib/settlements-sheet'
import QuoteInvoiceStub from '@/components/QuoteInvoiceStub'
import SettlementsTabBar from './SettlementsTabBar'
import {
  DISTRIBUTE_BLOCKED_NOTE,
  DISTRIBUTE_CONTROL_LABEL,
  DISTRIBUTE_GATE_LABEL,
  DISTRIBUTE_GATE_RULE,
  DISTRIBUTE_STUB_NOTE,
  distributeGateFromSources,
} from '@/lib/settlements-distribute-gate'

type Show = {
  id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  show_order: number
}

const STATE_STYLES: Record<string, string> = {
  known: 'bg-green-900/30 text-green-400 border-green-800',
  estimated: 'bg-orange-900/30 text-orange-400 border-orange-800',
  guess: 'bg-red-900/30 text-red-400 border-red-800',
  pending: 'bg-red-900/20 text-red-400 border-red-900',
  figures_needed: 'bg-red-900/20 text-red-400 border-red-900',
  auto_calc: 'bg-slate-800/60 text-slate-400 border-slate-700',
}

const STATE_LABEL: Record<string, string> = {
  known: 'CONFIRMED',
  estimated: 'ESTIMATE',
  guess: 'GUESS',
  pending: 'FIGURES NEEDED',
  figures_needed: 'FIGURES NEEDED',
  auto_calc: 'AUTO CALC',
}

export default function SettlementWorkspaceClient({
  run,
  shows,
  liveFields,
  settlement,
  bandCosts,
  focusedShowId,
  agentSettlementLines = [],
  actuals = [],
}: {
  run: { id: string; code: string; name: string; status: string; start_date: string | null; end_date: string | null }
  shows: Show[]
  liveFields: CostingSnapshotField[]
  settlement: RunSettlementRow | null
  bandCosts: BandCostLine[]
  focusedShowId: string | null
  agentSettlementLines?: AgentSettlementLine[]
  actuals?: SettlementActualLine[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmFinalise, setConfirmFinalise] = useState(false)
  const [lines, setLines] = useState(bandCosts)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [quoteNote, setQuoteNote] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [lineShowId, setLineShowId] = useState(focusedShowId ?? '')
  const [agentLines, setAgentLines] = useState(agentSettlementLines)
  const [agentDesc, setAgentDesc] = useState('')
  const [agentAmount, setAgentAmount] = useState('')
  const [agentShowId, setAgentShowId] = useState(focusedShowId ?? '')
  const [distResult, setDistResult] = useState<string | null>(null)

  const finalised = isCostingFinalised(settlement)
  const snapshotFields = settlement?.costing_snapshot?.fields ?? []
  const leftFields = fieldsForShow(finalised ? snapshotFields : liveFields, focusedShowId)
  const focusedShow = shows.find(s => s.id === focusedShowId) ?? null
  const gate = bandCostCloseGate(lines)
  const distGate = useMemo(
    () => distributeGateFromSources({
      fields: liveFields,
      wave1BandCosts: lines,
      sheetBandActuals: actuals
        .filter(a => a.line_kind === 'band_cost')
        .map(a => ({ id: a.id, line_key: a.line_key, paid: a.paid, notes: a.notes })),
    }),
    [liveFields, lines, actuals],
  )

  const showGroups = useMemo(() => {
    const groups: { key: string; title: string; fields: CostingSnapshotField[] }[] = []
    if (focusedShow) {
      groups.push({
        key: focusedShow.id,
        title: focusedShow.venue_name,
        fields: leftFields.filter(f => f.show_id === focusedShow.id),
      })
    } else {
      for (const show of shows) {
        const fields = leftFields.filter(f => f.show_id === show.id)
        if (fields.length) groups.push({ key: show.id, title: show.venue_name, fields })
      }
    }
    const runLevel = leftFields.filter(f => f.show_id == null)
    if (runLevel.length) groups.push({ key: 'run', title: 'Run-level costing', fields: runLevel })
    return groups
  }, [focusedShow, leftFields, shows])

  async function finalise() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/finalise`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not finalise')
      setConfirmFinalise(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finalise')
    } finally {
      setBusy(false)
    }
  }

  async function addBandCost() {
    const description = desc.trim()
    if (!description) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/band-costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          amount: Number(amount) || 0,
          notes: notes.trim(),
          quote_note: quoteNote.trim(),
          show_id: lineShowId || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not add band cost')
      let line = body.line as BandCostLine
      if (pendingFile) {
        line = await attachToLine(line, pendingFile)
      }
      setLines(prev => [...prev, line])
      setDesc('')
      setAmount('')
      setNotes('')
      setQuoteNote('')
      setPendingFile(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add band cost')
    } finally {
      setBusy(false)
    }
  }

  async function patchLine(line: BandCostLine, payload: Record<string, unknown>): Promise<BandCostLine> {
    const res = await fetch(`/api/settlements/${run.id}/band-costs/${line.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'Could not update band cost')
    return body.line as BandCostLine
  }

  async function uploadStub(file: File) {
    const form = new FormData()
    form.append('file', file)
    form.append('run_id', run.id)
    const res = await fetch('/api/quote-invoice-stubs', { method: 'POST', body: form })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'Could not attach file')
    return body as { path: string; filename: string; mime: string }
  }

  async function attachToLine(line: BandCostLine, file: File): Promise<BandCostLine> {
    const stub = await uploadStub(file)
    return patchLine(line, {
      attachment_path: stub.path,
      attachment_filename: stub.filename,
      attachment_mime: stub.mime,
    })
  }

  async function setLineStatus(line: BandCostLine, status: 'paid' | 'waived' | 'open') {
    setBusy(true)
    setError(null)
    try {
      const payload =
        status === 'paid' ? { paid: true, waived: false }
          : status === 'waived' ? { paid: false, waived: true }
            : { paid: false, waived: false }
      const updated = await patchLine(line, payload)
      setLines(prev => prev.map(l => l.id === line.id ? updated : l))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update band cost')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-1">
        <Link href="/settlements" className="text-slate-500 text-sm hover:text-slate-300">← {SETTLEMENTS_MODULE_LABEL}</Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-400 font-bold text-lg">{run.code}</span>
            {finalised ? (
              <span data-testid="finalised-badge" className="text-[10px] font-bold px-2 py-0.5 rounded border bg-teal-900/40 text-teal-300 border-teal-800">
                SNAPSHOT LOCKED
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-slate-800 text-slate-500 border-slate-700">
                Live preview
              </span>
            )}
          </div>
          <h1 className="text-white text-2xl font-bold">{run.name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {focusedShow
              ? `${focusedShow.venue_name} · ${formatDateAU(focusedShow.show_date)}`
              : `${formatDateAU(run.start_date)}${run.start_date !== run.end_date ? ` – ${formatDateAU(run.end_date)}` : ''}`}
          </p>
          <p className="text-slate-500 text-xs mt-2 max-w-2xl">{SETTLEMENT_PROPOSED_NOTE}</p>
        </div>
      </div>

      <SettlementsTabBar runCode={run.code} showId={focusedShowId} active="settlement" />

      {shows.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link
            href={wave1SettlementHref(run.code)}
            className={`px-2.5 py-1 rounded-md text-xs border ${!focusedShowId ? 'bg-amber-400/10 text-amber-400 border-amber-700' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
          >
            All shows
          </Link>
          {shows.map(show => (
            <Link
              key={show.id}
              href={wave1SettlementHref(run.code, show.id)}
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

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Left: Run Costing snapshot */}
        <section data-testid="settlements-left-pane" className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-white font-semibold">Run Costing snapshot</h2>
              <p className="text-slate-500 text-xs mt-1">{FINALISE_LOCK_NOTE}</p>
            </div>
            {!finalised && !confirmFinalise && (
              <button
                type="button"
                data-testid="finalise-costing"
                onClick={() => setConfirmFinalise(true)}
                disabled={busy}
                className="shrink-0 bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
              >
                {FINALISE_CONTROL_LABEL}
              </button>
            )}
          </div>

          {confirmFinalise && !finalised && (
            <div className="rounded-lg border border-amber-700/60 bg-amber-400/5 p-3 space-y-2">
              <p className="text-amber-200 text-sm">
                This will snapshot current Run Costing and hard-lock the left pane. Tour Desk stays editable. Settlement remains a proposed figure, not cash.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="finalise-confirm"
                  onClick={finalise}
                  disabled={busy}
                  className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
                >
                  {busy ? 'Finalising…' : 'Confirm Finalise'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmFinalise(false)}
                  className="text-slate-400 text-xs px-3 py-1.5 rounded hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {finalised ? (
            <p className="text-teal-300/80 text-xs">
              Locked {formatDateTimeAU(settlement?.costing_finalised_at)}. Nudge stub due {formatDateTimeAU(settlement?.nudge_due_at)}. {NUDGE_STUB_NOTE}
            </p>
          ) : (
            <p className="text-slate-500 text-xs">{NUDGE_STUB_NOTE}</p>
          )}

          <div className={finalised ? 'pointer-events-none select-none' : ''} aria-disabled={finalised}>
            {showGroups.length === 0 ? (
              <p className="text-slate-500 text-sm">No costing lines on this run yet. Open Tour Desk to seed Run Costing, then Finalise.</p>
            ) : showGroups.map(group => (
              <div key={group.key} className="mb-3">
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">{group.title}</h3>
                <div className="space-y-1.5">
                  {group.fields.map(field => (
                    <article key={field.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-200 text-sm">{field.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATE_STYLES[field.state] ?? STATE_STYLES.pending}`}>
                            {STATE_LABEL[field.state] ?? field.state}
                          </span>
                          <span className="text-white text-sm font-medium tabular-nums">{formatSettlementsMoney(snapshotFieldTotal(field))}</span>
                        </div>
                      </div>
                      {(field.entries?.length ?? 0) > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {field.entries.map(entry => (
                            <li key={entry.id} className="flex justify-between gap-2 text-xs text-slate-500">
                              <span className="truncate">
                                {entry.description || 'Line'}
                                {entry.attachment_filename ? (
                                  <span className="ml-1.5 text-[10px] font-semibold px-1 py-0.5 rounded border border-slate-700 text-slate-500">
                                    {entry.attachment_filename}
                                  </span>
                                ) : null}
                              </span>
                              <span className="tabular-nums shrink-0">{formatSettlementsMoney(entry.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Agent Settlement + Band Costs */}
        <div className="space-y-4" data-testid="settlements-right-pane">
          <section className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
            <h2 className="text-white font-semibold">Agent Settlement</h2>
            {shouldShowAgentSettlementEmptyCopy(agentLines) && (
              <p data-testid="agent-settlement-empty" className="text-slate-500 text-xs mt-1">{AGENT_SETTLEMENT_EMPTY_NOTE}</p>
            )}
            {shouldShowAgentSettlementEmptyCopy(agentLines) ? (
              <div className="rounded-lg border border-dashed border-slate-600 bg-slate-900/40 px-3 py-4 text-center">
                <p className="text-slate-400 text-sm">Proposed payment</p>
                <p className="text-slate-600 text-xs mt-1">No agent statement lines yet. Enter proposed figures (not cash).</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {agentLines.map(line => (
                  <li key={line.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 flex justify-between gap-2">
                    <span className="text-slate-200 text-sm">{line.description}</span>
                    <span className="text-white text-sm tabular-nums">{formatSettlementsMoney(line.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-slate-700/60 pt-3 space-y-2">
              <div className="text-slate-400 text-xs font-semibold">Add proposed line</div>
              <input
                data-testid="agent-settlement-description"
                value={agentDesc}
                onChange={e => setAgentDesc(e.target.value)}
                placeholder="e.g. Venue Hire (agent statement)"
                className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  data-testid="agent-settlement-amount"
                  value={agentAmount}
                  onChange={e => setAgentAmount(e.target.value)}
                  type="number"
                  step="0.01"
                  placeholder="Proposed amount"
                  className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                />
                <select
                  value={agentShowId}
                  onChange={e => setAgentShowId(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-slate-300 focus:outline-none focus:border-amber-400"
                >
                  <option value="">Whole run</option>
                  {shows.map(show => (
                    <option key={show.id} value={show.id}>{show.venue_name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                data-testid="add-agent-settlement"
                disabled={busy || !agentDesc.trim()}
                onClick={async () => {
                  const description = agentDesc.trim()
                  if (!description) return
                  setBusy(true)
                  setError(null)
                  try {
                    const res = await fetch(`/api/settlements/${run.id}/agent-settlement`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        description,
                        amount: Number(agentAmount) || 0,
                        show_id: agentShowId || null,
                      }),
                    })
                    const body = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(body.error || 'Could not add proposed line')
                    setAgentLines(prev => [...prev, body.line])
                    setAgentDesc('')
                    setAgentAmount('')
                    router.refresh()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not add proposed line')
                  } finally {
                    setBusy(false)
                  }
                }}
                className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
              >
                Add proposed Settlement line
              </button>
            </div>
          </section>

          <section className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
            <div>
              <h2 className="text-white font-semibold">Band Costs</h2>
              <p className="text-slate-500 text-xs mt-1">{BAND_COSTS_HELP}</p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{CLOSE_GATE_LABEL}</div>
              <p className="text-slate-300 text-sm mt-0.5">{CLOSE_GATE_RULE}</p>
              <p data-testid="close-gate-summary" className={`text-xs mt-1 ${gate.ready ? 'text-teal-300' : 'text-orange-300'}`}>
                {gate.ready ? '✓' : '○'} {gate.summary}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2" data-testid="distribute-gate" data-ready={distGate.ready ? 'true' : 'false'}>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{DISTRIBUTE_GATE_LABEL}</div>
              <p className="text-slate-300 text-sm mt-0.5" data-testid="distribute-gate-rule">{DISTRIBUTE_GATE_RULE}</p>
              <p data-testid="distribute-gate-summary" className={`text-xs mt-1 ${distGate.ready ? 'text-teal-300' : 'text-orange-300'}`}>
                {distGate.ready ? '✓' : '○'} {distGate.summary}
              </p>
              <button
                type="button"
                disabled={busy || !distGate.ready}
                data-testid="distribute-funds"
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  setDistResult(null)
                  try {
                    const res = await fetch(`/api/settlements/${run.id}/distribute`, { method: 'POST' })
                    const body = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(body.error || DISTRIBUTE_BLOCKED_NOTE)
                    setDistResult(body.message || DISTRIBUTE_STUB_NOTE)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : DISTRIBUTE_BLOCKED_NOTE)
                  } finally {
                    setBusy(false)
                  }
                }}
                className="mt-2 text-[11px] font-semibold px-3 py-1.5 rounded bg-amber-400 text-slate-900 hover:bg-amber-300 disabled:opacity-40"
              >
                {DISTRIBUTE_CONTROL_LABEL}
              </button>
              {distResult && <p className="text-teal-300 text-xs mt-1" data-testid="distribute-stub-note">{distResult}</p>}
            </div>

            {lines.length === 0 ? (
              <p className="text-slate-500 text-sm">No band costs yet. Add a surprise receipt on the right only (e.g. Uber).</p>
            ) : (
              <ul className="space-y-2">
                {lines.map(line => (
                  <li key={line.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-slate-200 text-sm">{line.description}</div>
                        {line.notes ? (
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className="text-slate-600">{NOTES_SOURCE_OF_DATA_LABEL}: </span>
                            {line.notes}
                          </div>
                        ) : line.source ? (
                          <div className="text-xs text-slate-500 mt-0.5">{line.source}</div>
                        ) : null}
                      </div>
                      <div className="text-white text-sm font-medium tabular-nums shrink-0">{formatSettlementsMoney(line.amount)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        line.waived ? 'bg-slate-800 text-slate-400 border-slate-600'
                          : line.paid ? 'bg-teal-900/40 text-teal-300 border-teal-800'
                            : 'bg-orange-900/30 text-orange-300 border-orange-800'
                      }`}>
                        {line.waived ? 'WAIVED' : line.paid ? 'PAID' : 'OPEN'}
                      </span>
                      {!line.paid && !line.waived && (
                        <>
                          <button type="button" disabled={busy} onClick={() => setLineStatus(line, 'paid')} className="text-[10px] font-semibold text-teal-300 hover:text-teal-200">
                            Mark PAID
                          </button>
                          <button type="button" disabled={busy} onClick={() => setLineStatus(line, 'waived')} className="text-[10px] font-semibold text-slate-400 hover:text-white">
                            Waive
                          </button>
                        </>
                      )}
                      {(line.paid || line.waived) && (
                        <button type="button" disabled={busy} onClick={() => setLineStatus(line, 'open')} className="text-[10px] text-slate-500 hover:text-slate-300">
                          Reopen
                        </button>
                      )}
                    </div>
                    <QuoteInvoiceStub
                      filename={line.attachment_filename}
                      quoteNote={line.quote_note}
                      disabled={busy}
                      busy={busy}
                      testIdPrefix={`band-cost-${line.id}`}
                      onNoteCommit={async note => {
                        setBusy(true)
                        setError(null)
                        try {
                          const updated = await patchLine(line, { quote_note: note })
                          setLines(prev => prev.map(l => l.id === line.id ? updated : l))
                          router.refresh()
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Could not save note')
                        } finally {
                          setBusy(false)
                        }
                      }}
                      onAttach={async file => {
                        setBusy(true)
                        setError(null)
                        try {
                          const updated = await attachToLine(line, file)
                          setLines(prev => prev.map(l => l.id === line.id ? updated : l))
                          router.refresh()
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Could not attach file')
                        } finally {
                          setBusy(false)
                        }
                      }}
                      onRemove={async () => {
                        setBusy(true)
                        setError(null)
                        try {
                          const updated = await patchLine(line, { clear_attachment: true })
                          setLines(prev => prev.map(l => l.id === line.id ? updated : l))
                          router.refresh()
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Could not remove file')
                        } finally {
                          setBusy(false)
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-slate-700/60 pt-3 space-y-2">
              <div className="text-slate-400 text-xs font-semibold">Add surprise cost</div>
              <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="e.g. Uber from hotel"
                className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                />
                <select
                  value={lineShowId}
                  onChange={e => setLineShowId(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-slate-300 focus:outline-none focus:border-amber-400"
                >
                  <option value="">Whole run</option>
                  {shows.map(show => (
                    <option key={show.id} value={show.id}>{show.venue_name}</option>
                  ))}
                </select>
              </div>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={NOTES_INPUT_LABEL}
                aria-label={NOTES_INPUT_LABEL}
                className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
              />
              <input
                data-testid="new-band-cost-quote-note"
                value={quoteNote}
                onChange={e => setQuoteNote(e.target.value)}
                placeholder="Link quote/invoice later"
                aria-label="Link quote/invoice later"
                className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
              />
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  data-testid="new-band-cost-attach"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.jpg,.jpeg,.png,.webp,.gif"
                  className="text-xs text-slate-400 file:mr-2 file:text-[10px] file:font-semibold file:px-2 file:py-1 file:rounded file:border file:border-slate-600 file:bg-slate-900 file:text-slate-300"
                  onChange={e => setPendingFile(e.target.files?.[0] ?? null)}
                />
                {pendingFile ? <span className="text-slate-300 truncate">{pendingFile.name}</span> : <span>Optional PDF or image</span>}
              </label>
              <button
                type="button"
                data-testid="add-band-cost"
                onClick={addBandCost}
                disabled={busy || !desc.trim()}
                className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
              >
                Add band cost
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
