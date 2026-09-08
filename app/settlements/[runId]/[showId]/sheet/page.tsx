import { redirect } from 'next/navigation'
import { settlementSheetHref } from '@/lib/settlements-sheet'

export const dynamic = 'force-dynamic'

export default async function SettlementShowSheetRedirect({
  params,
}: {
  params: Promise<{ runId: string; showId: string }>
}) {
  const { runId, showId } = await params
  redirect(settlementSheetHref(runId, showId))
}
