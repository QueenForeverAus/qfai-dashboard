'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateAU } from '@/lib/dates'
import {
  ONSALE_FIELD_LABELS,
  fmtCompactSafe,
  fmtSafe,
  plainMilestoneLabel,
  safeHttpUrl,
  shortPlaceName,
  ticketLinkLabel,
  toStatusRow,
  websiteLinkLabel,
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
  const when = fmtCompactSafe(syncedAt ?? null)
  const text = `Source: ${source} · synced ${when ?? 'unknown'}`
  return (
    <p className="text-[10px] text-slate-500 truncate" title={text}>
      {text}
    </p>
  )
}

function ShortLink({ href, label, title }: { href: string; label: string; title: string }) {
  return (
    <a href={href} title={title} target="_blank" rel="noreferrer" className="inline-block max-w-full truncate text-amber-400 hover:text-amber-300">
      {label}
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
      className={`px-1.5 py-1.5 align-top overflow-hidden border-b border-slate-700/80 ${TONE_CLASS[tone]}`}
    >
      <div className="flex flex-col gap-0.5 text-[11px] leading-snug text-slate-200">{children}</div>
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
        <table className="w-full table-fixed border-separate border-spacing-0 text-[11px] leading-snug min-w-[1080px] xl:min-w-0">
          <colgroup>
            <col className="w-[168px] xl:w-[16%]" />
            <col className="w-[132px] xl:w-[12%]" />
            <col className="w-[96px] xl:w-[9%]" />
            <col className="w-[88px] xl:w-[8%]" />
            <col className="w-[104px] xl:w-[10%]" />
            <col className="w-[96px] xl:w-[9%]" />
            <col className="w-[88px] xl:w-[8%]" />
            <col className="w-[88px] xl:w-[8%]" />
            <col className="w-[88px] xl:w-[8%]" />
            <col className="w-[132px] xl:w-[12%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-20 bg-slate-800 px-1.5 py-2 font-semibold border-b border-slate-700">Show</th>
              <th className="px-1.5 py-2 font-semibold border-b border-slate-700">Key dates</th>
              <th className="px-1.5 py-2 font-semibold border-b border-slate-700">Ticket link</th>
              <th className="px-1.5 py-2 font-semibold border-b border-slate-700">EDM</th>
              <th className="px-1.5 py-2 font-semibold border-b border-slate-700">Website</th>
              <th className="px-1.5 py-2 font-semibold border-b border-slate-700">FB Event</th>
              <th className="px-1.5 py-2 font-semibold border-b border-slate-700">ER ad</th>
              <th className="px-1.5 py-2 font-semibold border-b border-slate-700">Ticket ad</th>
              <th className="px-1.5 py-2 font-semibold border-b border-slate-700">Pixel</th>
              <th className="px-1.5 py-2 font-semibold border-b border-slate-700">Next action</th>
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
  const overdue = status.worst === 'red'
  const nextText = nextLine(status)
  const cohost = fbCohost(tracker)
  return (
    <>
      <tr
        data-testid={`onsale-row-${show.id}`}
        data-worst={status.worst}
        className={`align-top ${overdue ? 'bg-red-950/40' : ''}`}
      >
        <td className={`sticky left-0 z-10 px-1.5 py-1.5 align-top border-b border-slate-700/80 ${overdue ? 'bg-red-950 shadow-[inset_3px_0_0_0_rgb(239,68,68)]' : 'bg-slate-800'}`}>
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="truncate text-slate-200">{show.showDate ? formatDateAU(show.showDate, { weekday: 'short' }) : 'unknown'}</span>
                <span className={`shrink-0 px-1 py-px rounded text-[9px] font-semibold uppercase border ${BADGE_CLASS[status.badge] ?? BADGE_CLASS['No data']}`}>
                  {status.badge}
                </span>
              </div>
              {runHref ? (
                <Link href={runHref} title={show.venueName} className="block truncate text-amber-400 hover:text-amber-300 font-medium">{show.venueName}</Link>
              ) : (
                <div className="truncate text-white" title={show.venueName}>{show.venueName}</div>
              )}
              <div className="truncate text-slate-400">
                {place || 'unknown'}
                {runHref && show.runCode ? (
                  <>
                    {' · '}
                    <Link href={runHref} className="text-amber-400/80 hover:text-amber-300">{show.runCode}</Link>
                  </>
                ) : ' · unknown'}
              </div>
              <div className="truncate text-slate-500" title={nextText}>{nextText}</div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <button type="button" data-testid={`edit-${show.id}`} title="Edit" onClick={onEdit} className="text-slate-500 hover:text-amber-400 text-xs leading-none">
                ✎
              </button>
              <button type="button" data-testid={`history-${show.id}`} aria-expanded={historyOpen} onClick={onToggleHistory} className="text-[10px] text-slate-400 hover:text-white">
                History
              </button>
            </div>
          </div>
        </td>
        <Cell cellKey="dates" tone={status.cells.dates.tone} reason={status.cells.dates.reason}>
          <DateLine label="Ann" full="Announce" iso={tracker?.announce_at ?? null} localTz={tracker?.show_local_tz ?? null} />
          <DateLine label="Pre" full="Presale" iso={tracker?.presale_at ?? null} localTz={tracker?.show_local_tz ?? null} />
          <DateLine label="On-sale" full="General on-sale" iso={tracker?.general_onsale_at ?? null} localTz={tracker?.show_local_tz ?? null} />
        </Cell>
        <Cell cellKey="ticketLink" tone={status.cells.ticketLink.tone} reason={status.cells.ticketLink.reason}>
          <StateAndLink
            state={ticketLabel(tracker?.ticket_link_state ?? null)}
            url={tracker?.ticket_link_url ?? null}
            label={tracker?.ticket_link_url ? ticketLinkLabel(tracker.ticket_link_platform, tracker.ticket_link_url) : ''}
            detail={tracker?.ticket_link_platform}
          />
        </Cell>
        <Cell cellKey="edm" tone={status.cells.edm.tone} reason={status.cells.edm.reason}>
          <StateText value={edmLabel(tracker?.edm_state ?? null)} />
          {tracker?.edm_state === 'sent_scheduled' && (
            <div className="truncate text-slate-300" title={tracker.edm_send_at ?? tracker.edm_send_date ?? undefined}>
              {tracker.edm_send_at
                ? (fmtCompactSafe(tracker.edm_send_at) ?? 'unknown')
                : tracker.edm_send_date
                  ? formatDateAU(tracker.edm_send_date, { year: false })
                  : 'unknown'}
            </div>
          )}
        </Cell>
        <Cell cellKey="website" tone={status.cells.website.tone} reason={status.cells.website.reason}>
          <WebsiteBody tracker={tracker} />
          <SourceLine source={tracker?.website_source} syncedAt={tracker?.website_synced_at} />
        </Cell>
        <Cell cellKey="fbEvent" tone={status.cells.fbEvent.tone} reason={status.cells.fbEvent.reason}>
          <div className="truncate">
            <StateText value={fbLabel(tracker?.fb_event_state ?? null)} />
            {cohost && <span className="text-slate-400"> · {cohost}</span>}
          </div>
          {tracker?.fb_event_url && (
            <div className="truncate">
              <UrlLine url={tracker.fb_event_url} label="FB Event ↗" detail={tracker.fb_event_id} />
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
          <div className="truncate" title={tracker?.pixel_platform ?? undefined}>
            <StateText value={pixelLabel(tracker?.pixel_state ?? null, tracker?.pixel_platform ?? null)} />
          </div>
          <SourceLine source={tracker?.pixel_source} syncedAt={tracker?.pixel_synced_at} />
        </Cell>
        <Cell cellKey="flag" tone={status.cells.flag.tone} reason={status.cells.flag.reason}>
          <div className="line-clamp-2" title={tracker?.next_action?.trim() || undefined}>
            {tracker?.next_action?.trim() ? tracker.next_action : <Unknown />}
          </div>
          <div className="truncate text-slate-400" title={tracker?.notes?.trim() || undefined}>
            {tracker?.next_action_owner ?? 'unknown'}
            {tracker?.notes?.trim() ? ` · ${tracker.notes.trim()}` : ''}
          </div>
          {tracker?.manual_red_flag && (
            <div className="truncate text-red-300" title={tracker.manual_red_reason?.trim() || 'Manual red flag'}>
              Flag: {tracker.manual_red_reason?.trim() || 'Manual red flag'}
            </div>
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

function nextLine(status: ReturnType<typeof computeRowStatus>): string {
  if (!status.nextMilestone) return 'Next: unknown'
  const label = plainMilestoneLabel(status.nextMilestone.label, status.cells.erAd.reason)
  return `Next: ${label} · ${fmtCompactMelbourne(status.nextMilestone.at)}`
}

function fmtCompactMelbourne(date: Date): string {
  return fmtCompactSafe(date.toISOString()) ?? 'unknown'
}

function DateLine({ label, full, iso, localTz }: { label: string; full: string; iso: string | null; localTz: string | null }) {
  const primary = fmtCompactSafe(iso)
  const local = iso && localTz ? fmtCompactSafe(iso, localTz) : null
  const showLocal = local && primary && local !== primary
  const text = primary ? `${full}: ${primary}${showLocal ? ` · ${local}` : ''}` : `${full}: unknown`
  return (
    <div className="truncate" title={text}>
      <span className="text-slate-500">{label} </span>
      {primary ?? <Unknown />}
      {showLocal && <span className="text-slate-400"> · {local}</span>}
    </div>
  )
}

function StateText({ value }: { value: string | null }) {
  if (!value) return <Unknown />
  return <span>{value}</span>
}

/** State text and a link label stay separated when they share one line. */
function StateAndLink({
  state,
  url,
  label,
  detail,
}: {
  state: string | null
  url: string | null
  label: string
  detail?: string | null
}) {
  return (
    <div className="flex items-baseline gap-1 min-w-0">
      <span className="shrink-0"><StateText value={state} /></span>
      {url && (
        <>
          <span className="shrink-0 text-slate-500" aria-hidden>·</span>
          <span className="min-w-0 truncate">
            <UrlLine url={url} label={label} detail={detail} />
          </span>
        </>
      )}
    </div>
  )
}

function fbCohost(tracker: OnsaleTrackerRecord | null): string | null {
  if (!tracker) return null
  if (tracker.fb_event_state !== 'live' && tracker.fb_event_venue_cohost == null) return null
  if (tracker.fb_event_venue_cohost == null) return 'co-host unknown'
  return tracker.fb_event_venue_cohost ? 'co-host yes' : 'co-host no'
}

function UrlLine({ url, label, detail }: { url: string | null; label: string; detail?: string | null }) {
  const href = safeHttpUrl(url)
  if (!url) return null
  const title = detail ? `${detail} · ${url}` : url
  if (!href) return <div className="truncate" title={title}>{label}</div>
  return <ShortLink href={href} label={label} title={title} />
}

function WebsiteBody({ tracker }: { tracker: OnsaleTrackerRecord | null }) {
  const state = tracker?.website_state ?? null
  if (!state) return <Unknown />
  if (state === 'not_built') return <span>not built</span>
  const href = safeHttpUrl(tracker?.website_url ?? null)
  const postId = tracker?.website_wp_post_id
  const label = websiteLinkLabel(postId)
  const link = href
    ? <ShortLink href={href} label={label} title={tracker?.website_url ?? href} />
    : postId != null
      ? <span title={`WP post ${postId}`}>{label}</span>
      : <span className="text-slate-500">WP unknown</span>
  if (state === 'scheduled') {
    const when = fmtCompactSafe(tracker?.website_go_live_at ?? null) ?? 'go-live unknown'
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="truncate" title={`scheduled · ${when}`}>scheduled · {when}</div>
        <div className="truncate">{link}</div>
      </div>
    )
  }
  return (
    <div className="flex items-baseline gap-1 min-w-0">
      <span className="shrink-0">live</span>
      <span className="shrink-0 text-slate-500" aria-hidden>·</span>
      <span className="min-w-0 truncate">{link}</span>
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
  if (state === 'paused') return <span title="paused (waiting on GO)">paused · GO</span>
  if (state === 'running') {
    const text = `${money(spend)} / ${money(budget)}`
    return <span className="block truncate" title={`running ${text}`}>running · {text}</span>
  }
  return <span className="block truncate" title={campaignId ?? undefined}>ended{campaignId ? ` · ${campaignId}` : ''}</span>
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
  const short = shortPlaceName(platform)
  const platformBit = short ? ` · ${short}` : ''
  if (state === 'ours_added') return `ours added${platformBit}`
  if (state === 'chasing') return `chasing${platformBit}`
  if (state === 'cant_add') return `can't add${platformBit}`
  return null
}
