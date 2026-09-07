'use client'

import Link from 'next/link'
import { REMITTANCE_TAB_LABEL } from '@/lib/remittance'
import { SHEET_TAB_LABEL, settlementSheetHref, wave1SettlementHref } from '@/lib/settlements-sheet'

export default function SettlementsTabBar({
  runCode,
  showId,
  active,
}: {
  runCode: string
  showId: string | null
  active: 'sheet' | 'settlement' | 'remittance'
}) {
  const remittance = showId
    ? `${wave1SettlementHref(runCode, showId)}/remittance`
    : `${wave1SettlementHref(runCode)}/remittance`
  const tab = (href: string, label: string, on: boolean, testId: string) => (
    <Link
      href={href}
      data-testid={testId}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
        on
          ? 'bg-amber-400/10 text-amber-400 border-amber-700'
          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <div className="flex flex-wrap gap-1.5 mb-4" data-testid="settlements-tabs">
      {tab(settlementSheetHref(runCode, showId), SHEET_TAB_LABEL, active === 'sheet', 'tab-sheet')}
      {tab(wave1SettlementHref(runCode, showId), 'Settlement', active === 'settlement', 'tab-settlement')}
      {tab(remittance, REMITTANCE_TAB_LABEL, active === 'remittance', 'tab-remittance')}
    </div>
  )
}
