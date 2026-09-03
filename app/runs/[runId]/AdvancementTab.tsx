'use client'

import { useEffect, useState, useTransition } from 'react'
import { useProfile } from '@/lib/profile-context'
import { formatDateShortAU } from '@/lib/dates'
import {
  PHASE_ORDER,
  OWNER_LABELS,
  OWNER_STYLES,
  FILTER_OWNERS,
  ASSIGNABLE_OWNERS,
  REGION_LABELS,
  normalizeAssignedTo,
  type AssignedTo,
  type RunRegion,
} from '@/lib/advancement-checklist'

type ItemStatus = 'pending' | 'done' | 'n_a'

type AdvancementItem = {
  id: string
  run_id: string
  show_id: string | null
  category: string
  item_key: string
  label: string
  assigned_to: AssignedTo
  status: ItemStatus
  notes: string | null
  payment_type: 'upfront' | 'post_gig' | null
  paid: boolean
  sort_order: number
  updated_at: string
}

type ShowInfo = {
  id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  show_order: number
}

const STATUS_CYCLE: ItemStatus[] = ['pending', 'done', 'n_a']

function statusIcon(status: ItemStatus) {
  if (status === 'done') return <span className="text-green-400 font-bold text-sm">✓</span>
  if (status === 'n_a')  return <span className="text-slate-500 font-bold text-sm line-through">N/A</span>
  return <span className="text-slate-600 text-sm">○</span>
}

