import { requireSettlementWorkspace, SettlementsAccessDenied, SettlementWorkspaceView } from '../../require-settlement-workspace'

export const dynamic = 'force-dynamic'

export default async function SettlementRunAgentPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  const loaded = await requireSettlementWorkspace(runId)
  if (loaded.denied) return <SettlementsAccessDenied />
  return <SettlementWorkspaceView data={loaded.data} focusedShowId={null} />
}
