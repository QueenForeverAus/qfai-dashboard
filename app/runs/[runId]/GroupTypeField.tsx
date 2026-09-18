'use client'

import { useState } from 'react'
import {
  GROUP_CHANGE_LOCKED,
  GROUP_CHANGE_REVIEW_INTRO,
  GROUP_TYPES,
  GROUP_TYPE_LABELS,
  canEditGroupType,
  groupTypeLabel,
  isGroupType,
} from '@/lib/group-type'
import type { GroupChangeDecision, GroupChangeLine, GroupChangePreview } from '@/lib/group-change'
import { NOTES_SOURCE_OF_DATA_LABEL } from '@/lib/cost-entry-source'

function lineLabel(line: GroupChangeLine): string {
  return line.proposed?.label || line.existing?.label || line.fieldKey.replace(/_/g, ' ')
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `$${value.toLocaleString()}`
}

function actionCopy(line: GroupChangeLine): string {
  if (line.action === 'add') return 'Add seed'
  if (line.action === 'remove') return 'Remove seed'
  return 'Update seed'
}

export default function GroupTypeField({
  runId,
  region,
  bookingStatus,
  costingsUnconfirmedAt,
  isOwnerOrAdmin,
  frozen,
}: {
  runId: string
  region: string
  bookingStatus?: string | null
  costingsUnconfirmedAt?: string | null
  isOwnerOrAdmin: boolean
  frozen: boolean
}) {
  const current = isGroupType(region) ? region : region
  const gate = canEditGroupType({
    role: isOwnerOrAdmin ? 'owner' : 'crew',
    status: bookingStatus,
    costingsUnconfirmedAt,
    workspace: 'costing',
  })
  const locked = frozen || !gate.ok
  const [draft, setDraft] = useState(isGroupType(region) ? region : 'group1')
  const [preview, setPreview] = useState<GroupChangePreview | null>(null)
  const [decisions, setDecisions] = useState<Record<string, GroupChangeDecision>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)

  async function loadPreview() {
    if (!isGroupType(draft) || draft === region) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/runs/${runId}/group-type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region: draft, apply: false }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not preview Group change')
      return
    }
    const next = data.preview as GroupChangePreview
    setPreview(next)
    setDecisions(Object.fromEntries(next.lines.map(l => [l.key, l.defaultDecision])))
  }

  async function apply() {
    if (!preview) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/runs/${runId}/group-type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region: preview.to, apply: true, decisions }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not apply Group change')
      return
    }
    window.location.reload()
  }

  function cancelReview() {
    setPreview(null)
    setDecisions({})
    setPicking(false)
    setDraft(isGroupType(region) ? region : 'group1')
    setError(null)
  }

  return (
    <div
      data-testid="group-type-field"
      className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Group Type</div>
          <div className="text-white text-sm font-semibold mt-0.5" data-testid="group-type-current">
            {groupTypeLabel(current)}
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Seeds lighting, backline / keyboard, flights and ground. Costings only — Advancing does not own this field.
          </p>
        </div>
        {!picking && !preview && (
          <button
            type="button"
            data-testid="group-type-edit"
            disabled={locked}
            title={locked ? (gate.ok ? 'Costings frozen' : gate.error) : 'Edit Group Type'}
            onClick={() => { setPicking(true); setDraft(isGroupType(region) ? region : 'group1') }}
            className="text-xs text-amber-400 hover:text-amber-300 disabled:text-slate-600 disabled:cursor-not-allowed"
          >
            Edit
          </button>
        )}
      </div>

      {locked && !preview && (
        <p className="text-slate-500 text-xs mt-2" data-testid="group-type-locked">
          {gate.ok ? 'Costings is frozen.' : gate.error === GROUP_CHANGE_LOCKED ? GROUP_CHANGE_LOCKED : gate.error}
        </p>
      )}

      {picking && !preview && (
        <div className="mt-3 space-y-2" data-testid="group-type-picker">
          <select
            value={draft}
            onChange={e => setDraft(e.target.value as typeof draft)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400"
            data-testid="group-type-select"
          >
            {GROUP_TYPES.map(g => (
              <option key={g} value={g}>{GROUP_TYPE_LABELS[g]}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="group-type-review"
              disabled={busy || draft === region}
              onClick={loadPreview}
              className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
            >
              {busy ? 'Loading…' : 'Review seeds'}
            </button>
            <button type="button" onClick={cancelReview} className="text-slate-500 hover:text-slate-300 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-3 space-y-3" data-testid="group-change-review">
          <p className="text-amber-200/90 text-xs leading-snug">{GROUP_CHANGE_REVIEW_INTRO}</p>
          <div className="text-slate-300 text-xs">
            {GROUP_TYPE_LABELS[preview.from]} → <span className="text-amber-300 font-semibold">{GROUP_TYPE_LABELS[preview.to]}</span>
          </div>
          {preview.lines.length === 0 && (
            <p className="text-slate-500 text-xs">No seed lines change for this Group.</p>
          )}
          <div className="space-y-2">
            {preview.lines.map(line => {
              const decision = decisions[line.key] ?? line.defaultDecision
              return (
                <div
                  key={line.key}
                  data-testid={`group-change-line-${line.fieldKey}`}
                  className="rounded border border-slate-700 bg-slate-900/60 px-2.5 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-white text-xs font-medium">{lineLabel(line)}</div>
                      <div className="text-slate-500 text-[11px] mt-0.5">
                        {actionCopy(line)} · {money(line.existing?.value)} → {money(line.proposed?.value)}
                      </div>
                      {line.proposed?.source && (
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          {NOTES_SOURCE_OF_DATA_LABEL}: {line.proposed.source}
                        </div>
                      )}
                      {line.protected && (
                        <div className="text-amber-300/90 text-[11px] mt-1" data-testid="group-change-protected">
                          {line.protectedReasons.map(r => r.toUpperCase()).join(' / ')} — keep or replace
                        </div>
                      )}
                    </div>
                    {line.protected ? (
                      <div className="flex gap-2 text-[11px] shrink-0">
                        <label className="text-slate-300">
                          <input
                            type="radio"
                            name={`gc-${line.key}`}
                            checked={decision === 'keep'}
                            onChange={() => setDecisions(prev => ({ ...prev, [line.key]: 'keep' }))}
                          /> Keep
                        </label>
                        <label className="text-slate-300">
                          <input
                            type="radio"
                            name={`gc-${line.key}`}
                            checked={decision === 'replace'}
                            onChange={() => setDecisions(prev => ({ ...prev, [line.key]: 'replace' }))}
                          /> Replace
                        </label>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[11px] shrink-0">Will apply</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="group-change-accept"
              disabled={busy}
              onClick={apply}
              className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
            >
              {busy ? 'Applying…' : 'Accept Group change'}
            </button>
            <button type="button" onClick={cancelReview} className="text-slate-500 hover:text-slate-300 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && !preview && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
