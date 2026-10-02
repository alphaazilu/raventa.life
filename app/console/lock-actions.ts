'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyMemberQrToken } from '@/lib/member-card'
import { getCurrentDevice } from '@/lib/console/device'
import { canUseDesk, CONSOLE_PATH, DESK_PATH, isAdmin } from '@/lib/auth/roles'
import { clockInIfNeeded } from '@/lib/console/time'
import { signInAs } from '@/lib/auth/sign-in-as'

// Counter tablet: start working by scanning your own member card (Vault R2).
// Only on a registered tablet. The signed card QR (lib/member-card.ts, 90 s
// lifetime) proves who is standing there; the server then opens that staff
// member's own session on the tablet — a magic-link token generated and
// redeemed server-side, no email sent — so everything they do is recorded
// under their name exactly as if they had typed a password.

export type CardSignIn = { ok: true; to: string } | { ok: false; error: string }

export async function signInWithCard(rawToken: string): Promise<CardSignIn> {
  const device = await getCurrentDevice().catch(() => null)
  if (!device) return { ok: false, error: 'not_device' }

  const check = verifyMemberQrToken(rawToken)
  if (!check.ok) return { ok: false, error: check.reason === 'expired' ? 'qr_expired' : 'qr_invalid' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', check.userId).maybeSingle()
  if (!canUseDesk(profile?.role)) return { ok: false, error: 'not_staff' }

  const { data: target } = await admin.auth.admin.getUserById(check.userId)
  const email = target?.user?.email
  if (!email) return { ok: false, error: 'no_email' }

  try {
    const supabase = await createClient()
    // Whoever was signed in before is replaced.
    await supabase.auth.signOut()
    await signInAs(supabase, email)
  } catch (err) {
    console.error('signInWithCard failed', err)
    return { ok: false, error: 'failed' }
  }

  await admin.from('staff_actions').insert({
    actor_id: check.userId,
    action: 'console_sign_in',
    detail: { device_id: device.id, device: device.name, method: 'card' },
  })
  // Staff: the first scan of the day is the clock-in (§16). Locking and
  // scanning back in mid-shift keeps the same entry. Admins aren't clocked.
  if (profile?.role === 'staff') await clockInIfNeeded(check.userId, device.id, 'card')
  return { ok: true, to: isAdmin(profile?.role) ? CONSOLE_PATH : DESK_PATH }
}

// "Lock / switch person" on the tablet, and the idle auto-lock.
export async function lockConsole(reason: 'manual' | 'idle' = 'manual'): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const device = await getCurrentDevice().catch(() => null)
  if (user && device) {
    await createAdminClient()
      .from('staff_actions')
      .insert({ actor_id: user.id, action: 'console_lock', detail: { device_id: device.id, device: device.name, reason } })
  }
  await supabase.auth.signOut()
  redirect(CONSOLE_PATH)
}
