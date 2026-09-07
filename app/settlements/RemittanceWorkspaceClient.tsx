'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateAU, formatDateShortAU } from '@/lib/dates'
import {
  ACCEPT_NO_OVERWRITE_NOTE,
  CHALLENGE_NEVER_SEND_NOTE,
  RECTIFY_NOTE,
  REMITTANCE_CASH_NOTE,
  REMITTANCE_TAB_LABEL,
  REMITTANCE_UPLOAD_STUB_NOTE,
  RIGHTS_PAYER_HELP,
  RIGHTS_PAYER_LABEL,
  paidFromRemittance,
  proposedFromAgentLines,
  proposedFromSnapshot,
  showsWithQfRightsCost,
  type AgentSettlementLine,
  type RemittanceChallenge,
  type RemittanceLine,
  type RemittanceLineType,
} from '@/lib/remittance'
import {
  compareRemittance,
  flaggedRows,
  type ComparisonRow,
  type RightsPayer,
} from '@/lib/remittance-variance'
import {
  SETTLEMENT_PROPOSED_NOTE,
  SETTLEMENTS_MODULE_LABEL,
  fieldsForShow,
  formatSettlementsMoney,
  isCostingFinalised,
  type CostingSnapshotField,
  type RunSettlementRow,
} from '@/lib/settlements'
import SettlementsTabBar from './SettlementsTabBar'

type Show = {
  id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  show_order: number
  rights_payer: RightsPayer
}

const SEVERITY: Record<string, string> = {
  hard: 'bg-red-900/40 text-red-300 border-red-800',
  soft: 'bg-orange-900/30 text-orange-300 border-orange-800',
  info: 'bg-slate-800 text-slate-400 border-slate-600',
}

