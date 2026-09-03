'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useProfile } from '@/lib/profile-context'
import { formatDateAU, formatDateTimeAU } from '@/lib/dates'
import {
  SCHEDULE_DEFAULTS,
  SETS_DEFAULT,
  displayOrDefault,
} from '@/lib/worksheet-fields'

type PackShow = {
  id: string
  venue_name: string
  venue_city: string
  state_territory: string | null
  show_date: string | null
  capacity: number | null
  show_order: number
  michael_notes: string | null
  venue_address: string | null
  venue_phone: string | null
  venue_contact: string | null
  sets_label: string | null
  production_company: string | null
  production_contact: string | null
  backline_company: string | null
  backline_contact: string | null
  sched_access: string | null
  sched_soundcheck: string | null
  sched_dinner: string | null
  sched_doors: string | null
  sched_show: string | null
  sched_finish: string | null
  travel_access_notes: string | null
  hotel_notes: string | null
  hospitality_merch_notes: string | null
}

type PackRun = {
  id: string
  code: string
  name: string
  region: string
  start_date: string | null
  end_date: string | null
  synopsis: string | null
  show_pack_status: 'draft' | 'published'
  show_pack_published_at: string | null
  show_pack_published_by: string | null
  published_by_name: string | null
  flights_notes: string | null
  vehicles_notes: string | null
  hotels_overview_notes: string | null
}

const REGION_LABELS: Record<string, string> = {
  group1: 'Group 1 · Self-drive',
  group2: 'Group 2 · Fly + Van',
  group3: 'Group 3 · Fly + Local Backline',
}

const emptyShowFields = {
  michael_notes: null,
  venue_address: null,
  venue_phone: null,
  venue_contact: null,
  sets_label: null,
  production_company: null,
  production_contact: null,
  backline_company: null,
  backline_contact: null,
  sched_access: null,
  sched_soundcheck: null,
  sched_dinner: null,
  sched_doors: null,
  sched_show: null,
  sched_finish: null,
  travel_access_notes: null,
  hotel_notes: null,
  hospitality_merch_notes: null,
} satisfies Partial<PackShow>

function Field({ label, value }: { label: string; value: string }) {
  const isTbc = value === 'TBC'
  return (
    <div className="flex gap-2 text-sm py-0.5">
      <span className="text-slate-500 w-28 flex-shrink-0">{label}</span>
      <span className={isTbc ? 'text-slate-600 italic' : 'text-slate-200'}>{value}</span>
    </div>
  )
}

function EditableInput({
  label,
  value,
  placeholder,
  canEdit,
  onSave,
  multiline,
}: {
  label: string
  value: string
  placeholder?: string
  canEdit: boolean
  onSave: (next: string) => void
  multiline?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setDraft(value)
  }, [value, dirty])

  function commit() {
    if (!canEdit) return
    setDirty(false)
    if (draft !== value) onSave(draft)
  }

  const inputClass =
    'w-full text-sm bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 disabled:opacity-70'

  return (
    <div className={`flex gap-2 text-sm py-0.5 ${multiline ? 'items-start' : 'items-center'}`}>
      <span className="text-slate-500 w-28 flex-shrink-0 pt-1">{label}</span>
      {multiline ? (
        <textarea
          value={draft}
          disabled={!canEdit}
          rows={3}
          placeholder={placeholder ?? 'TBC'}
          onChange={e => { setDraft(e.target.value); setDirty(true) }}
          onBlur={commit}
          className={inputClass}
        />
      ) : (
        <input
          type="text"
          value={draft}
          disabled={!canEdit}
          placeholder={placeholder ?? 'TBC'}
          onChange={e => { setDraft(e.target.value); setDirty(true) }}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={inputClass}
        />
      )}
    </div>
  )
}

