import { notFound } from 'next/navigation'
import { getSettlementsActor } from '@/lib/settlements-access'
import { loadSettlementWorkspace, type SettlementWorkspaceData } from '@/lib/settlements-load'
import { SETTLEMENTS_MODULE_LABEL } from '@/lib/settlements'
import SettlementSheetClient from './SettlementSheetClient'
import SettlementWorkspaceClient from './SettlementWorkspaceClient'
import RemittanceWorkspaceClient from './RemittanceWorkspaceClient'

export function SettlementsAccessDenied() {
  return (
    <div className="p-6">
      <h1 className="text-white text-2xl font-bold mb-2">{SETTLEMENTS_MODULE_LABEL}</h1>
      <p className="text-slate-400 text-sm">Settlements is available to admin and owner only in v1.</p>
    </div>
  )
}

export async function requireSettlementWorkspace(
  runId: string,
  showId?: string | null,
): Promise<{ denied: true } | { denied: false; data: SettlementWorkspaceData; focusedShowId: string | null }> {
  const actor = await getSettlementsActor()
  if (!actor) return { denied: true }
  const data = await loadSettlementWorkspace(runId)
  if (!data) notFound()
  if (showId && !data.shows.some(s => s.id === showId)) notFound()
  return { denied: false, data, focusedShowId: showId ?? null }
}

export function SettlementSheetView({
  data,
  focusedShowId,
}: {
  data: SettlementWorkspaceData
  focusedShowId: string | null
}) {
  return (
    <SettlementSheetClient
      run={data.run}
      shows={data.shows}
      liveFields={data.liveFields}
      expectedSource={data.expectedSource}
      focusedShowId={focusedShowId}
      insideFactors={data.insideFactors}
      remittanceKnownLines={data.remittanceKnownLines}
      actuals={data.actuals}
      challenges={data.challenges}
      bandCosts={data.bandCosts}
    />
  )
}

export function SettlementWorkspaceView({
  data,
  focusedShowId,
}: {
  data: SettlementWorkspaceData
  focusedShowId: string | null
}) {
  return (
    <SettlementWorkspaceClient
      run={data.run}
      shows={data.shows}
      liveFields={data.liveFields}
      settlement={data.settlement}
      bandCosts={data.bandCosts}
      focusedShowId={focusedShowId}
      agentSettlementLines={data.agentSettlementLines}
      actuals={data.actuals}
    />
  )
}

export function RemittanceWorkspaceView({
  data,
  focusedShowId,
}: {
  data: SettlementWorkspaceData
  focusedShowId: string | null
}) {
  return (
    <RemittanceWorkspaceClient
      run={data.run}
      shows={data.shows}
      liveFields={data.liveFields}
      settlement={data.settlement}
      remittanceLines={data.remittanceLines}
      agentSettlementLines={data.agentSettlementLines}
      challenges={data.challenges}
      focusedShowId={focusedShowId}
    />
  )
}
