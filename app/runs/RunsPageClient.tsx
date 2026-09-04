'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDateAU } from '@/lib/dates'
import { runDateRangeFromShows } from '@/lib/run-dates'

const STATUS_STYLES: Record<string, string> = {
  confirmed:   'bg-green-900/40 text-green-400 border-green-800',
  proposed:    'bg-amber-900/40 text-amber-400 border-amber-800',
  booking:     'bg-blue-900/40 text-blue-400 border-blue-800',
  show_week:   'bg-purple-900/40 text-purple-400 border-purple-800',
  post_show:   'bg-orange-900/40 text-orange-400 border-orange-800',
  settled:     'bg-slate-700 text-slate-400 border-slate-600',
  archived:    'bg-slate-700 text-slate-500 border-slate-600',
  placeholder: 'bg-slate-700/60 text-slate-400 border-slate-600',
  declined:    'bg-red-900/40 text-red-400 border-red-800',
}

const STATUS_LABELS: Record<string, string> = {
  placeholder: 'Harbour Placeholder',
  declined:    'Declined',
}

const REGION_LABELS: Record<string, string> = {
  group1: 'G1 · Self-drive',
  group2: 'G2 · Fly+Van',
  group3: 'G3 · Fly+Local',
}

export type Run = {
  id: string
  code: string
  name: string
  status: string
  region: string
  start_date: string | null
  end_date: string | null
  completion_pct: number
  shows: { id: string; show_date?: string | null }[]
}


function runDisplayDates(run: Run): { start: string | null; end: string | null } {
  const derived = runDateRangeFromShows(run.shows)
  return {
    start: derived.start ?? run.start_date,
    end: derived.end ?? run.end_date,
  }
}

type Tab = 'all' | 'proposed' | 'confirmed' | 'placeholders' | 'completed' | 'declined'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all',          label: 'ALL' },
  { key: 'proposed',     label: 'PROPOSED' },
  { key: 'confirmed',    label: 'CONFIRMED' },
  { key: 'placeholders', label: 'PLACEHOLDERS' },
  { key: 'completed',    label: 'COMPLETED' },
  { key: 'declined',     label: 'DECLINED' },
]