export default function ShowPackTab({
  runId,
  runCode,
  runName,
  region,
  startDate,
  endDate,
  synopsis,
  initialShows,
}: {
  runId: string
  runCode: string
  runName: string
  region: string
  startDate: string | null
  endDate: string | null
  synopsis: string | null
  initialShows: {
    id: string
    venue_name: string
    venue_city: string
    state_territory: string | null
    show_date: string | null
    capacity: number | null
    show_order: number
  }[]
}) {
  const { effectiveRole, profile } = useProfile()
  const [run, setRun] = useState<PackRun | null>(null)
  const [shows, setShows] = useState<PackShow[]>(() =>
    initialShows.map(s => ({ ...s, ...emptyShowFields })),
  )
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const lookupDone = useRef<Set<string>>(new Set())

  const canPublish = ['owner', 'admin', 'production'].includes(effectiveRole)
  const canEdit = canPublish
  const isGroup3 = region === 'group3'

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const saveShowFields = useCallback((showId: string, fields: Record<string, string>) => {
    startTransition(async () => {
      const res = await fetch(`/api/runs/${runId}/show-pack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_id: showId, fields }),
      })
      const data = await res.json()
      if (res.ok && data.show) {
        setShows(prev => prev.map(s => s.id === showId ? { ...s, ...data.show } : s))
      } else {
        showToast(data.error ?? 'Save failed')
      }
    })
  }, [runId])

  const saveRunFields = useCallback((fields: Record<string, string>) => {
    startTransition(async () => {
      const res = await fetch(`/api/runs/${runId}/show-pack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      const data = await res.json()
      if (res.ok && data.run) {
        setRun(prev => prev ? { ...prev, ...data.run } : prev)
      } else {
        showToast(data.error ?? 'Save failed')
      }
    })
  }, [runId])

  async function lookupVenue(showId: string, silent = false) {
    if (lookupDone.current.has(showId)) return
    lookupDone.current.add(showId)
    try {
      const res = await fetch(`/api/shows/${showId}/lookup-venue`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.show) {
        setShows(prev => prev.map(s => s.id === showId ? { ...s, ...data.show } : s))
        if (data.looked_up) showToast(data.message ?? 'Looked up address')
        else if (!silent) showToast(data.message ?? 'Could not find — fill manually')
      } else if (!silent) {
        showToast(data.error ?? 'Lookup failed')
      }
    } catch {
      if (!silent) showToast('Lookup failed')
    }
  }

  useEffect(() => {
    fetch(`/api/runs/${runId}/show-pack`)
      .then(r => r.json())
      .then(data => {
        if (data?.run) setRun(data.run)
        if (Array.isArray(data?.shows)) {
          setShows(data.shows)
          // Auto-lookup once per show when address + phone empty
          for (const s of data.shows as PackShow[]) {
            const noAddr = !(s.venue_address && s.venue_address.trim())
            const noPhone = !(s.venue_phone && s.venue_phone.trim())
            if (noAddr && noPhone && canEdit) {
              lookupVenue(s.id, true)
            }
          }
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  function publish() {
    if (!canPublish) return
    startTransition(async () => {
      const res = await fetch(`/api/runs/${runId}/show-pack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      })
      const data = await res.json()
      if (res.ok && data.run) {
        setRun(prev => prev ? {
          ...prev,
          ...data.run,
          published_by_name: profile?.full_name ?? prev.published_by_name,
        } : prev)
        showToast('Worksheet published ✓ (band email stubbed — not sent)')
      } else {
        showToast(data.error ?? 'Publish failed')
      }
    })
  }

  function unpublish() {
    if (!canPublish) return
    startTransition(async () => {
      const res = await fetch(`/api/runs/${runId}/show-pack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unpublish' }),
      })
      const data = await res.json()
      if (res.ok && data.run) {
        setRun(prev => prev ? { ...prev, ...data.run, published_by_name: null } : prev)
        showToast('Returned to draft')
      } else {
        showToast(data.error ?? 'Failed')
      }
    })
  }

  if (loading && !run) {
    return <div className="text-slate-500 text-sm py-8 text-center">Loading Worksheet…</div>
  }

  const status = run?.show_pack_status ?? 'draft'
  const sortedShows = [...shows].sort((a, b) => a.show_order - b.show_order)
  const multiShow = sortedShows.length > 1

  return (
    <div className="relative">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-emerald-900/90 border border-emerald-600 text-emerald-200 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-white font-semibold text-lg">Worksheet</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Staff draft view · Issued ~T-10 after Michael approve · Band portal later
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded border uppercase tracking-wide ${
            status === 'published'
              ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
              : 'bg-slate-800 text-slate-400 border-slate-600'
          }`}>
            {status}
          </span>
          {canPublish && status === 'draft' && (
            <button
              onClick={publish}
              disabled={isPending}
              className="text-xs font-semibold px-3 py-1.5 rounded bg-amber-400 text-slate-900 hover:bg-amber-300 transition-colors disabled:opacity-50"
            >
              Publish
            </button>
          )}
          {canPublish && status === 'published' && (
            <button
              onClick={unpublish}
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              Unpublish
            </button>
          )}
        </div>
      </div>

      {status === 'published' && run?.show_pack_published_at && (
        <div className="mb-4 text-xs text-emerald-400/80">
          Published {formatDateTimeAU(run.show_pack_published_at)}
          {run.published_by_name ? ` by ${run.published_by_name}` : ''}
          {' · '}band email + PDF not sent (stub)
        </div>
      )}

      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
        {multiShow && (
          <section className="bg-slate-800/40 border border-slate-700 rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80 mb-3">
              Page 1 — Run overview
            </div>
            <div className="text-white font-bold text-xl mb-1">{runName || run?.name}</div>
            <div className="text-amber-400 font-mono text-sm mb-3">{runCode || run?.code}</div>
            <Field label="Dates" value={
              startDate
                ? `${formatDateAU(startDate)}${endDate && endDate !== startDate ? ` – ${formatDateAU(endDate)}` : ''}`
                : 'TBC'
            } />
            <Field label="Travel type" value={REGION_LABELS[region] ?? region ?? 'TBC'} />
            <Field label="Shows" value={String(sortedShows.length)} />
            <EditableInput
              label="Flights / PAX"
              value={run?.flights_notes ?? ''}
              canEdit={canEdit}
              onSave={v => saveRunFields({ flights_notes: v })}
            />
            <EditableInput
              label="Cars / vans"
              value={run?.vehicles_notes ?? ''}
              canEdit={canEdit}
              onSave={v => saveRunFields({ vehicles_notes: v })}
            />
            <EditableInput
              label="Hotel nights"
              value={run?.hotels_overview_notes ?? ''}
              canEdit={canEdit}
              onSave={v => saveRunFields({ hotels_overview_notes: v })}
            />
            {(synopsis || run?.synopsis) && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="text-slate-500 text-xs mb-1">Synopsis</div>
                <p className="text-slate-300 text-sm whitespace-pre-wrap">{synopsis || run?.synopsis}</p>
              </div>
            )}
          </section>
        )}

        {sortedShows.map((show, idx) => {
          const cityLine = [show.venue_city, show.state_territory].filter(Boolean).join(', ')
          return (
            <section key={show.id} className="bg-slate-800/40 border border-slate-700 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80 mb-1">
                    {multiShow ? `Show ${idx + 1}` : 'Worksheet'}
                  </div>
                  <div className="text-white font-bold text-lg">{show.venue_name}</div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>Draft: Nigel</div>
                  <div>Approved: Michael {status === 'published' ? '✓' : '______'}</div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0 mb-4">
                <Field label="Date" value={show.show_date ? formatDateAU(show.show_date) : 'TBC'} />
                <Field label="Event" value={show.venue_name} />
                <Field label="City" value={cityLine || 'TBC'} />
                <EditableInput
                  label="Sets"
                  value={displayOrDefault(show.sets_label, SETS_DEFAULT)}
                  placeholder={SETS_DEFAULT}
                  canEdit={canEdit}
                  onSave={v => saveShowFields(show.id, { sets_label: v || SETS_DEFAULT })}
                />
                <Field label="Attire" value="TBC" />
                <Field label="Capacity" value={show.capacity != null ? String(show.capacity) : 'TBC'} />
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Venue</div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        lookupDone.current.delete(show.id)
                        lookupVenue(show.id, false)
                      }}
                      className="text-xs text-slate-500 hover:text-amber-400 transition-colors"
                    >
                      Lookup address
                    </button>
                  )}
                </div>
                <Field label="Name" value={show.venue_name} />
                <EditableInput
                  label="Address"
                  value={show.venue_address ?? ''}
                  canEdit={canEdit}
                  onSave={v => saveShowFields(show.id, { venue_address: v })}
                />
                <EditableInput
                  label="Phone"
                  value={show.venue_phone ?? ''}
                  canEdit={canEdit}
                  onSave={v => saveShowFields(show.id, { venue_phone: v })}
                />
                <EditableInput
                  label="Contact"
                  value={show.venue_contact ?? ''}
                  canEdit={canEdit}
                  onSave={v => saveShowFields(show.id, { venue_contact: v })}
                />
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Production</div>
                <EditableInput
                  label="Company"
                  value={show.production_company ?? ''}
                  canEdit={canEdit}
                  onSave={v => saveShowFields(show.id, { production_company: v })}
                />
                <EditableInput
                  label="Contact"
                  value={show.production_contact ?? ''}
                  canEdit={canEdit}
                  onSave={v => saveShowFields(show.id, { production_contact: v })}
                />
              </div>

              {isGroup3 && (
                <div className="border-t border-slate-700 pt-3 mb-3">
                  <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Backline (G3)</div>
                  <EditableInput
                    label="Company"
                    value={show.backline_company ?? ''}
                    canEdit={canEdit}
                    onSave={v => saveShowFields(show.id, { backline_company: v })}
                  />
                  <EditableInput
                    label="Contact"
                    value={show.backline_contact ?? ''}
                    canEdit={canEdit}
                    onSave={v => saveShowFields(show.id, { backline_contact: v })}
                  />
                </div>
              )}

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Day schedule</div>
                {(
                  [
                    ['Access', 'sched_access', SCHEDULE_DEFAULTS.sched_access],
                    ['Soundcheck', 'sched_soundcheck', SCHEDULE_DEFAULTS.sched_soundcheck],
                    ['Dinner', 'sched_dinner', SCHEDULE_DEFAULTS.sched_dinner],
                    ['Doors', 'sched_doors', SCHEDULE_DEFAULTS.sched_doors],
                    ['Show Time', 'sched_show', SCHEDULE_DEFAULTS.sched_show],
                    ['Finish / M&G', 'sched_finish', SCHEDULE_DEFAULTS.sched_finish],
                  ] as const
                ).map(([label, key, def]) => (
                  <EditableInput
                    key={key}
                    label={label}
                    value={displayOrDefault(show[key], def)}
                    placeholder={def}
                    canEdit={canEdit}
                    onSave={v => saveShowFields(show.id, { [key]: v || def })}
                  />
                ))}
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Travel / access / parking</div>
                <EditableInput
                  label="Notes"
                  value={show.travel_access_notes ?? show.michael_notes ?? ''}
                  canEdit={canEdit}
                  multiline
                  placeholder="Access, parking, travel notes…"
                  onSave={v => saveShowFields(show.id, { travel_access_notes: v })}
                />
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Hotel</div>
                <EditableInput
                  label="Notes"
                  value={show.hotel_notes ?? ''}
                  canEdit={canEdit}
                  multiline
                  placeholder="Hotel free-text (wire up later)"
                  onSave={v => saveShowFields(show.id, { hotel_notes: v })}
                />
              </div>

              <div className="border-t border-slate-700 pt-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Hospitality / merch</div>
                <EditableInput
                  label="Notes"
                  value={show.hospitality_merch_notes ?? ''}
                  canEdit={canEdit}
                  multiline
                  placeholder="Hospitality / merch free-text"
                  onSave={v => saveShowFields(show.id, { hospitality_merch_notes: v })}
                />
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
