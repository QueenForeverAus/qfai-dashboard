'use client'

import { formatDateAU } from '@/lib/dates'
import {
  advancingSlaDueDates,
  advancingSlaFromSettings,
  PORTAL_SETTINGS_DEFAULTS,
  type AdvancingSlaWeeks,
  type PortalSettings,
} from '@/lib/portal-settings'

export function AdvancingSlaBanner({
  sla,
  showDate,
}: {
  sla: AdvancingSlaWeeks
  showDate?: string | null
}) {
  const dues = advancingSlaDueDates(showDate, sla)
  return (
    <div
      className="mb-4 px-3 py-2 rounded border border-slate-700/80 bg-slate-800/50 text-slate-300 text-xs"
      data-testid="advancing-sla-banner"
    >
      <span className="text-slate-400">Advancing SLA</span>
      {' · '}aim send {sla.aim_weeks}w{dues.aimSend ? ` (${formatDateAU(dues.aimSend)})` : ''}
      {' · '}ping {sla.ping_weeks}w{dues.ping ? ` (${formatDateAU(dues.ping)})` : ''}
      {' · '}tech chase {sla.tech_chase_weeks}w{dues.techChase ? ` (${formatDateAU(dues.techChase)})` : ''}
      {showDate ? <span className="text-slate-500"> — from first show {formatDateAU(showDate)}</span> : null}
    </div>
  )
}

export function slaFromPortal(settings?: PortalSettings | null): AdvancingSlaWeeks {
  return advancingSlaFromSettings(settings ?? PORTAL_SETTINGS_DEFAULTS)
}
