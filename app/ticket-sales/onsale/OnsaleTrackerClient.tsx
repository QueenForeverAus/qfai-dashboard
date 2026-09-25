'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateAU } from '@/lib/dates'
import {
  ONSALE_FIELD_LABELS,
  fmtSafe,
  safeHttpUrl,
  toStatusRow,
  type OnsaleFilter,
  type OnsaleTrackerRecord,
} from '@/lib/onsale-tracker'
import {
  applyFilter,
  computeRowStatus,
  fmtMelbourne,
  sortRows,
  summaryCounts,
  type CellKey,
  type Tone,
} from '@/lib/onsale-tracker-status'
import TicketSalesTabs from '../TicketSalesTabs'
import OnsaleEditDrawer from './OnsaleEditDrawer'

export type OnsaleShowCard = {
  id: string
  showDate: string | null
  venueName: string
  venueCity: string | null
  stateTerritory: string | null
  runCode: string | null
  tracker: OnsaleTrackerRecord | null
}

export type OnsaleHistoryItem = {
  id: string
  showId: string
  field: string
  oldValue: string | null
  newValue: string | null
  actorLabel: string
  changedAt: string
  source: string
}

const TONE_CLASS: Record<Tone, string> = {
  green: 'bg-emerald-950/50',
  amber: 'bg-amber-950/40',
  red: 'bg-red-950/50',
  grey: 'bg-slate-800/80',
  none: '',
}

const BADGE_CLASS: Record<string, string> = {
  Overdue: 'bg-red-900/70 text-red-200 border-red-800',
  'Due ≤48h': 'bg-amber-900/70 text-amber-200 border-amber-800',
  'On track': 'bg-emerald-900/50 text-emerald-200 border-emerald-800',
  'No data': 'bg-slate-700 text-slate-300 border-slate-600',
}

function Unknown() {
  return <span className="text-slate-500">unknown</span>
}

function money(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'unknown'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'unknown'
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}

function SourceLine({ source, syncedAt }: { source: string | null | undefined; syncedAt: string | null | undefined }) {
  if (!source || source === 'manual') return null
  const when = fmtSafe(syncedAt ?? null)
  return (
    <p className="text-[11px] text-slate-500 mt-1">
      Source: {source} · synced {when ?? 'unknown'}
    </p>
  )
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 break-all">
      {children}
    </a>
  )
}

function historyValue(field: string, value: string | null): string {
  if (value == null || value === '') return 'unknown'
  if (field.endsWith('_at') || field.endsWith('_since')) {
    const formatted = fmtSafe(value)
    if (formatted) return formatted
  }
  if (value === 'true') return 'yes'
  if (value === 'false') return 'no'
  return value
}

function Cell({
  cellKey,
  tone,
  reason,
  children,
}: {
  cellKey: CellKey
  tone: Tone
  reason: string | null
  children: React.ReactNode
}) {
  return (
    <td
      data-testid={`cell-${cellKey}`}
      data-tone={tone}
      title={reason ?? undefined}
      className={`px-3 py-3 align-top min-w-[10rem] ${TONE_CLASS[tone]}`}
    >
      <div className="text-sm text-slate-200 space-y-1">{children}</div>
      {reason && tone !== 'none' && tone !== 'green' && (
        <p className="text-[11px] text-slate-400 mt-1">{reason}</p>
      )}
    </td>
  )
}

