'use client'

import { useEffect, useState, useTransition } from 'react'
import { useProfile } from '@/lib/profile-context'
import {
  ADVANCEMENT_CHECKLIST,
  CATEGORY_ORDER,
  OWNER_LABELS,
  OWNER_STYLES,
  type AssignedTo,
} from '@/lib/advancement-checklist'

type ItemStatus = 'pending' | 'done' | 'n_a'

type AdvancementItem = {
  id: string
  run_id: string
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
  const [isPending, startTransition] = useTransition()

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
        {/* Status toggle */}
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

        {/* Label */}
        <span className={`flex-1 text-sm leading-snug ${isDone ? 'line-through text-slate-500' : 'text-slate-200'}`}>
          {item.label}
        </span>

        {/* Owner badge */}
        <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${OWNER_STYLES[item.assigned_to]}`}>
          {OWNER_LABELS[item.assigned_to]}
        </span>

        {/* Payment badge */}
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

      {/* Notes row */}
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

export default function AdvancementTab({ runId }: { runId: string }) {
  const { effectiveRole } = useProfile()
  const [items, setItems] = useState<AdvancementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | AssignedTo>('all')

  // Owners/admins can edit all; crew can edit only their own (production_manager items in future; for now read-only for crew)
  const isOwnerOrAdmin = ['owner', 'admin'].includes(effectiveRole)
  const isProductionManager = effectiveRole === 'production'

  useEffect(() => {
    fetch(`/api/runs/${runId}/advancement`)
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [runId])

  function updateItem(id: string, updates: Partial<AdvancementItem>) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  const doneCount = items.filter(i => i.status === 'done').length
  const naCount   = items.filter(i => i.status === 'n_a').length
  const totalActive = items.length - naCount
  const pct = totalActive > 0 ? Math.round((doneCount / totalActive) * 100) : 0

  const upfrontPending = items.filter(i => i.payment_type === 'upfront' && !i.paid && i.status !== 'n_a')

  const filteredItems = filter === 'all'
    ? items
    : items.filter(i => i.assigned_to === filter)

  const byCategory: Record<string, AdvancementItem[]> = {}
  for (const item of filteredItems) {
    if (!byCategory[item.category]) byCategory[item.category] = []
    byCategory[item.category].push(item)
  }
  const orderedCategories = CATEGORY_ORDER.filter(c => byCategory[c]?.length)

  // Merge any unsorted categories from checklist
  for (const cat of Object.keys(byCategory)) {
    if (!orderedCategories.includes(cat)) orderedCategories.push(cat)
  }

  if (loading) {
    return <div className="text-slate-500 text-sm py-8 text-center">Loading advancement checklist…</div>
  }

  function canEditItem(item: AdvancementItem) {
    if (isOwnerOrAdmin) return true
    if (isProductionManager && item.assigned_to === 'production_manager') return true
    return false
  }

  const FILTER_OPTIONS: { key: 'all' | AssignedTo; label: string }[] = [
    { key: 'all',                label: 'All' },
    { key: 'tour_manager',       label: 'TM' },
    { key: 'production_manager', label: 'PM' },
    { key: 'finance',            label: 'Finance' },
  ]

  return (
    <div>
      {/* Progress header */}
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

        {/* Filter buttons */}
        <div className="flex gap-1">
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

      {/* Upfront payments alert */}
      {upfrontPending.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded border border-amber-700/60 bg-amber-900/20 text-amber-300 text-xs">
          ⚠ {upfrontPending.length} upfront payment{upfrontPending.length > 1 ? 's' : ''} outstanding — Scott needs to action these before the show.
        </div>
      )}

      {/* Checklist by category */}
      <div className="space-y-5">
        {orderedCategories.map(category => {
          const catItems = byCategory[category] ?? []
          const catDone = catItems.filter(i => i.status === 'done').length
          const catNa   = catItems.filter(i => i.status === 'n_a').length
          const catActive = catItems.length - catNa
          const allDone = catActive > 0 && catDone === catActive

          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${allDone ? 'text-green-500' : 'text-slate-400'}`}>
                  {category}
                </h3>
                <span className="text-slate-600 text-xs">{catDone}/{catActive}</span>
                {allDone && <span className="text-green-500 text-xs">✓</span>}
              </div>
              <div className="divide-y divide-slate-800/60 border border-slate-800 rounded-lg overflow-hidden">
                {catItems.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    canEdit={canEditItem(item)}
                    onUpdate={updates => updateItem(item.id, updates)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-600">
        <span>○ = pending</span>
        <span className="text-green-600">✓ = done</span>
        <span>N/A = not applicable</span>
        <span className="text-blue-600">TM = Tour Manager (Nigel/Gareth)</span>
        <span className="text-purple-600">PM = Production Manager (Michael)</span>
        <span className="text-emerald-600">Finance = Scott</span>
      </div>
    </div>
  )
}
