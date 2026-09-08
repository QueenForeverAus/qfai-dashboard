import { redirect } from 'next/navigation'
import { settlementSheetHref } from '@/lib/settlements-sheet'

export const dynamic = 'force-dynamic'

export default async function SettlementRunSheetRedirect({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  redirect(settlementSheetHref(runId))
}
