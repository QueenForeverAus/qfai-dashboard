import { redirect } from 'next/navigation'

/** Legacy P&L Calculator deep link → this run's Run Costing sheet. */
export default async function RunPnlRedirect({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  redirect(`/runs/${runId}`)
}
