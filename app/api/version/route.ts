import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Which build is live — the tablet compares it with its own (UpdateBanner).
export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? '', sha: process.env.NEXT_PUBLIC_COMMIT_SHA ?? '' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
