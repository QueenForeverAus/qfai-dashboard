'use client'

import Link from 'next/link'
import { REMITTANCE_TAB_LABEL } from '@/lib/remittance'
import {
  AGENT_SETTLEMENT_NAV_LABEL,
  SHEET_HEADING,
  remittanceHref,
  settlementSheetHref,
  wave1SettlementHref,
} from '@/lib/settlements-sheet'

/**
 * Secondary affordances only. Settlements v3 (four sections) is the front door —
 * this row must not re-expose Wave-1 Agent Settlement as a peer tab.
 */
export default function SettlementsTabBar({
  runCode,
  showId,
  active,
}: {
  runCode: string
  showId: string | null
  active: 'sheet' | 'settlement' | 'remittance'
}) {
  const sheet = settlementSheetHref(runCode, showId)
  const agent = wave1SettlementHref(runCode, showId)
  const remit = remittanceHref(runCode, showId)

  const secondary = (href: string, label: string, on: boolean, testId: string) => (
    <Link
      href={href}
      data-testid={testId}
      className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${
        on
          ? 'bg-slate-800 text-slate-200 border-slate-600'
          : 'bg-transparent text-slate-500 border-transparent hover:text-slate-300'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4" data-testid="settlements-secondary-nav">
      {active !== 'sheet' && (
        <Link
          href={sheet}
          data-testid="tab-sheet"
          className="px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-amber-400/10 text-amber-400 border-amber-700"
        >
          ← {SHEET_HEADING}
        </Link>
      )}
      {secondary(remit, REMITTANCE_TAB_LABEL, active === 'remittance', 'tab-remittance')}
      {secondary(agent, AGENT_SETTLEMENT_NAV_LABEL, active === 'settlement', 'tab-settlement')}
    </div>
  )
}
