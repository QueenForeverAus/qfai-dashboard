import { notFound } from 'next/navigation'
import { getSettlementsActor } from '@/lib/settlements-access'
import { loadSettlementWorkspace } from '@/lib/settlements-load'
import { SETTLEMENTS_MODULE_LABEL } from '@/lib/settlements'
import SettlementSheetClient from '../../../SettlementSheetClient'

export const dynamic = 'force-dynamic'

export default async function SettlementShowSheetPage({
  params,
}: {
  params: Promise<{ runId: string; showId: string }>
}) {
  const { runId, showId } = await params
  const actor = await getSettlementsActor()
  if (!actor) {
    return (
      <div className="p-6">
        <h1 className="text-white text-2xl font-bold mb-2">{SETTLEMENTS_MODULE_LABEL}</h1>
        <p className="text-slate-400 text-sm">Settlements is available to admin and owner only in v1.</p>
      </div>
    )
  }

  const data = await loadSettlementWorkspace(runId)
  if (!data || !data.shows.some(s => s.id === showId)) notFound()

  return (
    <SettlementSheetClient
      run={data.run}
      shows={data.shows}
      liveFields={data.liveFields}
      focusedShowId={showId}
      insideFactors={data.insideFactors}
      remittanceKnownLines={data.remittanceKnownLines}
      actuals={data.actuals}
      challenges={data.challenges}
    />
  )
}
