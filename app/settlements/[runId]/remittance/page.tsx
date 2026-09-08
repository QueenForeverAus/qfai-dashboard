import { requireSettlementWorkspace, SettlementsAccessDenied, RemittanceWorkspaceView } from '../../require-settlement-workspace'

export const dynamic = 'force-dynamic'

export default async function RemittanceRunPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  const loaded = await requireSettlementWorkspace(runId)
  if (loaded.denied) return <SettlementsAccessDenied />
  return <RemittanceWorkspaceView data={loaded.data} focusedShowId={null} />
}
