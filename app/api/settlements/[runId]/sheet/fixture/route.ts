import { NextResponse } from 'next/server'

/**
 * Removed: Load Harbour fixture / Load BNZ-shaped venue statement.
 * Use POST /api/settlements/[runId]/email-scrape/apply (settlement-scrape-packet-v1).
 */
export async function POST() {
  return NextResponse.json({
    error: 'Harbour and BNZ fixture loaders were removed. Ingest settlement / remittance email attachments via /email-scrape/apply.',
    removed: ['Load Harbour fixture', 'Load BNZ-shaped venue statement'],
  }, { status: 410 })
}
