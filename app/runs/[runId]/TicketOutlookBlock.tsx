'use client'

import { useState } from 'react'
import { formatDateAU } from '@/lib/dates'

export type TicketOutlookShow = {
  id: string
  venue_name: string
  venue_city: string
  state_territory: string | null
  show_date: string | null
  ticket_outlook: string | null
  ticket_outlook_level: 'clear' | 'watch' | 'impediment' | null
  ticket_outlook_status: 'empty' | 'draft' | 'confirmed'
  ticket_outlook_as_of: string | null
  ticket_outlook_sources: unknown
}

type Props = {
  shows: TicketOutlookShow[]
  runSummary: string | null
  isOwnerOrAdmin: boolean
}

const LEVEL: Record<string, { label: string; className: string }> = {
  clear: { label: 'Clear', className: 'bg-emerald-900/40 text-emerald-400 border-emerald-800' },
  watch: { label: 'Watch', className: 'bg-amber-900/40 text-amber-400 border-amber-800' },
  impediment: { label: 'Impediment', className: 'bg-red-900/40 text-red-400 border-red-800' },
}

function sourcesList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(s => (typeof s === 'string' ? s : typeof s === 'object' && s && 'label' in s ? String((s as { label: unknown }).label) : '')).filter(Boolean)
}

function ShowOutlookCard({
  show,
  isOwnerOrAdmin,
}: {
  show: TicketOutlookShow
  isOwnerOrAdmin: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [level, setLevel] = useState(show.ticket_outlook_level ?? 'watch')
  const [text, setText] = useState(show.ticket_outlook ?? '')
  const [status, setStatus] = useState(show.ticket_outlook_status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(show)

  async function save(nextStatus: 'draft' | 'confirmed') {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/shows/${show.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_outlook: text.trim() || null,
        ticket_outlook_level: text.trim() ? level : null,
        ticket_outlook_status: text.trim() ? nextStatus : 'empty',
        ticket_outlook_as_of: text.trim() ? new Date().toISOString() : null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Save failed'); return }
    setLive({
      ...live,
      ticket_outlook: data.ticket_outlook,
      ticket_outlook_level: data.ticket_outlook_level,
      ticket_outlook_status: data.ticket_outlook_status,
      ticket_outlook_as_of: data.ticket_outlook_as_of,
    })
    setStatus(data.ticket_outlook_status)
    setEditing(false)
  }

  const levelMeta = live.ticket_outlook_level ? LEVEL[live.ticket_outlook_level] : null
  const src = sourcesList(live.ticket_outlook_sources)

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-white text-sm font-semibold truncate">{live.venue_name}</div>
          <div className="text-slate-500 text-xs mt-0.5">
            {live.venue_city}{live.state_territory ? `, ${live.state_territory}` : ''}
            {live.show_date ? ` · ${formatDateAU(live.show_date)}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {levelMeta ? (
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${levelMeta.className}`}>
              {levelMeta.label}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase border border-slate-600 text-slate-500">
              Pending research
            </span>
          )}
          {status === 'draft' && (
            <span className="text-[10px] uppercase tracking-wide text-amber-500/80">Draft</span>
          )}
          {status === 'confirmed' && (
            <span className="text-[10px] uppercase tracking-wide text-emerald-500/80">Confirmed</span>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {(['clear', 'watch', 'impediment'] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={`px-2 py-1 rounded text-xs border transition-colors ${
                  level === l ? LEVEL[l].className : 'border-slate-600 text-slate-400 hover:border-slate-500'
                }`}
              >
                {LEVEL[l].label}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm leading-relaxed resize-none focus:outline-none focus:border-amber-400"
            placeholder="1–2 paragraphs: competing events, tributes, sport, venue track record — or say nothing solid found yet."
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => save('draft')}
              disabled={saving}
              className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-slate-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              onClick={() => save('confirmed')}
              disabled={saving || !text.trim()}
              className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setText(live.ticket_outlook ?? '')
                setLevel(live.ticket_outlook_level ?? 'watch')
                setError(null)
              }}
              className="text-slate-500 hover:text-slate-300 text-xs px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          {live.ticket_outlook ? (
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{live.ticket_outlook}</p>
          ) : (
            <p className="text-slate-500 text-sm italic">
              No ticket-sales outlook yet — Nigel researches when Harbour delivers / updates this show.
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            {live.ticket_outlook_as_of && (
              <span className="text-slate-600 text-[11px]">
                As of {formatDateAU(live.ticket_outlook_as_of.slice(0, 10))}
              </span>
            )}
            {src.length > 0 && (
              <span className="text-slate-600 text-[11px] truncate max-w-full">
                Sources: {src.join('; ')}
              </span>
            )}
            {isOwnerOrAdmin && (
              <button
                onClick={() => setEditing(true)}
                className="text-slate-500 hover:text-amber-400 text-xs ml-auto"
              >
                {live.ticket_outlook ? 'Edit' : 'Add outlook'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TicketOutlookBlock({ shows, runSummary, isOwnerOrAdmin }: Props) {
  return (
    <div>
      <p className="text-slate-500 text-xs mb-3">
        Per-show research drafts — Clear / Watch / Impediment. Confirm when you’re happy with the brief.
      </p>
      {runSummary ? (
        <div className="mb-3 bg-slate-800/30 border border-slate-700/80 rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Run-level</div>
          <p className="text-slate-300 text-sm leading-relaxed">{runSummary}</p>
        </div>
      ) : null}
      <div className="space-y-2">
        {shows.map(s => (
          <ShowOutlookCard key={s.id} show={s} isOwnerOrAdmin={isOwnerOrAdmin} />
        ))}
      </div>
    </div>
  )
}
