'use client'

import { useMemo, useState } from 'react'
import {
  SMOKE_ADVANCING_EXTRACT,
  SMOKE_ADVANCING_EXTRACT_SUPERSEDE,
} from '@/lib/fixtures/advancing-extract-smoke'
import type { AdvancingApplyResult } from '@/lib/advancing-extract'

type ShowOpt = { id: string; venue_name: string; venue_city: string }

export default function ApplyAdvancingExtract({
  runId,
  shows,
  canForce,
  onApplied,
}: {
  runId: string
  shows: ShowOpt[]
  canForce: boolean
  onApplied: (fields: Array<Record<string, unknown>>) => void
}) {
  const [open, setOpen] = useState(false)
  const [showId, setShowId] = useState(shows[0]?.id ?? '')
  const [packetText, setPacketText] = useState(() => JSON.stringify(SMOKE_ADVANCING_EXTRACT, null, 2))
  const [forceApply, setForceApply] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AdvancingApplyResult | null>(null)

  const fixtureHint = useMemo(
    () => 'Smoke fixture: Civic high-confidence packet. Hire + lighting stay put; lone FOH queues unless force-apply.',
    [],
  )

  async function apply() {
    setBusy(true)
    setError(null)
    setResult(null)
    let packet: unknown
    try {
      packet = JSON.parse(packetText)
    } catch {
      setBusy(false)
      setError('Packet JSON is invalid')
      return
    }
    try {
      const res = await fetch(`/api/runs/${runId}/apply-advancing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          show_id: showId,
          packet,
          force_apply: canForce && forceApply,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Apply failed (${res.status})`)
      const next = data as AdvancingApplyResult
      setResult(next)
      if (Array.isArray(next.fields) && next.fields.length) {
        onApplied(next.fields)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="apply-advancing-extract"
      className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-slate-200 text-sm font-medium">Apply advancing extract</div>
          <p className="text-slate-500 text-xs mt-0.5">
            Michael advancing email → figure-accuracy CONFIRMED. Does not tick lines or mark PAID.
          </p>
        </div>
        <button
          type="button"
          data-testid="apply-advancing-toggle"
          onClick={() => setOpen(o => !o)}
          className={`text-xs transition-colors ${open ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {open ? '▲ Hide' : '▼ Open'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2.5">
          <p className="text-slate-600 text-xs">{fixtureHint}</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-400 flex items-center gap-1.5">
              Show
              <select
                data-testid="apply-advancing-show"
                value={showId}
                onChange={e => setShowId(e.target.value)}
                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-amber-400"
              >
                {shows.map(show => (
                  <option key={show.id} value={show.id}>
                    {show.venue_city} — {show.venue_name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPacketText(JSON.stringify(SMOKE_ADVANCING_EXTRACT, null, 2))}
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              Load smoke fixture
            </button>
            <button
              type="button"
              onClick={() => setPacketText(JSON.stringify(SMOKE_ADVANCING_EXTRACT_SUPERSEDE, null, 2))}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Load supersede fixture
            </button>
            {canForce && (
              <label className="text-xs text-slate-400 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  data-testid="apply-advancing-force"
                  checked={forceApply}
                  onChange={e => setForceApply(e.target.checked)}
                  className="accent-amber-400"
                />
                Force-apply flagged / medium-low
              </label>
            )}
            <button
              type="button"
              data-testid="apply-advancing-submit"
              onClick={() => { void apply() }}
              disabled={busy || !showId}
              className="ml-auto bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
            >
              {busy ? '…' : 'Apply extract'}
            </button>
          </div>
          <textarea
            data-testid="apply-advancing-packet"
            value={packetText}
            onChange={e => setPacketText(e.target.value)}
            spellCheck={false}
            rows={10}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[11px] text-slate-300 font-mono focus:outline-none focus:border-amber-400"
          />
          {error && (
            <div className="text-red-400 text-xs" role="alert">{error}</div>
          )}
          {result && (
            <div
              data-testid="apply-advancing-result"
              data-status={result.status}
              className="rounded border border-slate-700 bg-slate-900/50 px-2.5 py-2 text-xs text-slate-300 space-y-1"
            >
              <div>
                <span className="text-slate-500">Status </span>
                <span className="text-amber-300 font-medium uppercase">{result.status}</span>
                <span className="text-slate-500"> · </span>
                <span data-testid="apply-advancing-source-note">{result.source_note}</span>
              </div>
              {result.queue_reason && (
                <div className="text-amber-400/80">{result.queue_reason}</div>
              )}
              {result.applied.length > 0 && (
                <div>Wrote {result.applied.length} line{result.applied.length === 1 ? '' : 's'} as CONFIRMED (known).</div>
              )}
              {result.superseded.length > 0 && (
                <div>Superseded {result.superseded.length} prior advancing figure{result.superseded.length === 1 ? '' : 's'}.</div>
              )}
              {result.skipped.length > 0 && (
                <div className="text-slate-400">
                  Skipped {result.skipped.length}: {result.skipped.map(s => s.description).join(', ')}
                </div>
              )}
              {result.soft_flags.length > 0 && (
                <div className="text-slate-500">Soft flags: {result.soft_flags.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
