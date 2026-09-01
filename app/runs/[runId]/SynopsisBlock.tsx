'use client'

import { useState } from 'react'

type Props = {
  runId: string
  initialText: string
  isOwnerOrAdmin: boolean
}

export default function SynopsisBlock({ runId, initialText, isOwnerOrAdmin }: Props) {
  const [text, setText] = useState(initialText)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialText)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/runs/${runId}/synopsis`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ synopsis: draft }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Save failed'); return }
    setText(draft)
    setEditing(false)
  }

  function cancel() {
    setDraft(text)
    setEditing(false)
    setError(null)
  }

  return (
    <div className="mb-6 bg-slate-800/40 border border-slate-700 rounded-xl px-5 py-4 group/synopsis">
      {editing ? (
        <div className="space-y-3">
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={5}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-200 text-sm leading-relaxed resize-none focus:outline-none focus:border-amber-400 transition-colors"
            placeholder="Describe the run plan — how you get there, transport, backline, arrival/return days..."
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={cancel}
              className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1.5 transition-colors"
            >
              Cancel
            </button>
            <span className="text-slate-600 text-xs ml-auto">Editing will override the auto-generated text</span>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <p className="text-slate-300 text-sm leading-relaxed flex-1">{text}</p>
          {isOwnerOrAdmin && (
            <button
              onClick={() => { setDraft(text); setEditing(true) }}
              className="opacity-0 group-hover/synopsis:opacity-100 text-slate-600 hover:text-amber-400 text-xs transition-all flex-shrink-0 mt-0.5"
              title="Edit synopsis"
            >
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  )
}
