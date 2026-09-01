'use client'

import { useState } from 'react'

type Factor = {
  id: string
  key: string
  label: string
  category: string
  value: number
  unit: string
  description: string | null
  updated_at: string
}

function fmt(val: number, unit: string) {
  if (unit.startsWith('$') && !unit.includes('/')) return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  if (unit === '%') return `${val}%`
  return `${val} ${unit}`
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function FactorRow({ factor, onUpdated }: { factor: Factor; onUpdated: (updated: Factor) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(factor.value.toString())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch('/api/factors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: factor.key, value: val }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Save failed'); return }
    onUpdated(data as Factor)
    setEditing(false)
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-800 last:border-0 group hover:bg-slate-800/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200 font-medium">{factor.label}</div>
        {factor.description && (
          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{factor.description}</div>
        )}
        <div className="text-xs text-slate-600 mt-1">Last updated {fmtDate(factor.updated_at)}</div>
        {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {editing ? (
          <>
            <span className="text-slate-400 text-xs">{factor.unit}</span>
            <input
              autoFocus
              type="number"
              value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(factor.value.toString()) } }}
              className="w-28 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-amber-400 text-right"
              step="any"
            />
            <button
              onClick={save}
              disabled={saving}
              className="bg-amber-400 text-slate-900 text-xs font-semibold px-2.5 py-1 rounded hover:bg-amber-300 disabled:opacity-50 transition-colors"
            >
              {saving ? '…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setVal(factor.value.toString()); setError(null) }}
              className="text-slate-500 hover:text-slate-300 text-xs px-1 transition-colors"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-amber-400 tabular-nums">{fmt(factor.value, factor.unit)}</span>
            <button
              onClick={() => setEditing(true)}
              className="text-slate-600 hover:text-amber-400 text-xs transition-colors opacity-0 group-hover:opacity-100"
            >
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function FactorsClient({ initialFactors }: { initialFactors: Factor[] }) {
  const [factors, setFactors] = useState(initialFactors)

  function handleUpdated(updated: Factor) {
    setFactors(prev => prev.map(f => f.key === updated.key ? updated : f))
  }

  const byCategory = factors.reduce<Record<string, Factor[]>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = []
    acc[f.category].push(f)
    return acc
  }, {})

  const categoryOrder = ['Revenue', 'Travel & Accommodation', 'Crew & Operations', 'Production', 'Marketing']
  const orderedCategories = [
    ...categoryOrder.filter(c => byCategory[c]),
    ...Object.keys(byCategory).filter(c => !categoryOrder.includes(c)),
  ]

  return (
    <div className="space-y-6">
      {orderedCategories.map(category => (
        <div key={category} className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/80">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{category}</h2>
          </div>
          {byCategory[category].map(factor => (
            <FactorRow key={factor.key} factor={factor} onUpdated={handleUpdated} />
          ))}
        </div>
      ))}
    </div>
  )
}
