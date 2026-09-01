'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type FeatureRequest = {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'text-slate-400',
  reviewing: 'text-blue-400',
  planned:   'text-amber-400',
  done:      'text-green-400',
  rejected:  'text-red-400',
}

export default function FeedbackPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from('feature_requests')
        .select('*')
        .eq('submitted_by', user.id)
        .order('created_at', { ascending: false })
      setRequests((data ?? []) as FeatureRequest[])
    }
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setSubmitting(true)

    const supabase = createClient()
    const { data } = await supabase
      .from('feature_requests')
      .insert({ submitted_by: userId, title, description: description || null })
      .select()
      .single()

    if (data) {
      setRequests(prev => [data as FeatureRequest, ...prev])
      setSubmitted(true)
      setTitle('')
      setDescription('')
      setTimeout(() => setSubmitted(false), 4000)
    }

    setSubmitting(false)
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">Feature Requests</h1>
        <p className="text-slate-400 text-sm mt-1">Suggest improvements. Gareth reviews all requests before anything is built.</p>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
        {submitted ? (
          <div className="text-center py-4">
            <div className="text-green-400 text-2xl mb-2">✓</div>
            <p className="text-white font-medium">Request submitted</p>
            <p className="text-slate-400 text-sm mt-1">Gareth will review it and discuss before anything is built.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Add automated flight price tracking"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe the feature and why it would be useful…"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </form>
        )}
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h2 className="text-white font-semibold mb-3">Your previous requests</h2>
        {requests.length === 0 ? (
          <p className="text-slate-500 text-sm">No requests yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="border border-slate-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-white text-sm font-medium">{r.title}</span>
                  <span className={`text-xs uppercase font-medium whitespace-nowrap ${STATUS_STYLES[r.status] ?? 'text-slate-400'}`}>
                    {r.status}
                  </span>
                </div>
                {r.description && <p className="text-slate-400 text-xs mt-1">{r.description}</p>}
                <p className="text-slate-600 text-xs mt-1.5">
                  {new Date(r.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
