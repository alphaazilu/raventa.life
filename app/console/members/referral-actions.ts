'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { setReferral } from '@/lib/console/referral'
import { MEMBERS_PATH } from '@/lib/auth/roles'

// Admin: who referred this member (§36, v0.36) — only before their first visit.
export async function setMemberReferral(memberId: string, referrerId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  try {
    const r = await setReferral(memberId, referrerId || null, ctx.userId)
    if (r !== 'ok') return { ok: false, error: r }
    revalidatePath(`${MEMBERS_PATH}/${memberId}`)
    return { ok: true }
  } catch (err) {
    console.error('set referral failed', (err as Error).message)
    return { ok: false, error: 'failed' }
  }
}
