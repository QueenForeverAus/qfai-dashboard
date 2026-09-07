import { NextRequest } from 'next/server'
import { handleAdvancingApplyPost } from '@/lib/advancing-apply-http'

/**
 * POST /api/runs/[runId]/apply-advancing
 * Alias of /api/runs/[runId]/advancing-extract (advancing-packet-v1).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  return handleAdvancingApplyPost(req, runId)
}