export default function OnsaleTrackerClient({
  shows,
  history,
  nowIso,
  testClock,
  filter,
  nowParam,
  loadError,
}: {
  shows: OnsaleShowCard[]
  history: OnsaleHistoryItem[]
  nowIso: string
  testClock: boolean
  filter: OnsaleFilter
  nowParam: string | null
  loadError: string | null
}) {
  const router = useRouter()
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState<string | null>(null)

  const model = useMemo(() => {
    const rows = shows.map(show => {
      const row = toStatusRow(show.id, show.showDate, show.tracker)
      return { show, row }
    })
    const withStatus = rows.map(item => ({
      ...item,
      status: computeRowStatus(item.row, now),
    }))
    const sorted = sortRows(withStatus)
    return {
      visible: applyFilter(sorted, filter, now),
      counts: summaryCounts(sorted.map(item => item.status)),
    }
  }, [shows, now, filter])

  function pushFilter(next: OnsaleFilter) {
    const params = new URLSearchParams()
    if (nowParam) params.set('now', nowParam)
    if (next !== 'all') params.set('filter', next)
    const qs = params.toString()
    router.push(qs ? `/ticket-sales/onsale?${qs}` : '/ticket-sales/onsale')
  }

  const editing = shows.find(show => show.id === editingId) ?? null

  return (
    <div data-testid="onsale-tracker" className="min-h-screen bg-slate-900 px-4 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">Ticket Sales & Ads</h1>
        <TicketSalesTabs active="onsale" />
        <p className="text-slate-400 text-sm mt-3">On-sale tracker. Blank states stay unknown.</p>
        <p className="text-amber-400/70 text-xs mt-2">
          Owner-only — same gate as the ticket sales board.
        </p>
      </div>

      {testClock && (
        <div data-testid="test-clock-banner" className="mb-4 rounded-lg bg-yellow-300 text-slate-900 px-4 py-2 text-sm font-medium">
          Test clock: {fmtMelbourne(now)}
        </div>
      )}

      {loadError && (
        <div className="text-red-300 text-sm bg-red-950/40 border border-red-800 rounded-lg px-4 py-3 mb-4">
          {loadError}
        </div>
      )}

      <div data-testid="onsale-summary" className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <Summary testId="count-overdue" label="Overdue" value={model.counts.overdue} className="text-red-300" />
        <Summary testId="count-due48h" label="Due in 48h" value={model.counts.due48h} className="text-amber-200" />
        <Summary testId="count-waiting" label="Waiting on Gareth" value={model.counts.waitingOnGareth} className="text-white" />
        <Summary testId="count-onsale" label="On sale" value={model.counts.onSale} className="text-emerald-300" />
        <Summary testId="count-notyet" label="Not yet on sale" value={model.counts.notYetOnSale} className="text-slate-200" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <FilterButton testId="filter-all" label="All" active={filter === 'all'} onClick={() => pushFilter('all')} />
        <FilterButton testId="filter-mine" label="Waiting on me" active={filter === 'mine'} onClick={() => pushFilter('mine')} />
        <FilterButton testId="filter-next14" label="Next 14 days" active={filter === 'next14'} onClick={() => pushFilter('next14')} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800/60">
        <table className="w-full text-sm min-w-[1500px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-700">
              <th className="px-3 py-3 font-semibold">Show</th>
              <th className="px-3 py-3 font-semibold">Key dates</th>
              <th className="px-3 py-3 font-semibold">Ticket link</th>
              <th className="px-3 py-3 font-semibold">EDM</th>
              <th className="px-3 py-3 font-semibold">Website</th>
              <th className="px-3 py-3 font-semibold">FB Event</th>
              <th className="px-3 py-3 font-semibold">ER ad</th>
              <th className="px-3 py-3 font-semibold">Ticket ad</th>
              <th className="px-3 py-3 font-semibold">Pixel</th>
              <th className="px-3 py-3 font-semibold">Next action</th>
            </tr>
          </thead>
          <tbody>
            {model.visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                  No shows in this view.
                </td>
              </tr>
            ) : model.visible.map(item => {
              const { show, status } = item
              const tracker = show.tracker
              const place = [show.venueCity, show.stateTerritory].filter(Boolean).join(', ')
              const historyRows = history.filter(row => row.showId === show.id)
              return (
                <ShowRows
                  key={show.id}
                  show={show}
                  place={place}
                  status={status}
                  tracker={tracker}
                  historyOpen={historyOpen === show.id}
                  historyRows={historyRows}
                  onEdit={() => setEditingId(show.id)}
                  onToggleHistory={() => setHistoryOpen(current => current === show.id ? null : show.id)}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <OnsaleEditDrawer
          key={editing.id}
          showId={editing.id}
          title={`${editing.venueName}${editing.showDate ? ` · ${formatDateAU(editing.showDate)}` : ''}`}
          tracker={editing.tracker}
          nowIso={nowIso}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function Summary({ testId, label, value, className }: { testId: string; label: string; value: number; className: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div data-testid={testId} className={`text-2xl font-semibold tabular-nums ${className}`}>{value}</div>
    </div>
  )
}

function FilterButton({ testId, label, active, onClick }: { testId: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm border ${
        active
          ? 'bg-amber-400 text-slate-900 border-amber-400 font-semibold'
          : 'border-slate-600 text-slate-300 hover:border-slate-400'
      }`}
    >
      {label}
    </button>
  )
}

function ShowRows({
  show,
  place,
  status,
  tracker,
  historyOpen,
  historyRows,
  onEdit,
  onToggleHistory,
}: {
  show: OnsaleShowCard
  place: string
  status: ReturnType<typeof computeRowStatus>
  tracker: OnsaleTrackerRecord | null
  historyOpen: boolean
  historyRows: OnsaleHistoryItem[]
  onEdit: () => void
  onToggleHistory: () => void
}) {
  const runHref = show.runCode ? `/runs/${show.runCode.toLowerCase()}` : null
  return (
    <>
      <tr
        data-testid={`onsale-row-${show.id}`}
        data-worst={status.worst}
        className={`border-b border-slate-700/80 align-top ${status.worst === 'red' ? 'bg-red-950/35 shadow-[inset_4px_0_0_0_rgb(239,68,68)]' : ''}`}
      >
        <td className="px-3 py-3 min-w-[14rem]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-slate-200">{show.showDate ? formatDateAU(show.showDate, { weekday: 'short' }) : <Unknown />}</div>
              {runHref ? (
                <Link href={runHref} className="text-amber-400 hover:text-amber-300 font-medium">{show.venueName}</Link>
              ) : (
                <div className="text-white">{show.venueName}</div>
              )}
              <div className="text-slate-400 text-xs">{place || <Unknown />}</div>
              {runHref && show.runCode ? (
                <Link href={runHref} className="text-amber-400/80 hover:text-amber-300 text-xs">{show.runCode}</Link>
              ) : (
                <div className="text-slate-500 text-xs">unknown</div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <button type="button" data-testid={`edit-${show.id}`} title="Edit" onClick={onEdit} className="text-slate-500 hover:text-amber-400 text-sm leading-none">
                ✎
              </button>
              <button type="button" data-testid={`history-${show.id}`} aria-expanded={historyOpen} onClick={onToggleHistory} className="text-[11px] text-slate-400 hover:text-white">
                History
              </button>
            </div>
          </div>
          <div className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${BADGE_CLASS[status.badge] ?? BADGE_CLASS['No data']}`}>
            {status.badge}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {status.nextMilestone
              ? `Next: ${status.nextMilestone.label} · ${fmtMelbourne(status.nextMilestone.at)}`
              : 'Next: unknown'}
          </div>
        </td>
        <Cell cellKey="dates" tone={status.cells.dates.tone} reason={status.cells.dates.reason}>
          <DateLine label="Announce" iso={tracker?.announce_at ?? null} localTz={tracker?.show_local_tz ?? null} />
          <DateLine label="Presale" iso={tracker?.presale_at ?? null} localTz={tracker?.show_local_tz ?? null} />
          <DateLine label="General on-sale" iso={tracker?.general_onsale_at ?? null} localTz={tracker?.show_local_tz ?? null} />
        </Cell>
        <Cell cellKey="ticketLink" tone={status.cells.ticketLink.tone} reason={status.cells.ticketLink.reason}>
          <StateText value={ticketLabel(tracker?.ticket_link_state ?? null)} />
          <UrlLine url={tracker?.ticket_link_url ?? null} />
          {tracker?.ticket_link_platform && <div className="text-xs text-slate-400">{tracker.ticket_link_platform}</div>}
        </Cell>
        <Cell cellKey="edm" tone={status.cells.edm.tone} reason={status.cells.edm.reason}>
          <StateText value={edmLabel(tracker?.edm_state ?? null)} />
          {tracker?.edm_state === 'sent_scheduled' && (
            <div className="text-xs text-slate-300">
              {tracker.edm_send_at
                ? (fmtSafe(tracker.edm_send_at) ?? 'unknown')
                : tracker.edm_send_date
                  ? formatDateAU(tracker.edm_send_date)
                  : 'unknown'}
            </div>
          )}
        </Cell>
        <Cell cellKey="website" tone={status.cells.website.tone} reason={status.cells.website.reason}>
          <WebsiteBody tracker={tracker} />
          <SourceLine source={tracker?.website_source} syncedAt={tracker?.website_synced_at} />
        </Cell>
        <Cell cellKey="fbEvent" tone={status.cells.fbEvent.tone} reason={status.cells.fbEvent.reason}>
          <StateText value={fbLabel(tracker?.fb_event_state ?? null)} />
          {(tracker?.fb_event_state === 'live' || tracker?.fb_event_url) && <UrlLine url={tracker?.fb_event_url ?? null} />}
          {(tracker?.fb_event_state === 'live' || tracker?.fb_event_venue_cohost != null) && (
            <div className="text-xs text-slate-400">
              Venue co-host: {tracker?.fb_event_venue_cohost == null ? 'unknown' : tracker.fb_event_venue_cohost ? 'yes' : 'no'}
            </div>
          )}
          <SourceLine source={tracker?.fb_event_source} syncedAt={tracker?.fb_event_synced_at} />
        </Cell>
        <Cell cellKey="erAd" tone={status.cells.erAd.tone} reason={status.cells.erAd.reason}>
          <AdBody
            state={tracker?.er_ad_state ?? null}
            spend={tracker?.er_spend_to_date ?? null}
            budget={tracker?.er_budget ?? null}
            campaignId={tracker?.er_campaign_id ?? null}
          />
          <SourceLine source={tracker?.er_ad_source} syncedAt={tracker?.er_ad_synced_at} />
        </Cell>
        <Cell cellKey="ticketAd" tone={status.cells.ticketAd.tone} reason={status.cells.ticketAd.reason}>
          <AdBody
            state={tracker?.ticket_ad_state ?? null}
            spend={tracker?.ticket_spend_to_date ?? null}
            budget={tracker?.ticket_budget ?? null}
            campaignId={tracker?.ticket_campaign_id ?? null}
          />
          <SourceLine source={tracker?.ticket_ad_source} syncedAt={tracker?.ticket_ad_synced_at} />
        </Cell>
        <Cell cellKey="pixel" tone={status.cells.pixel.tone} reason={status.cells.pixel.reason}>
          <StateText value={pixelLabel(tracker?.pixel_state ?? null, tracker?.pixel_platform ?? null)} />
          <SourceLine source={tracker?.pixel_source} syncedAt={tracker?.pixel_synced_at} />
        </Cell>
        <Cell cellKey="flag" tone={status.cells.flag.tone} reason={status.cells.flag.reason}>
          <div>{tracker?.next_action?.trim() ? tracker.next_action : <Unknown />}</div>
          <div className="text-xs text-slate-400">Owner: {tracker?.next_action_owner ?? 'unknown'}</div>
          {tracker?.notes?.trim() && <div className="text-xs text-slate-400 whitespace-pre-wrap">{tracker.notes}</div>}
          {tracker?.manual_red_flag && (
            <div className="text-xs text-red-300">Flag: {tracker.manual_red_reason?.trim() || 'Manual red flag'}</div>
          )}
        </Cell>
      </tr>
      {historyOpen && (
        <tr className="border-b border-slate-700/80 bg-slate-900/60">
          <td colSpan={10} className="px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">History</div>
            {historyRows.length === 0 ? (
              <p className="text-sm text-slate-500">No changes yet.</p>
            ) : (
              <ul className="space-y-1">
                {historyRows.map(row => (
                  <li key={row.id} data-testid="history-row" className="text-sm text-slate-300">
                    <span className="text-slate-200">{ONSALE_FIELD_LABELS[row.field] ?? row.field}</span>
                    {': '}
                    {historyValue(row.field, row.oldValue)}
                    {' → '}
                    {historyValue(row.field, row.newValue)}
                    {' · '}
                    {row.actorLabel}
                    {' · '}
                    {fmtSafe(row.changedAt) ?? 'unknown'}
                    {' · '}
                    {row.source || 'manual'}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function DateLine({ label, iso, localTz }: { label: string; iso: string | null; localTz: string | null }) {
  const primary = fmtSafe(iso)
  const local = iso && localTz ? fmtSafe(iso, localTz) : null
  const showLocal = local && primary && local !== primary
  return (
    <div>
      <span className="text-slate-500">{label}: </span>
      {primary ?? <Unknown />}
      {showLocal && <div className="text-[11px] text-slate-400">{local}</div>}
    </div>
  )
}

function StateText({ value }: { value: string | null }) {
  if (!value) return <Unknown />
  return <span>{value}</span>
}

function UrlLine({ url }: { url: string | null }) {
  const href = safeHttpUrl(url)
  if (!url) return null
  if (!href) return <div className="text-xs break-all">{url}</div>
  return <div className="text-xs"><ExternalLink href={href}>{url}</ExternalLink></div>
}

function WebsiteBody({ tracker }: { tracker: OnsaleTrackerRecord | null }) {
  const state = tracker?.website_state ?? null
  if (!state) return <Unknown />
  if (state === 'not_built') return <span>not built</span>
  if (state === 'scheduled') {
    return (
      <div>
        <div>scheduled</div>
        <div className="text-xs text-slate-300">Go-live: {fmtSafe(tracker?.website_go_live_at ?? null) ?? 'unknown'}</div>
        <div className="text-xs text-slate-300">WP post: {tracker?.website_wp_post_id ?? 'unknown'}</div>
      </div>
    )
  }
  const href = safeHttpUrl(tracker?.website_url ?? null)
  return (
    <div>
      <div>live</div>
      {href ? <div className="text-xs"><ExternalLink href={href}>{tracker?.website_url}</ExternalLink></div> : <div className="text-xs"><Unknown /></div>}
    </div>
  )
}

function AdBody({
  state,
  spend,
  budget,
  campaignId,
}: {
  state: string | null
  spend: number | string | null
  budget: number | string | null
  campaignId: string | null
}) {
  if (!state) return <Unknown />
  if (state === 'none') return <span>none</span>
  if (state === 'paused') return <span>paused (waiting on GO)</span>
  if (state === 'running') return <span>running ({money(spend)} / {money(budget)})</span>
  return <span className="break-all">ended ({campaignId || 'unknown'})</span>
}

function ticketLabel(state: string | null): string | null {
  if (!state) return null
  if (state === 'none' || state === 'received' || state === 'approved' || state === 'live') return state
  return null
}

function edmLabel(state: string | null): string | null {
  if (state === 'none') return 'none'
  if (state === 'draft_received') return 'draft received'
  if (state === 'approved') return 'approved'
  if (state === 'sent_scheduled') return 'sent-scheduled'
  return null
}

function fbLabel(state: string | null): string | null {
  if (state === 'none' || state === 'drafted' || state === 'live') return state
  return null
}

function pixelLabel(state: string | null, platform: string | null): string | null {
  const platformBit = platform ? ` (${platform})` : ''
  if (state === 'ours_added') return `ours added${platformBit}`
  if (state === 'chasing') return `chasing${platformBit}`
  if (state === 'cant_add') return `can't add${platformBit}`
  return null
}
