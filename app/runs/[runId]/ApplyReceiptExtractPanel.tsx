'use client'

import { useMemo, useState } from 'react'
import { HOTEL_RECEIPT_FIXTURES } from '@/lib/receipts/hotel-fixtures'
import type { ReceiptApplyPlan } from '@/lib/receipts/apply-engine'

type ApplyResponse = {
  error?: string
  applied?: boolean
  preview?: ReceiptApplyPlan
  accommodation_field_id?: string | null
  ticked_ids?: string[]
}

export default function ApplyReceiptExtractPanel({
  runId,
  onApplied,
}: {
  runId: string
  onApplied?: (preview: ReceiptApplyPlan, fieldId: string | null) => void
}) {
  const [jsonText, setJsonText] = useState('')
  const [fixtureId, setFixtureId] = useState<string>('')
  const [preview, setPreview] = useState<ReceiptApplyPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [appliedNote, setAppliedNote] = useState<string | null>(null)

  const prettyFixtures = useMemo(() => HOTEL_RECEIPT_FIXTURES, [])

  async function post(confirm: boolean): Promise<ApplyResponse> {
    const body: Record<string, unknown> = { confirm }
    if (fixtureId) body.fixture_id = fixtureId
    else {
      const trimmed = jsonText.trim()
      if (!trimmed) throw new Error('Paste a receipt JSON packet or pick a hotel fixture.')
      body.packet = JSON.parse(trimmed)
    }
    const res = await fetch(`/api/runs/${runId}/advancing-receipts/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({})) as ApplyResponse
    if (!res.ok) {
      throw new Error(data.error ?? data.preview?.error ?? 'Request failed')
    }
    return data
  }

  async function handlePreview() {
    setBusy('preview')
    setError(null)
    setAppliedNote(null)
    try {
      const data = await post(false)
      if (!data.preview?.ok) {
        setPreview(data.preview ?? null)
        setError(data.error ?? data.preview?.error ?? 'Preview failed')
        return
      }
      setPreview(data.preview)
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleApply() {
    setBusy('apply')
    setError(null)
    try {
      const data = await post(true)
      if (!data.preview?.ok || !data.applied) {
        setPreview(data.preview ?? null)
        setError(data.error ?? data.preview?.error ?? 'Apply failed')
        return
      }
      setPreview(data.preview)
      setAppliedNote(
        `Applied ${data.preview.nights.length} night line${data.preview.nights.length === 1 ? '' : 's'} on Run Advancing. Costing was not written.`,
      )
      onApplied?.(data.preview, data.accommodation_field_id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed')
    } finally {
      setBusy(null)
    }
  }

  function pickFixture(id: string) {
    const fixture = prettyFixtures.find(row => row.id === id)
    setFixtureId(id)
    setPreview(null)
    setAppliedNote(null)
    setError(null)
    setJsonText(fixture ? JSON.stringify(fixture.packet, null, 2) : '')
  }

  return (
    <section
      data-testid="apply-receipt-extract"
      className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-3"
    >
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-white">Apply receipt extract</h2>
        <p className="text-slate-400 text-xs mt-0.5">
          Manual paste / fixture only — email scrape is not wired. Writes Run Advancing + worksheet + checklist. Never locked Run Costings.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {prettyFixtures.map(fixture => (
          <button
            key={fixture.id}
            type="button"
            data-testid={`receipt-fixture-${fixture.id}`}
            onClick={() => pickFixture(fixture.id)}
            className={`px-2 py-1 rounded text-[11px] border transition-colors ${
              fixtureId === fixture.id
                ? 'border-amber-500 text-amber-200 bg-amber-950/50'
                : 'border-slate-600 text-slate-300 hover:border-slate-400'
            }`}
          >
            {fixture.label}
          </button>
        ))}
      </div>

      <label className="block text-[11px] text-slate-500 mb-1" htmlFor="receipt-extract-json">
        Receipt JSON
      </label>
      <textarea
        id="receipt-extract-json"
        data-testid="receipt-extract-json"
        value={jsonText}
        onChange={e => {
          setJsonText(e.target.value)
          setFixtureId('')
          setPreview(null)
          setAppliedNote(null)
        }}
        rows={8}
        spellCheck={false}
        className="w-full rounded border border-slate-600 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 font-mono mb-2"
        placeholder='{"version":1,"kind":"hotel",...}'
      />

      <div className="flex flex-wrap gap-2 mb-2">
        <button
          type="button"
          data-testid="receipt-extract-preview"
          onClick={() => void handlePreview()}
          disabled={busy != null}
          className="px-3 py-1.5 rounded bg-slate-700 text-slate-100 text-xs font-medium disabled:opacity-50"
        >
          {busy === 'preview' ? 'Previewing…' : 'Preview match'}
        </button>
        <button
          type="button"
          data-testid="receipt-extract-confirm"
          onClick={() => void handleApply()}
          disabled={busy != null || !preview?.ok}
          className="px-3 py-1.5 rounded bg-amber-600 text-slate-950 text-xs font-semibold disabled:opacity-40"
        >
          {busy === 'apply' ? 'Applying…' : 'Confirm apply'}
        </button>
      </div>

      {error && (
        <p data-testid="receipt-extract-error" role="alert" className="text-red-300 text-xs mb-2">
          {error}
        </p>
      )}
      {appliedNote && (
        <p data-testid="receipt-extract-applied" className="text-emerald-300 text-xs mb-2">
          {appliedNote}
        </p>
      )}

      {preview && (
        <div data-testid="receipt-extract-preview-result" className="text-xs text-slate-300 space-y-1">
          <p>
            Confidence:{' '}
            <span className={preview.confidence === 'low' ? 'text-red-300' : 'text-amber-200'}>
              {preview.confidence ?? '—'}
            </span>
            {preview.will_tick_hotel_confirmed ? ' · will tick hotel booked' : ''}
          </p>
          {preview.nights.length === 0 ? (
            <p className="text-slate-500">No nights matched.</p>
          ) : (
            <ul className="list-disc pl-4 space-y-0.5">
              {preview.nights.map(night => (
                <li key={`${night.entry_id}-${night.date}`}>
                  {night.date} · {night.city} · {night.vendor} · {night.action}
                  {night.attached_show_label ? ` → ${night.attached_show_label}` : ''}
                  <span className="block text-slate-500">{night.match_reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
