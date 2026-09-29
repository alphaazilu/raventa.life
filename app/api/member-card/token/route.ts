import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createMemberQrToken, REFRESH_SECONDS } from '@/lib/member-card'

// A fresh check-in code for the signed-in member's card. The card asks
// again every REFRESH_SECONDS while it's open.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const { token, expiresAt } = createMemberQrToken(user.id)
  return NextResponse.json(
    { token, expiresAt, refreshIn: REFRESH_SECONDS },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
