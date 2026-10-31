'use server'

import { createClient } from '@/lib/supabase/server'
import { recordConsents } from '@/lib/consent'
import { WAIVER_VERSION } from '@/lib/legal/content'

// The member accepts the health-readiness waiver themselves (§54, v0.43.0) — from
// the card on My account or before their member QR shows. Recorded with
// their own session (source 'self'); staff at the desk only need to confirm
// it for members who skipped this.
export async function acceptWaiver(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const ok = await recordConsents(supabase, user.id, [{ kind: 'waiver', version: WAIVER_VERSION, granted: true, source: 'self' }])
  return { ok }
}