export default function RemittanceWorkspaceClient({
  run,
  shows,
  liveFields,
  settlement,
  remittanceLines,
  agentSettlementLines,
  challenges,
  focusedShowId,
}: {
  run: { id: string; code: string; name: string; status: string; start_date: string | null; end_date: string | null }
  shows: Show[]
  liveFields: CostingSnapshotField[]
  settlement: RunSettlementRow | null
  remittanceLines: RemittanceLine[]
  agentSettlementLines: AgentSettlementLine[]
  challenges: RemittanceChallenge[]
  focusedShowId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState(remittanceLines)
  const [agentLines] = useState(agentSettlementLines)
  const [drafts, setDrafts] = useState(challenges)
  const [payers, setPayers] = useState<Record<string, RightsPayer>>(() => {
    const m: Record<string, RightsPayer> = {}
    for (const s of shows) m[s.id] = s.rights_payer
    return m
  })
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState({
    'Remittance / bank receipt': false,
    'Agent settlement statement': false,
    'Locked Run Costing snapshot': true,
  })
  const [draftPreview, setDraftPreview] = useState<RemittanceChallenge | null>(null)

  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [lineType, setLineType] = useState<RemittanceLineType>('payment')
  const [occurredOn, setOccurredOn] = useState('')
  const [reference, setReference] = useState('')
  const [hours, setHours] = useState('')
  const [rate, setRate] = useState('')
  const [lineShowId, setLineShowId] = useState(focusedShowId ?? shows[0]?.id ?? '')

  const finalised = isCostingFinalised(settlement)
  const snapshotFields = settlement?.costing_snapshot?.fields ?? []
  const proposedFields = fieldsForShow(finalised ? snapshotFields : liveFields, focusedShowId)
  const focusedShow = shows.find(s => s.id === focusedShowId) ?? null
  const visibleShows = focusedShow ? [focusedShow] : shows
  const remittanceStatus = settlement?.remittance_status ?? 'open'

  const comparison = useMemo(() => {
    const proposed = [
      ...proposedFromAgentLines(agentLines),
      ...proposedFromSnapshot(proposedFields),
    ]
    const paid = paidFromRemittance(
      lines.filter(l => !focusedShowId || l.show_id === focusedShowId || l.show_id == null),
    )
    return compareRemittance({
      proposed,
      paid,
      rightsPayerByShow: payers,
      qfRightsCostShowIds: showsWithQfRightsCost(proposedFields),
    }).filter(row => !focusedShowId || row.show_id === focusedShowId || row.show_id == null)
  }, [agentLines, focusedShowId, lines, payers, proposedFields])

  const flagged = flaggedRows(comparison)
  const selectedRows = comparison.filter(r => selected[r.id] && r.flags.some(f => f.severity !== 'info'))

  async function addLine() {
    const description = desc.trim()
    if (!description) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/remittance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          amount: Number(amount) || 0,
          line_type: lineType,
          occurred_on: occurredOn || null,
          reference: reference.trim() || null,
          hours: hours || null,
          rate: rate || null,
          show_id: lineShowId || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not add remittance line')
      setLines(prev => [...prev, body.line])
      setDesc('')
      setAmount('')
      setReference('')
      setHours('')
      setRate('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add remittance line')
    } finally {
      setBusy(false)
    }
  }

  async function setPayer(showId: string, rights_payer: RightsPayer) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/rights-payer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_id: showId, rights_payer }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not set rights payer')
      setPayers(prev => ({ ...prev, [showId]: rights_payer }))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set rights payer')
    } finally {
      setBusy(false)
    }
  }

  async function createDraft() {
    if (!reason.trim()) {
      setError('A reason is required for a challenge draft')
      return
    }
    if (selectedRows.length === 0) {
      setError('Select at least one flagged line')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/remittance/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          rows: selectedRows,
          evidence,
          send: false,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not create draft')
      setDrafts(prev => [body.challenge, ...prev])
      setDraftPreview(body.challenge)
      setSelected({})
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create draft')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(action: 'accept' | 'rectify') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/settlements/${run.id}/remittance/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not update remittance status')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update remittance status')
    } finally {
      setBusy(false)
    }
  }

  function showName(showId: string | null) {
    if (!showId) return 'Whole run'
    return shows.find(s => s.id === showId)?.venue_name ?? 'Show'
  }

  const groups = useMemo(() => {
    const map = new Map<string, ComparisonRow[]>()
    for (const row of comparison) {
      const key = row.show_id ?? 'run'
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [comparison])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-1">
        <Link href="/settlements" className="text-slate-500 text-sm hover:text-slate-300">← {SETTLEMENTS_MODULE_LABEL}</Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-400 font-bold text-lg">{run.code}</span>
            <span data-testid="remittance-badge" className="text-[10px] font-bold px-2 py-0.5 rounded border bg-teal-900/40 text-teal-300 border-teal-800">
              {REMITTANCE_TAB_LABEL}
            </span>
            {remittanceStatus !== 'open' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-slate-800 text-slate-300 border-slate-600 uppercase">
                {remittanceStatus.replace('_', ' ')}
              </span>
            )}
          </div>
          <h1 className="text-white text-2xl font-bold">{run.name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {focusedShow
              ? `${focusedShow.venue_name} · ${formatDateAU(focusedShow.show_date)}`
              : `${formatDateAU(run.start_date)}${run.start_date !== run.end_date ? ` – ${formatDateAU(run.end_date)}` : ''}`}
          </p>
          <p className="text-slate-500 text-xs mt-2 max-w-2xl">{REMITTANCE_CASH_NOTE}</p>
          <p className="text-slate-600 text-xs mt-1 max-w-2xl">{SETTLEMENT_PROPOSED_NOTE}</p>
        </div>
      </div>

      <SettlementsTabBar runCode={run.code} showId={focusedShowId} active="remittance" />

      {shows.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link
            href={`/settlements/${run.code.toLowerCase()}/remittance`}
            className={`px-2.5 py-1 rounded-md text-xs border ${!focusedShowId ? 'bg-amber-400/10 text-amber-400 border-amber-700' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
          >
            All shows
          </Link>
          {shows.map(show => (
            <Link
              key={show.id}
              href={`/settlements/${run.code.toLowerCase()}/${show.id}/remittance`}
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

      <section className="mb-4 bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
        <div>
          <h2 className="text-white font-semibold">{RIGHTS_PAYER_LABEL}</h2>
          <p className="text-slate-500 text-xs mt-1">{RIGHTS_PAYER_HELP}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {visibleShows.map(show => (
            <label key={show.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
              <span className="text-slate-300 text-sm truncate">{show.venue_name}</span>
              <select
                data-testid={`rights-payer-${show.id}`}
                value={payers[show.id] ?? 'tbd'}
                disabled={busy}
                onChange={e => setPayer(show.id, e.target.value as RightsPayer)}
                className="px-2 py-1 rounded text-xs bg-slate-900 border border-slate-600 text-slate-200"
              >
                <option value="tbd">Payer TBD</option>
                <option value="venue">Venue</option>
                <option value="qf">QF</option>
              </select>
            </label>
          ))}
        </div>
      </section>

      <section data-testid="remittance-compare" className="mb-4 bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
        <div>
          <h2 className="text-white font-semibold">Proposed (Settlement) vs paid (Remittance)</h2>
          <p className="text-slate-500 text-xs mt-1">
            Proposed is the agent statement when entered, else the locked Run Costing snapshot. Variance flags only — never auto-send.
          </p>
        </div>

        {comparison.length === 0 ? (
          <p className="text-slate-500 text-sm">No remittance lines yet. Enter a paid line below to compare against Settlement / snapshot.</p>
        ) : (
          <div className="space-y-4">
            {groups.map(([key, rows]) => (
              <div key={key}>
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                  {key === 'run' ? 'Run-level' : showName(key)}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-slate-500 text-left">
                        <th className="pb-1 pr-2 font-semibold">Flag</th>
                        <th className="pb-1 pr-2 font-semibold">Line</th>
                        <th className="pb-1 pr-2 font-semibold text-right">Proposed</th>
                        <th className="pb-1 pr-2 font-semibold text-right">Paid</th>
                        <th className="pb-1 pr-2 font-semibold text-right">Δ</th>
                        <th className="pb-1 font-semibold">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const canSelect = row.flags.some(f => f.severity === 'soft' || f.severity === 'hard')
                        return (
                          <tr key={row.id} data-testid={`compare-row-${row.id}`} className="border-t border-slate-700/60 align-top">
                            <td className="py-2 pr-2">
                              {canSelect ? (
                                <input
                                  type="checkbox"
                                  data-testid={`flag-select-${row.id}`}
                                  checked={Boolean(selected[row.id])}
                                  onChange={e => setSelected(prev => ({ ...prev, [row.id]: e.target.checked }))}
                                />
                              ) : <span className="text-slate-700">—</span>}
                            </td>
                            <td className="py-2 pr-2">
                              <div className="text-slate-200">{row.label}</div>
                              {row.match === 'rollup' && (
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Roll-up · {Math.round(row.confidence * 100)}% confidence · our lines:{' '}
                                  {row.fedBy.map(f => f.label).join(', ')}
                                </div>
                              )}
                              {row.lineType && row.lineType !== 'payment' && (
                                <div className="text-[10px] uppercase text-slate-500 mt-0.5">{row.lineType}</div>
                              )}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums text-slate-300">{row.proposed == null ? '—' : formatSettlementsMoney(row.proposed)}</td>
                            <td className="py-2 pr-2 text-right tabular-nums text-white">{row.paid == null ? '—' : formatSettlementsMoney(row.paid)}</td>
                            <td className={`py-2 pr-2 text-right tabular-nums ${row.variance && row.variance !== 0 ? 'text-orange-300' : 'text-slate-500'}`}>
                              {row.variance == null ? '—' : formatSettlementsMoney(row.variance)}
                            </td>
                            <td className="py-2">
                              <div className="flex flex-col gap-1">
                                {row.flags.map(flag => (
                                  <span
                                    key={flag.code}
                                    data-testid={`variance-flag-${flag.code}`}
                                    className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border ${SEVERITY[flag.severity]}`}
                                  >
                                    {flag.severity.toUpperCase()} · {flag.message}
                                  </span>
                                ))}
                                {row.flags.length === 0 && <span className="text-[10px] text-teal-400">OK</span>}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-4 items-start mb-4">
        <section className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
          <h2 className="text-white font-semibold">Enter remittance line</h2>
          <p className="text-slate-500 text-xs">{REMITTANCE_UPLOAD_STUB_NOTE}</p>
          <button
            type="button"
            disabled
            className="text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-600 cursor-not-allowed"
            title={REMITTANCE_UPLOAD_STUB_NOTE}
          >
            Upload remittance (OCR later)
          </button>
          <input
            data-testid="remittance-description"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Description (e.g. Venue Hire)"
            className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              data-testid="remittance-amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              type="number"
              step="0.01"
              placeholder="Amount"
              className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
            <select
              data-testid="remittance-type"
              value={lineType}
              onChange={e => setLineType(e.target.value as RemittanceLineType)}
              className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-slate-300 focus:outline-none focus:border-amber-400"
            >
              <option value="payment">Payment (cash in)</option>
              <option value="deduction">Deduction</option>
              <option value="adjustment">Adjustment (clawback)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              data-testid="remittance-date"
              value={occurredOn}
              onChange={e => setOccurredOn(e.target.value)}
              type="date"
              className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-slate-300 focus:outline-none focus:border-amber-400"
            />
            <input
              data-testid="remittance-reference"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Reference"
              className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
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
            <input
              value={hours}
              onChange={e => setHours(e.target.value)}
              type="number"
              step="0.25"
              placeholder="Hours"
              className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
            <input
              value={rate}
              onChange={e => setRate(e.target.value)}
              type="number"
              step="0.01"
              placeholder="Rate $/hr"
              className="px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
          </div>
          <button
            type="button"
            data-testid="add-remittance"
            onClick={addLine}
            disabled={busy || !desc.trim()}
            className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
          >
            Add remittance line
          </button>
        </section>

        <section data-testid="challenge-panel" className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
          <h2 className="text-white font-semibold">Challenge draft</h2>
          <p className="text-slate-500 text-xs">{CHALLENGE_NEVER_SEND_NOTE}</p>
          <p className="text-slate-500 text-xs">{flagged.length} flagged line{flagged.length === 1 ? '' : 's'} · {selectedRows.length} selected</p>
          <textarea
            data-testid="challenge-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Reason (required)"
            className="w-full px-3 py-2 rounded-lg text-sm bg-slate-900 border border-slate-600 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
          />
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Evidence placeholders</div>
            {Object.keys(evidence).map(key => (
              <label key={key} className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={evidence[key as keyof typeof evidence]}
                  onChange={e => setEvidence(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                {key}
              </label>
            ))}
          </div>
          <button
            type="button"
            data-testid="create-challenge-draft"
            onClick={createDraft}
            disabled={busy}
            className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
          >
            Create challenge draft (not sent)
          </button>
          <div className="border-t border-slate-700/60 pt-3 space-y-2">
            <p className="text-slate-500 text-xs">{ACCEPT_NO_OVERWRITE_NOTE}</p>
            <p className="text-slate-500 text-xs">{RECTIFY_NOTE}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="accept-remittance"
                disabled={busy}
                onClick={() => setStatus('accept')}
                className="text-xs font-semibold px-3 py-1.5 rounded border border-teal-800 text-teal-300 hover:bg-teal-900/30 disabled:opacity-50"
              >
                Accept remittance as-is
              </button>
              <button
                type="button"
                data-testid="rectify-remittance"
                disabled={busy}
                onClick={() => setStatus('rectify')}
                className="text-xs font-semibold px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >
                Rectify (await statement)
              </button>
            </div>
          </div>
        </section>
      </div>

      {draftPreview && (
        <section data-testid="challenge-draft-preview" className="mb-4 bg-slate-900 rounded-xl border border-amber-800/50 p-4 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-400">Draft only — not sent</div>
          <div className="text-slate-400 text-xs">To: {draftPreview.to_label}</div>
          <div className="text-white text-sm font-semibold">{draftPreview.subject}</div>
          <pre className="text-slate-300 text-xs whitespace-pre-wrap font-sans">{draftPreview.body}</pre>
        </section>
      )}

      {drafts.length > 0 && !draftPreview && (
        <section className="mb-4 bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h2 className="text-white font-semibold mb-2">Saved drafts</h2>
          <ul className="space-y-2">
            {drafts.map(d => (
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
  )
}
