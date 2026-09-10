'use client'

import { useMemo, useState } from 'react'
import { formatDateAU } from '@/lib/dates'
import {
  findTourOverlaps,
  isCompleteTour,
  type TourRow,
} from '@/lib/tours'

const inputClass =
  'w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 [color-scheme:dark]'

const labelClass = 'block text-slate-300 text-sm font-medium mb-1.5'

type TourForm = {
  name: string
  date_from: string
  date_to: string
  sort_order: string
}

const EMPTY_FORM: TourForm = {
  name: '',
  date_from: '',
  date_to: '',
  sort_order: '0',
}

function formFromTour(tour: TourRow): TourForm {
  return {
    name: tour.name,
    date_from: tour.date_from ?? '',
    date_to: tour.date_to ?? '',
    sort_order: String(tour.sort_order ?? 0),
  }
}

function payloadFromForm(form: TourForm) {
  return {
    name: form.name,
    date_from: form.date_from || null,
    date_to: form.date_to || null,
    sort_order: form.sort_order === '' ? 0 : Number(form.sort_order),
  }
}

export default function AdminSettingsClient({ initialTours }: { initialTours: TourRow[] }) {
  const [tours, setTours] = useState<TourRow[]>(initialTours)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<TourForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const overlaps = useMemo(() => {
    const preview = tours.map(t => (
      editingId === t.id
        ? {
            ...t,
            name: form.name || t.name,
            date_from: form.date_from || null,
            date_to: form.date_to || null,
            sort_order: Number.isInteger(Number(form.sort_order)) ? Number(form.sort_order) : t.sort_order,
          }
        : t
    ))
    if (editingId === 'new') {
      preview.push({
        id: '__draft__',
        name: form.name || 'New tour',
        date_from: form.date_from || null,
        date_to: form.date_to || null,
        sort_order: Number.isInteger(Number(form.sort_order)) ? Number(form.sort_order) : 0,
      })
    }
    return findTourOverlaps(preview)
  }, [tours, editingId, form])

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 3500)
  }

  function startCreate() {
    setError('')
    setEditingId('new')
    setForm(EMPTY_FORM)
  }

  function startEdit(tour: TourRow) {
    setError('')
    setEditingId(tour.id)
    setForm(formFromTour(tour))
  }

  function cancelEdit() {
    setError('')
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const isNew = editingId === 'new'
    const res = await fetch(isNew ? '/api/tours' : `/api/tours/${editingId}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadFromForm(form)),
    })
    const body = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) {
      setError(body?.error ?? 'Could not save tour.')
      return
    }
    setTours(prev => {
      if (isNew) return [...prev, body as TourRow].sort((a, b) => (
        a.sort_order - b.sort_order || (a.date_from ?? '').localeCompare(b.date_from ?? '') || a.name.localeCompare(b.name)
      ))
      return prev.map(t => t.id === editingId ? body as TourRow : t)
    })
    cancelEdit()
    flash(isNew ? 'Tour added.' : 'Tour saved.')
  }

  async function remove(tour: TourRow) {
    if (!window.confirm(`Delete “${tour.name}”? Runs stay; they will regroup from remaining Tours.`)) return
    setError('')
    const res = await fetch(`/api/tours/${tour.id}`, { method: 'DELETE' })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setError(body?.error ?? 'Could not delete tour.')
      return
    }
    setTours(prev => prev.filter(t => t.id !== tour.id))
    if (editingId === tour.id) cancelEdit()
    flash('Tour deleted.')
  }

  return (
    <div className="relative p-6 max-w-4xl" data-testid="admin-settings-tours">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-emerald-900/90 border border-emerald-600 text-emerald-200 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Tour seasons for Run Costings and Advancing Shows. Date ranges here are the source of truth —
          assignment is computed from show dates. Incomplete Tours (missing a date) stay on this page until both dates are set.
        </p>
      </div>

      {overlaps.length > 0 && (
        <div
          className="mb-5 rounded-xl border border-amber-700/70 bg-amber-950/40 px-4 py-3 text-sm text-amber-200"
          data-testid="tour-overlap-warning"
        >
          <p className="font-semibold text-amber-300 mb-1">Overlapping tour dates</p>
          <p className="text-amber-200/80 mb-2">
            Save is allowed. Each show is assigned to the first matching Tour (sort order, then start date, then name).
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {overlaps.map(pair => (
              <li key={`${pair.a.id}-${pair.b.id}`}>
                {pair.a.name} ({formatDateAU(pair.a.date_from)} – {formatDateAU(pair.a.date_to)}) overlaps{' '}
                {pair.b.name} ({formatDateAU(pair.b.date_from)} – {formatDateAU(pair.b.date_to)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-3">
          <h2 className="text-white font-semibold">Tours</h2>
          <button
            type="button"
            onClick={startCreate}
            disabled={editingId === 'new'}
            className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            + Add tour
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Name</th>
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">From</th>
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">To</th>
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Sort</th>
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Tabs</th>
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tours.length === 0 && editingId !== 'new' && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No tours yet. Add a season, then set both dates to show it as a tab.
                  </td>
                </tr>
              )}
              {tours.map(tour => {
                const complete = isCompleteTour(tour)
                return (
                  <tr key={tour.id} className="border-b border-slate-700/50" data-testid="tour-settings-row">
                    <td className="px-4 py-3 text-white text-sm">{tour.name}</td>
                    <td className="px-4 py-3 text-slate-300 text-sm whitespace-nowrap">{formatDateAU(tour.date_from)}</td>
                    <td className="px-4 py-3 text-slate-300 text-sm whitespace-nowrap">{formatDateAU(tour.date_to)}</td>
                    <td className="px-4 py-3 text-slate-400 text-sm">{tour.sort_order}</td>
                    <td className="px-4 py-3">
                      {complete ? (
                        <span className="px-2 py-0.5 rounded border text-xs font-medium bg-green-900/40 text-green-400 border-green-800">
                          On lists
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded border text-xs font-medium bg-slate-700 text-slate-400 border-slate-600">
                          Dates needed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(tour)}
                        className="text-xs text-slate-400 hover:text-amber-400 transition-colors mr-3"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(tour)}
                        className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingId && (
        <form onSubmit={save} className="bg-slate-800 rounded-xl border border-slate-700 p-6 mt-5 space-y-4">
          <h2 className="text-white font-semibold">{editingId === 'new' ? 'Add tour' : 'Edit tour'}</h2>
          <div>
            <label className={labelClass}>Name</label>
            <input
              className={inputClass}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>From</label>
              <input
                className={inputClass}
                type="date"
                value={form.date_from}
                onChange={e => setForm(f => ({ ...f, date_from: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>To</label>
              <input
                className={inputClass}
                type="date"
                value={form.date_to}
                onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Sort order</label>
              <input
                className={inputClass}
                type="number"
                step="1"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
              />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : editingId === 'new' ? 'Add tour' : 'Save tour'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="text-slate-400 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
