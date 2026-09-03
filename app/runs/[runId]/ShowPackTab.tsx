'use client'

import { useEffect, useState, useTransition } from 'react'
import { useProfile } from '@/lib/profile-context'
import { formatDateAU, formatDateTimeAU } from '@/lib/dates'

type PackShow = {
  id: string
  venue_name: string
  venue_city: string
  state_territory: string | null
  show_date: string | null
  capacity: number | null
  show_order: number
  michael_notes: string | null
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
}

const REGION_LABELS: Record<string, string> = {
  group1: 'Group 1 · Self-drive',
  group2: 'Group 2 · Fly + Van',
  group3: 'Group 3 · Fly + Local Backline',
}


function Field({ label, value }: { label: string; value: string }) {
  const isTbc = value === 'TBC'
  return (
    <div className="flex gap-2 text-sm py-0.5">
      <span className="text-slate-500 w-28 flex-shrink-0">{label}</span>
      <span className={isTbc ? 'text-slate-600 italic' : 'text-slate-200'}>{value}</span>
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
    initialShows.map(s => ({ ...s, michael_notes: null })),
  )
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [isPending, startTransition] = useTransition()

  const canPublish = ['owner', 'admin', 'production'].includes(effectiveRole)
  const canEditNotes = canPublish

  useEffect(() => {
    fetch(`/api/runs/${runId}/show-pack`)
      .then(r => r.json())
      .then(data => {
        if (data?.run) setRun(data.run)
        if (Array.isArray(data?.shows)) setShows(data.shows)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [runId])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

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

  function saveNotes(showId: string) {
    startTransition(async () => {
      const res = await fetch(`/api/runs/${runId}/show-pack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_id: showId, michael_notes: notesDraft }),
      })
      const data = await res.json()
      if (res.ok && data.show) {
        setShows(prev => prev.map(s => s.id === showId ? { ...s, michael_notes: data.show.michael_notes } : s))
        setEditingNotesId(null)
        showToast('Michael notes saved')
      } else {
        showToast(data.error ?? 'Save failed')
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
        {/* Run overview — multi-show */}
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
            <Field label="Flights / PAX" value="TBC" />
            <Field label="Cars / vans" value="TBC" />
            <Field label="Hotel nights" value="TBC" />
            {(synopsis || run?.synopsis) && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="text-slate-500 text-xs mb-1">Synopsis</div>
                <p className="text-slate-300 text-sm whitespace-pre-wrap">{synopsis || run?.synopsis}</p>
              </div>
            )}
          </section>
        )}

        {/* Per-show pages */}
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
                <Field label="Sets" value="TBC" />
                <Field label="Attire" value="TBC" />
                <Field label="Capacity" value={show.capacity != null ? String(show.capacity) : 'TBC'} />
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Venue</div>
                <Field label="Name" value={show.venue_name} />
                <Field label="Address" value="TBC" />
                <Field label="Phone" value="TBC" />
                <Field label="Contact" value="TBC" />
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Production</div>
                <Field label="Company" value="TBC" />
                <Field label="Contact" value="TBC" />
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Day schedule</div>
                <Field label="Access" value="TBC" />
                <Field label="Soundcheck" value="TBC" />
                <Field label="Dinner" value="TBC" />
                <Field label="Doors" value="TBC" />
                <Field label="Set" value="TBC" />
                <Field label="Finish / M&G" value="TBC" />
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Travel / access / parking</div>
                <p className="text-slate-600 text-sm italic">TBC — never invent phones or flights</p>
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Hotel</div>
                <p className="text-slate-600 text-sm italic">TBC</p>
              </div>

              <div className="border-t border-slate-700 pt-3 mb-3">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Hospitality / merch</div>
                <p className="text-slate-600 text-sm italic">TBC</p>
              </div>

              <div className="border-t border-slate-700 pt-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    Notes (Michael)
                  </div>
                  {canEditNotes && editingNotesId !== show.id && (
                    <button
                      onClick={() => { setEditingNotesId(show.id); setNotesDraft(show.michael_notes ?? '') }}
                      className="text-xs text-slate-500 hover:text-amber-400 transition-colors"
                    >
                      {show.michael_notes ? 'Edit' : '+ Add notes'}
                    </button>
                  )}
                </div>
                {editingNotesId === show.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      rows={4}
                      placeholder="Access, parking, special notes…"
                      className="w-full text-sm bg-slate-900 border border-amber-400/50 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveNotes(show.id)}
                        disabled={isPending}
                        className="text-xs bg-amber-400 text-slate-900 font-semibold px-3 py-1 rounded hover:bg-amber-300 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingNotesId(null)}
                        className="text-xs text-slate-500 hover:text-slate-300 px-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : show.michael_notes ? (
                  <p className="text-slate-300 text-sm whitespace-pre-wrap">{show.michael_notes}</p>
                ) : (
                  <p className="text-slate-600 text-sm italic">No notes yet</p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
