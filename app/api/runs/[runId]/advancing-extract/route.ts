import { NextRequest } from 'next/server'
import { handleAdvancingApplyPost } from '@/lib/advancing-apply-http'

/**
 * POST /api/runs/[runId]/advancing-extract
 * Body: advancing-packet-v1 (single packet or { packets: [...] }).
 * Untrusted packet text is never executed — figures only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  return handleAdvancingApplyPost(req, runId)
}
