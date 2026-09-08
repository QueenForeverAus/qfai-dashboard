import { requireSettlementWorkspace, SettlementsAccessDenied, SettlementWorkspaceView } from '../../../require-settlement-workspace'

export const dynamic = 'force-dynamic'

export default async function SettlementShowAgentPage({
  params,
}: {
  params: Promise<{ runId: string; showId: string }>
}) {
  const { runId, showId } = await params
  const loaded = await requireSettlementWorkspace(runId, showId)
  if (loaded.denied) return <SettlementsAccessDenied />
  return <SettlementWorkspaceView data={loaded.data} focusedShowId={showId} />
}
