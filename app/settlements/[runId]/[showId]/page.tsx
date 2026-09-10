import { redirect } from 'next/navigation'
import { settlementSheetHref } from '@/lib/settlements-sheet'
import { requireSettlementWorkspace, SettlementsAccessDenied } from '../../require-settlement-workspace'

export const dynamic = 'force-dynamic'

/** Show-scoped sheet URLs are bookmarks, not a second settlement. */
export default async function SettlementShowPage({
  params,
}: {
  params: Promise<{ runId: string; showId: string }>
}) {
  const { runId, showId } = await params
  const loaded = await requireSettlementWorkspace(runId, showId)
  if (loaded.denied) return <SettlementsAccessDenied />
  redirect(settlementSheetHref(loaded.data.run.code, showId))
}