function ItemRow({
  item,
  canEdit,
  onUpdate,
}: {
  item: AdvancementItem
  canEdit: boolean
  onUpdate: (updated: Partial<AdvancementItem>) => void
}) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesVal, setNotesVal] = useState(item.notes ?? '')
  const [editingMeta, setEditingMeta] = useState(false)
  const [labelVal, setLabelVal] = useState(item.label)
  const [ownerVal, setOwnerVal] = useState<AssignedTo>(normalizeAssignedTo(item.assigned_to))
  const [isPending, startTransition] = useTransition()
  const owner = normalizeAssignedTo(item.assigned_to)

  function cycleStatus() {
    if (!canEdit) return
    const idx = STATUS_CYCLE.indexOf(item.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    startTransition(async () => {
      const res = await fetch(`/api/runs/${item.run_id}/advancement/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) onUpdate({ status: next })
    })
  }

  function saveNotes() {
    startTransition(async () => {
      const res = await fetch(`/api/runs/${item.run_id}/advancement/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesVal }),
      })
      if (res.ok) {
        onUpdate({ notes: notesVal })
        setEditingNotes(false)
      }
    })
  }

  function saveMeta() {
    const nextLabel = labelVal.trim()
    if (!nextLabel) return
    startTransition(async () => {
      const res = await fetch(`/api/runs/${item.run_id}/advancement/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: nextLabel, assigned_to: ownerVal }),
      })
      if (res.ok) {
        const data = await res.json()
        onUpdate({
          label: data.label ?? nextLabel,
          assigned_to: normalizeAssignedTo(data.assigned_to ?? ownerVal),
        })
        setEditingMeta(false)
      }
    })
  }

  function togglePaid() {
    if (!canEdit) return
    const next = !item.paid
    startTransition(async () => {
      const res = await fetch(`/api/runs/${item.run_id}/advancement/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: next }),
      })
      if (res.ok) onUpdate({ paid: next })
    })
  }

  const isDone = item.status === 'done'
  const isNa  = item.status === 'n_a'

  return (
    <div className={`group flex flex-col gap-0.5 py-2 px-3 rounded transition-colors ${
      isDone ? 'bg-green-900/10' : isNa ? 'opacity-40' : 'hover:bg-slate-800/40'
    } ${isPending ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2.5">
        <button
          onClick={cycleStatus}
          disabled={!canEdit}
          title="Click to cycle: pending → done → N/A"
          className={`mt-0.5 w-5 h-5 flex-shrink-0 flex items-center justify-center rounded border transition-colors ${
            isDone ? 'border-green-600 bg-green-900/30' :
            isNa   ? 'border-slate-700 bg-slate-800' :
                     'border-slate-600 hover:border-amber-400 cursor-pointer'
          } ${!canEdit ? 'cursor-default' : ''}`}
        >
          {statusIcon(item.status)}
        </button>

        {editingMeta ? (
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <input
              autoFocus
              value={labelVal}
              onChange={e => setLabelVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveMeta()
                if (e.key === 'Escape') {
                  setEditingMeta(false)
                  setLabelVal(item.label)
                  setOwnerVal(normalizeAssignedTo(item.assigned_to))
                }
              }}
              className="w-full text-sm bg-slate-900 border border-amber-400/50 rounded px-2 py-1 text-white focus:outline-none focus:border-amber-400"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[10px] uppercase tracking-wide text-slate-500">Owner</label>
              <select
                value={ownerVal}
                onChange={e => setOwnerVal(e.target.value as AssignedTo)}
                className="text-xs bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-amber-400"
              >
                {ASSIGNABLE_OWNERS.map(k => (
                  <option key={k} value={k}>{OWNER_LABELS[k]}</option>
                ))}
              </select>
              <button
                onClick={saveMeta}
                className="text-xs bg-amber-400 text-slate-900 font-semibold px-2 py-0.5 rounded hover:bg-amber-300 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingMeta(false)
                  setLabelVal(item.label)
                  setOwnerVal(normalizeAssignedTo(item.assigned_to))
                }}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors px-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <span className={`flex-1 text-sm leading-snug ${isDone ? 'line-through text-slate-500' : 'text-slate-200'}`}>
            {item.label}
          </span>
        )}

        {!editingMeta && (
          <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${OWNER_STYLES[owner]}`}>
            {OWNER_LABELS[owner]}
          </span>
        )}

        {canEdit && !editingMeta && (
          <button
            onClick={() => {
              setLabelVal(item.label)
              setOwnerVal(normalizeAssignedTo(item.assigned_to))
              setEditingMeta(true)
            }}
            title="Edit label / owner"
            className="flex-shrink-0 text-slate-600 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1"
          >
            ✎
          </button>
        )}

        {item.payment_type === 'upfront' && (
          <button
            onClick={togglePaid}
            disabled={!canEdit}
            title={item.paid ? 'Mark as unpaid' : 'Mark as paid'}
            className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide transition-colors ${
              item.paid
                ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700'
                : 'bg-amber-900/40 text-amber-400 border-amber-700 animate-pulse'
            } ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {item.paid ? 'Paid' : '⚠ Upfront'}
          </button>
        )}
      </div>

      {!isNa && (
        <div className="pl-7">
          {editingNotes ? (
            <div className="flex gap-1 mt-1">
              <input
                autoFocus
                value={notesVal}
                onChange={e => setNotesVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveNotes(); if (e.key === 'Escape') setEditingNotes(false) }}
                placeholder="Add a note..."
                className="flex-1 text-xs bg-slate-900 border border-amber-400/50 rounded px-2 py-0.5 text-white focus:outline-none focus:border-amber-400"
              />
              <button onClick={saveNotes} className="text-xs bg-amber-400 text-slate-900 font-semibold px-2 py-0.5 rounded hover:bg-amber-300 transition-colors">Save</button>
              <button onClick={() => { setEditingNotes(false); setNotesVal(item.notes ?? '') }} className="text-slate-500 hover:text-slate-300 text-xs transition-colors px-1">✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1 min-h-[18px]">
              {item.notes ? (
                <span className="text-xs text-slate-400 italic">{item.notes}</span>
              ) : null}
              {canEdit && (
                <button
                  onClick={() => setEditingNotes(true)}
                  className={`text-xs transition-colors ${item.notes ? 'text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100' : 'text-slate-700 hover:text-slate-500 opacity-0 group-hover:opacity-100'}`}
                >
                  {item.notes ? 'edit note' : '+ note'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ItemList({
  items,
  canEditItem,
  onUpdate,
}: {
  items: AdvancementItem[]
  canEditItem: (item: AdvancementItem) => boolean
  onUpdate: (id: string, updates: Partial<AdvancementItem>) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="divide-y divide-slate-800/60 border border-slate-800 rounded-lg overflow-hidden">
      {items.map(item => (
        <ItemRow
          key={item.id}
          item={item}
          canEdit={canEditItem(item)}
          onUpdate={updates => onUpdate(item.id, updates)}
        />
      ))}
    </div>
  )
}

export default function AdvancementTab({
  runId,
  shows,
  region,
}: {
  runId: string
  shows: ShowInfo[]
  region: string
}) {
  const { effectiveRole } = useProfile()
  const [items, setItems] = useState<AdvancementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | AssignedTo>('all')

  const isOwnerOrAdmin = ['owner', 'admin'].includes(effectiveRole)
  const isProductionManager = effectiveRole === 'production'
  const regionKey = (region in REGION_LABELS ? region : 'group2') as RunRegion
  const regionLabel = REGION_LABELS[regionKey]

  useEffect(() => {
    fetch(`/api/runs/${runId}/advancement`)
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [runId])

  function updateItem(id: string, updates: Partial<AdvancementItem>) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  const filteredItems = filter === 'all'
    ? items
    : items.filter(i => normalizeAssignedTo(i.assigned_to) === filter)

  const doneCount = filteredItems.filter(i => i.status === 'done').length
  const naCount = filteredItems.filter(i => i.status === 'n_a').length
  const totalActive = filteredItems.length - naCount
  const pct = totalActive > 0 ? Math.round((doneCount / totalActive) * 100) : 0
  const upfrontPending = items.filter(i => i.payment_type === 'upfront' && !i.paid && i.status !== 'n_a')

  function canEditItem(item: AdvancementItem) {
    if (isOwnerOrAdmin) return true
    const owner = normalizeAssignedTo(item.assigned_to)
    if (isProductionManager && owner === 'michael') return true
    return false
  }

  if (loading) {
    return <div className="text-slate-500 text-sm py-8 text-center">Loading Advancing Shows checklist…</div>
  }

  const FILTER_OPTIONS: { key: 'all' | AssignedTo; label: string }[] = [
    { key: 'all', label: 'All' },
    ...FILTER_OWNERS,
  ]

  const sortedShows = [...shows].sort((a, b) => a.show_order - b.show_order)

  const phases = PHASE_ORDER.map(phase => {
    const phaseItems = filteredItems.filter(i => i.category === phase)
    const runItems = phaseItems.filter(i => i.show_id == null).sort((a, b) => a.sort_order - b.sort_order)
    const byShow: { show: ShowInfo; items: AdvancementItem[] }[] = []
    for (const show of sortedShows) {
      const showItems = phaseItems
        .filter(i => i.show_id === show.id)
        .sort((a, b) => a.sort_order - b.sort_order)
      if (showItems.length > 0) byShow.push({ show, items: showItems })
    }
    return { phase, runItems, byShow, all: phaseItems }
  }).filter(p => p.all.length > 0)

  return (
    <div>
      <div className="mb-4 px-3 py-2 rounded border border-slate-700/80 bg-slate-800/50 text-slate-300 text-xs">
        This run is <span className="text-amber-400 font-semibold">{regionLabel}</span> — checklist filtered
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 text-xs">{doneCount} of {totalActive} items complete</span>
            <span className="text-amber-400 text-xs font-bold">{pct}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: pct === 100 ? '#34d399' : '#f59e0b' }}
            />
          </div>
        </div>

        <div className="flex gap-1 flex-wrap justify-end max-w-[55%]">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                filter === opt.key
                  ? 'border-amber-400 text-amber-400 bg-amber-900/20'
                  : 'border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {upfrontPending.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded border border-amber-700/60 bg-amber-900/20 text-amber-300 text-xs">
          ⚠ {upfrontPending.length} upfront payment{upfrontPending.length > 1 ? 's' : ''} outstanding — Dave / Finance needs to action these before the show.
        </div>
      )}

      <div className="space-y-6">
        {phases.map(({ phase, runItems, byShow, all }) => {
          const catDone = all.filter(i => i.status === 'done').length
          const catNa = all.filter(i => i.status === 'n_a').length
          const catActive = all.length - catNa
          const allDone = catActive > 0 && catDone === catActive

          return (
            <div key={phase}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className={`text-xs font-semibold uppercase tracking-wider ${allDone ? 'text-green-500' : 'text-slate-300'}`}>
                  {phase}
                </h2>
                <span className="text-slate-600 text-xs">{catDone}/{catActive}</span>
                {allDone && <span className="text-green-500 text-xs">✓</span>}
              </div>

              {runItems.length > 0 && (
                <div className="mb-3">
                  <ItemList items={runItems} canEditItem={canEditItem} onUpdate={updateItem} />
                </div>
              )}

              {byShow.length > 0 && (
                <div className="space-y-3">
                  {byShow.map(({ show, items: showItems }) => (
                    <div key={`${phase}-${show.id}`} className="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
                      <div className="mb-2">
                        <div className="text-white text-sm font-semibold">{show.venue_name}</div>
                        <div className="text-slate-500 text-xs mt-0.5">
                          {show.venue_city}
                          {show.show_date ? ` · ${formatDateShortAU(show.show_date)}` : ''}
                        </div>
                      </div>
                      <ItemList items={showItems} canEditItem={canEditItem} onUpdate={updateItem} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {phases.length === 0 && (
          <p className="text-slate-600 text-sm italic">No Advancing Shows items for this filter.</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-600">
        <span>○ = pending</span>
        <span className="text-green-600">✓ = done</span>
        <span>N/A = not applicable</span>
        <span className="text-cyan-600">Harbour</span>
        <span className="text-pink-600">Anita</span>
        <span className="text-blue-600">Gareth (TM)</span>
        <span className="text-purple-600">Michael (PM)</span>
        <span className="text-orange-600">Brad</span>
        <span className="text-emerald-600">Dave (Finance)</span>
        <span className="text-slate-400">Nigel</span>
        <span className="text-slate-500">✎ = edit label / owner</span>
      </div>
    </div>
  )
}
