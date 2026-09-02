import { createAdminClient } from '@/lib/supabase/server-admin'

export const dynamic = 'force-dynamic'
import Link from 'next/link'

const STATUS_STYLES: Record<string, string> = {
  confirmed:  'bg-green-900/40 text-green-400 border-green-800',
  proposed:   'bg-amber-900/40 text-amber-400 border-amber-800',
  booking:    'bg-blue-900/40 text-blue-400 border-blue-800',
  show_week:  'bg-purple-900/40 text-purple-400 border-purple-800',
  post_show:  'bg-orange-900/40 text-orange-400 border-orange-800',
  settled:    'bg-slate-700 text-slate-400 border-slate-600',
}

function fmt(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Run = {
  id: string
  code: string
  name: string
  status: string
  region: string
  start_date: string | null
  end_date: string | null
  completion_pct: number
}

export default async function MissionControl() {
  const supabase = createAdminClient()
  const [{ data: runs }, { count: totalShows }] = await Promise.all([
    supabase.from('runs').select('*').order('start_date', { ascending: true }),
    supabase.from('shows').select('*', { count: 'exact', head: true }),
  ])

  const typedRuns = (runs ?? []) as Run[]
  const today = new Date().toISOString().split('T')[0]

  const confirmed = typedRuns.filter(r => r.status === 'confirmed')
  const proposed = typedRuns.filter(r => r.status === 'proposed')
  const upcoming = typedRuns.filter(r => r.start_date && r.start_date >= today).slice(0, 5)
  const nextRun = upcoming[0]

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-white text-2xl font-bold">Mission Control</h1>
        <p className="text-slate-400 text-sm mt-1">Greatest Hits Tour: Don&#39;t Stop Us Now</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 px-4 py-3 sm:px-5 sm:py-4">
          <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Confirmed Runs</div>
          <div className="text-3xl font-bold text-green-400">{confirmed.length}</div>
          <div className="text-slate-500 text-xs mt-1">of {typedRuns.length} total</div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 px-4 py-3 sm:px-5 sm:py-4">
          <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Proposed / Held</div>
          <div className="text-3xl font-bold text-amber-400">{proposed.length}</div>
          <div className="text-slate-500 text-xs mt-1">awaiting confirmation</div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 px-4 py-3 sm:px-5 sm:py-4">
          <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Next Run</div>
          <div className="text-lg font-bold text-white truncate">{nextRun?.code ?? '—'}</div>
          <div className="text-slate-500 text-xs mt-1">{nextRun ? fmt(nextRun.start_date) : 'None upcoming'}</div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 px-4 py-3 sm:px-5 sm:py-4">
          <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Total Shows</div>
          <div className="text-3xl font-bold text-blue-400">{totalShows ?? 0}</div>
          <div className="text-slate-500 text-xs mt-1">across all runs</div>
        </div>
      </div>

      {/* Upcoming runs */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-white font-semibold">Upcoming Runs</h2>
          <Link href="/runs" className="text-amber-400 text-sm hover:text-amber-300 transition-colors">View all →</Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No upcoming runs.</div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-slate-700/50">
              {upcoming.map(run => {
                const pct = run.completion_pct ?? 0
                const dateStr = run.start_date === run.end_date
                  ? fmt(run.start_date)
                  : `${fmt(run.start_date)} – ${fmt(run.end_date)}`
                return (
                  <Link
                    key={run.id}
                    href={`/runs/${run.code.toLowerCase()}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-700/30 transition-colors"
                  >
                    <span className="text-amber-400 font-bold text-sm w-12 flex-shrink-0">{run.code}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{run.name}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{dateStr}</div>
                    </div>
                    <span className={`flex-shrink-0 px-2 py-0.5 rounded border text-xs font-medium uppercase ${STATUS_STYLES[run.status] ?? STATUS_STYLES.confirmed}`}>
                      {run.status.replace('_', ' ')}
                    </span>
                  </Link>
                )
              })}
            </div>

            {/* Desktop: full table */}
            <table className="hidden md:table w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Code</th>
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Run</th>
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Status</th>
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Dates</th>
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Complete</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((run, i) => {
                  const pct = run.completion_pct ?? 0
                  return (
                    <tr key={run.id} className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${i === upcoming.length - 1 ? 'border-0' : ''}`}>
                      <td className="px-4 py-3">
                        <span className="text-amber-400 font-bold text-sm">{run.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/runs/${run.code.toLowerCase()}`} className="text-white text-sm hover:text-amber-400 transition-colors">
                          {run.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded border text-xs font-medium uppercase ${STATUS_STYLES[run.status] ?? STATUS_STYLES.confirmed}`}>
                          {run.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-sm">
                        {run.start_date === run.end_date ? fmt(run.start_date) : `${fmt(run.start_date)} – ${fmt(run.end_date)}`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-700 rounded-full">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-slate-500 text-xs">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
