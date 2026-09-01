'use client'
import { useEffect, useState } from 'react'
import { Mail, Send, Eye, ChevronDown, ChevronUp, Loader } from 'lucide-react'

interface Draft {
  id: string
  to: string
  cc: string
  subject: string
  body: string
  snippet: string
}

function recipientTag(to: string) {
  if (to.includes('production@queenforever')) return { label: 'Michael', color: '#60a5fa' }
  if (to.includes('harbour') || to.includes('javier') || to.includes('clinton')) return { label: 'Harbour', color: '#a78bfa' }
  if (to.includes('gareth@queenforever') || to.includes('gareth@gareth')) return { label: 'Gareth', color: '#34d399' }
  if (to.includes('gareth@queenforever') && to.includes('PREVIEW')) return { label: 'Preview', color: '#fbbf24' }
  return { label: 'External', color: '#f87171' }
}

export default function EmailDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/emails')
      .then(r => r.json())
      .then(d => { setDrafts(d.drafts || []); setLoading(false) })
      .catch(() => { setError('Failed to load drafts'); setLoading(false) })
  }, [])

  async function sendPreview(id: string) {
    setSending(id)
    try {
      const r = await fetch('/api/emails/preview', { method: 'POST', body: JSON.stringify({ draftId: id }), headers: { 'Content-Type': 'application/json' } })
      if (r.ok) setSent(prev => new Set([...prev, id]))
      else setError('Failed to send preview')
    } catch {
      setError('Network error')
    }
    setSending(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3" style={{ color: 'var(--muted)' }}>
      <Loader size={20} className="animate-spin" />
      <span>Loading drafts from Gmail…</span>
    </div>
  )

  const qfDrafts = drafts.filter(d => !d.subject.includes('QFAI Test'))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>Email Draft Manager</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          {qfDrafts.length} drafts in Gmail · Preview sends to gareth@queenforever.com.au for approval before any external send
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ background: '#1c0a0a', border: '1px solid #7f1d1d', color: '#fca5a5' }}>{error}</div>
      )}

      <div className="space-y-3">
        {qfDrafts.map(draft => {
          const tag = recipientTag(draft.to)
          const isExpanded = expanded === draft.id
          const isSent = sent.has(draft.id)
          return (
            <div key={draft.id} className="rounded-xl overflow-hidden transition-all" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {/* Header row */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpanded(isExpanded ? null : draft.id)}
              >
                <Mail size={16} style={{ color: tag.color, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: tag.color, background: tag.color + '20' }}>{tag.label}</span>
                    <span className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{draft.subject}</span>
                  </div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                    To: {draft.to}{draft.cc ? ` · CC: ${draft.cc}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isSent
                    ? <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: '#052e16', color: 'var(--green)' }}>✓ Preview sent</span>
                    : <button
                        onClick={e => { e.stopPropagation(); sendPreview(draft.id) }}
                        disabled={sending === draft.id}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                        style={{ background: 'var(--gold)', color: '#000' }}
                      >
                        {sending === draft.id ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
                        Send Preview to Gareth
                      </button>
                  }
                  {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted)' }} />}
                </div>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="px-5 py-2 flex gap-6 text-xs" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
                    <span><strong style={{ color: 'var(--text)' }}>To:</strong> {draft.to}</span>
                    {draft.cc && <span><strong style={{ color: 'var(--text)' }}>CC:</strong> {draft.cc}</span>}
                  </div>
                  <pre className="px-5 py-4 text-sm leading-relaxed overflow-auto max-h-96 whitespace-pre-wrap" style={{ color: 'var(--text)', fontFamily: 'inherit' }}>
                    {draft.body}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-xl px-5 py-4 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)' }}>How this works:</strong> "Send Preview to Gareth" routes a copy to gareth@queenforever.com.au.
        Gareth reads and replies with approval. Actual external sending is always done by Gareth — this tool never sends directly to Michael, Harbour, or external parties.
      </div>
    </div>
  )
}