function StatusChangeButtons({ runId, currentStatus, onStatusChange }: {
  runId: string
  currentStatus: string
  onStatusChange: (runId: string, newStatus: string) => void
}) {
  const [pending, startTransition] = useTransition()

  function change(newStatus: string) {
    startTransition(async () => {
      await fetch(`/api/runs/${runId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      onStatusChange(runId, newStatus)
    })
  }

  if (currentStatus === 'proposed') {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => { e.preventDefault(); change('confirmed') }}
          disabled={pending}
          className="px-2 py-0.5 rounded text-xs font-semibold bg-green-900/60 text-green-400 border border-green-700 hover:bg-green-800/60 disabled:opacity-40 transition-colors"
        >
          Accept
        </button>
        <button
          onClick={(e) => { e.preventDefault(); change('declined') }}
          disabled={pending}
          className="px-2 py-0.5 rounded text-xs font-semibold bg-red-900/60 text-red-400 border border-red-700 hover:bg-red-800/60 disabled:opacity-40 transition-colors"
        >
          Decline
        </button>
      </div>
    )
  }

  if (currentStatus === 'confirmed') {
    return (
      <button
        onClick={(e) => { e.preventDefault(); change('proposed') }}
        disabled={pending}
        className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600 disabled:opacity-40 transition-colors"
        title="Move back to proposed"
      >
        Unconfirm
      </button>
    )
  }

  if (currentStatus === 'declined') {
    return (
      <button
        onClick={(e) => { e.preventDefault(); change('proposed') }}
        disabled={pending}
        className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600 disabled:opacity-40 transition-colors"
      >
        Restore
      </button>
    )
  }

  return null
}

function RunTable({ runs, completionByRun, completed = false, declined = false, onStatusChange }: {
  runs: Run[]
  completionByRun: Record<string, number>
  completed?: boolean
  declined?: boolean
  onStatusChange: (runId: string, newStatus: string) => void
}) {
  if (runs.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
        <p className="text-slate-500">No runs in this category.</p>
      </div>
    )
  }

  const borderClass = completed ? 'border-slate-600 opacity-80' : declined ? 'border-red-900/40' : 'border-slate-700'

  return (
    <div className={`bg-slate-800 rounded-xl border overflow-hidden ${borderClass}`}>

      {/* Mobile: card list */}
      <div className="md:hidden divide-y divide-slate-700/50">
        {runs.map(run => {
          const pct = completionByRun[run.id] ?? 0
          const isPlaceholder = run.status === 'placeholder'
          const isDeclined = run.status === 'declined'
          const { start: dStart, end: dEnd } = runDisplayDates(run)
          const dateStr = dStart === dEnd
            ? formatDateAU(dStart)
            : `${formatDateAU(dStart)} – ${formatDateAU(dEnd)}`

          const nameEl = isPlaceholder || isDeclined
            ? <span className={`text-sm font-medium ${isDeclined ? 'text-slate-500 line-through italic' : 'text-slate-500 italic'}`}>{run.name}</span>
            : <Link href={`/runs/${run.code.toLowerCase()}`} className="text-white text-sm font-medium hover:text-amber-400 transition-colors">{run.name}</Link>

          return (
            <div key={run.id} className={`px-4 py-3 ${isPlaceholder || isDeclined ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-bold text-sm flex-shrink-0 ${isDeclined ? 'text-slate-500 line-through' : isPlaceholder ? 'text-slate-500' : completed ? 'text-slate-400' : 'text-amber-400'}`}>
                    {run.code}
                  </span>
                  <span className={`px-2 py-0.5 rounded border text-xs font-medium ${completed ? 'bg-slate-700 text-slate-400 border-slate-600' : (STATUS_STYLES[run.status] ?? STATUS_STYLES.confirmed)}`}>
                    {completed ? 'COMPLETED' : (STATUS_LABELS[run.status] ?? run.status.replace('_', ' ').toUpperCase())}
                  </span>
                </div>
                <div className="flex-shrink-0">
                  <StatusChangeButtons runId={run.id} currentStatus={run.status} onStatusChange={onStatusChange} />
                </div>
              </div>
              <div className="mb-1">{nameEl}</div>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs ${isDeclined ? 'text-slate-600' : 'text-slate-500'}`}>
                  {dateStr}{run.region ? ` · ${REGION_LABELS[run.region] ?? run.region}` : ''}
                </span>
                {!isDeclined && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1.5 bg-slate-700 rounded-full">
                      <div className={`h-full rounded-full ${completed ? 'bg-slate-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-slate-600 text-xs">{pct}%</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop: full table — scroll if actions would clip */}
      <div className="hidden md:block overflow-x-auto">
      <table className="w-full min-w-[920px]">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Code</th>
            <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Run</th>
            <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Status</th>
            <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Region</th>
            <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Dates</th>
            <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Shows</th>
            <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">{completed ? 'Settle' : 'Done'}</th>
            <th className="text-left text-slate-400 text-xs font-medium px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, i) => {
            const pct = completionByRun[run.id] ?? 0
            const isPlaceholder = run.status === 'placeholder'
            const isDeclined = run.status === 'declined'
            return (
              <tr
                key={run.id}
                className={`border-b border-slate-700/50 transition-colors ${isPlaceholder || isDeclined ? 'opacity-60' : 'hover:bg-slate-700/30'} ${i === runs.length - 1 ? 'border-0' : ''}`}
              >
                <td className="px-4 py-3">
                  <span className={`font-bold text-sm ${isDeclined ? 'text-slate-500 line-through' : isPlaceholder ? 'text-slate-500' : completed ? 'text-slate-400' : 'text-amber-400'}`}>{run.code}</span>
                </td>
                <td className="px-4 py-3">
                  {isPlaceholder || isDeclined ? (
                    <span className={`text-slate-500 text-sm italic ${isDeclined ? 'line-through' : ''}`}>{run.name}</span>
                  ) : (
                    <Link href={`/runs/${run.code.toLowerCase()}`} className="text-white text-sm hover:text-amber-400 transition-colors">
                      {run.name}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap ${completed ? 'bg-slate-700 text-slate-400 border-slate-600' : (STATUS_STYLES[run.status] ?? STATUS_STYLES.confirmed)}`}>
                    {completed ? 'COMPLETED' : (STATUS_LABELS[run.status] ?? run.status.replace('_', ' ').toUpperCase())}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${isDeclined ? 'text-slate-600 line-through' : 'text-slate-400'}`}>{REGION_LABELS[run.region] ?? run.region}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm whitespace-nowrap ${isDeclined ? 'text-slate-600 line-through' : 'text-slate-300'}`}>
                    {(() => { const { start: dStart, end: dEnd } = runDisplayDates(run); return dStart === dEnd ? formatDateAU(dStart) : `${formatDateAU(dStart)} – ${formatDateAU(dEnd)}` })()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-400 text-sm">{run.shows?.length ?? 0}</span>
                </td>
                <td className="px-4 py-3">
                  {!isDeclined && (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full">
                        <div className={`h-full rounded-full ${completed ? 'bg-slate-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-slate-500 text-xs">{pct}%</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusChangeButtons runId={run.id} currentStatus={run.status} onStatusChange={onStatusChange} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

export default function RunsPageClient({
  allRuns: initialRuns,
  today,
  completionByRun,
  showStats,
}: {
  allRuns: Run[]
  today: string
  completionByRun: Record<string, number>
  confirmedCount?: number
  proposedCount?: number
  placeholderCount?: number
  showStats: { confirmed: number; proposed: number; placeholder: number; total: number }
}) {
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [runs, setRuns] = useState<Run[]>(initialRuns)
  const router = useRouter()

  function handleStatusChange(runId: string, newStatus: string) {
    setRuns(prev => prev.map(r => r.id === runId ? { ...r, status: newStatus } : r))
    router.refresh()
  }

  const declinedRuns      = runs.filter(r => r.status === 'declined')
  const activeRuns        = runs.filter(r => r.status !== 'declined')
  const completedRuns     = activeRuns.filter(r => r.end_date && r.end_date < today)
  const upcomingRuns      = activeRuns.filter(r => !r.end_date || r.end_date >= today)
  const confirmedRuns     = upcomingRuns.filter(r => r.status === 'confirmed')
  const proposedRuns      = upcomingRuns.filter(r => r.status === 'proposed')
  const placeholderRuns   = upcomingRuns.filter(r => r.status === 'placeholder')
  const otherUpcomingRuns = upcomingRuns.filter(
    r => !['confirmed', 'proposed', 'placeholder'].includes(r.status),
  )

  const liveConfirmed   = confirmedRuns.length
  const liveProposed    = proposedRuns.length
  const livePlaceholder = placeholderRuns.length
  const liveOther       = otherUpcomingRuns.length

  const tabCounts: Record<Tab, number> = {
    all:          upcomingRuns.length,
    proposed:     liveProposed,
    confirmed:    liveConfirmed,
    placeholders: livePlaceholder,
    completed:    completedRuns.length,
    declined:     declinedRuns.length,
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-white text-2xl font-bold tracking-wide mb-2">SHOWS / RUNS</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6">
          <div>
            <span className="text-white font-bold mr-2">RUNS: {upcomingRuns.length}</span>
            <span className="text-slate-400 text-sm">
              ({liveConfirmed} confirmed · {liveProposed} proposed{livePlaceholder > 0 ? ` · ${livePlaceholder} placeholders` : ''}{liveOther > 0 ? ` · ${liveOther} other` : ''}{completedRuns.length > 0 ? ` · ${completedRuns.length} completed` : ''})
            </span>
          </div>
          <div>
            <span className="text-white font-bold mr-2">SHOWS: {showStats.total}</span>
            <span className="text-slate-400 text-sm">
              ({showStats.confirmed} confirmed · {showStats.proposed} proposed{showStats.placeholder > 0 ? ` · ${showStats.placeholder} placeholders` : ''})
            </span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-5 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700 w-max min-w-full sm:min-w-0 sm:w-fit">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-none px-3 sm:px-4 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? tab.key === 'declined'
                    ? 'bg-red-500/80 text-white'
                    : 'bg-amber-400 text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
              <span className={`ml-1 text-xs ${activeTab === tab.key ? (tab.key === 'declined' ? 'text-red-200' : 'text-slate-700') : 'text-slate-600'}`}>
                {tabCounts[tab.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'all' && (
        <>
          <RunTable runs={upcomingRuns} completionByRun={completionByRun} onStatusChange={handleStatusChange} />
          {completedRuns.length > 0 && (
            <div className="mt-8">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-white text-lg font-semibold">Completed Shows</h2>
                <span className="text-slate-500 text-sm">{completedRuns.length} run{completedRuns.length !== 1 ? 's' : ''} — settlement data needed</span>
              </div>
              <RunTable runs={completedRuns} completionByRun={completionByRun} completed onStatusChange={handleStatusChange} />
            </div>
          )}
        </>
      )}

      {activeTab === 'proposed' && (
        <RunTable runs={proposedRuns} completionByRun={completionByRun} onStatusChange={handleStatusChange} />
      )}

      {activeTab === 'confirmed' && (
        <RunTable runs={confirmedRuns} completionByRun={completionByRun} onStatusChange={handleStatusChange} />
      )}

      {activeTab === 'placeholders' && (
        <RunTable runs={placeholderRuns} completionByRun={completionByRun} onStatusChange={handleStatusChange} />
      )}

      {activeTab === 'completed' && (
        <RunTable runs={completedRuns} completionByRun={completionByRun} completed onStatusChange={handleStatusChange} />
      )}

      {activeTab === 'declined' && (
        <RunTable runs={declinedRuns} completionByRun={completionByRun} declined onStatusChange={handleStatusChange} />
      )}
    </div>
  )
}
