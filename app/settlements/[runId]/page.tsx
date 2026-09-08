import { requireSettlementWorkspace, SettlementsAccessDenied, SettlementSheetView } from '../require-settlement-workspace'

export const dynamic = 'force-dynamic'

export default async function SettlementRunPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  const loaded = await requireSettlementWorkspace(runId)
  if (loaded.denied) return <SettlementsAccessDenied />
  return <SettlementSheetView data={loaded.data} focusedShowId={null} />
}
