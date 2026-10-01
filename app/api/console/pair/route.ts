import { NextResponse } from 'next/server'
import { pollPairing, startPairing } from '@/lib/console/device'

// Counter-tablet pairing (the /tablet screen). Open to anyone by design: a
// code only becomes a device once a signed-in admin approves it in
// Back Office → Devices.

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

// Get (or keep) this tablet's 6-digit code.
export async function POST() {
  const res = await startPairing()
  return NextResponse.json(res, { status: res.ok ? 200 : res.error === 'busy' ? 429 : 503, headers: noStore })
}

// Has an admin approved it yet?
export async function GET() {
  const status = await pollPairing()
  return NextResponse.json({ status }, { headers: noStore })
}
