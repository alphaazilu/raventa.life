'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEmailCode, normalizeEmail, sendEmailCode } from '@/lib/email-verification'
import { clearGoogleLinkTicket, googleLinkAccount } from '@/lib/auth/google-link-ticket'
import { signInAs } from '@/lib/auth/sign-in-as'

// Google sign-in on an email that already has a RAVENTA account (refused in
// app/auth/callback): prove the email is yours with a 6-digit code sent to
// it, then the pending mark on Google is cleared and this browser is signed
// in to that account (app/auth/callback set the mark). Someone with only the Google
// account — or only a shared computer — gets nowhere without the inbox.
// No inbox any more → the counter checks ID and an admin changes the email.

export type GoogleLinkResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

export async function sendGoogleLinkCode(): Promise<GoogleLinkResult<{ maskedEmail: string }>> {
  const account = await googleLinkAccount()
  if (!account) return { ok: false, error: 'expired_ticket' }
  const sent = await sendEmailCode(account.userId, account.email)
  return sent.ok ? { ok: true, data: { maskedEmail: sent.maskedEmail } } : { ok: false, error: sent.reason }
}

export async function confirmGoogleLinkCode(code: string): Promise<GoogleLinkResult> {
  const account = await googleLinkAccount()
  if (!account) return { ok: false, error: 'expired_ticket' }
  const check = await checkEmailCode(account.userId, code)
  if (!check.ok) return { ok: false, error: check.reason }
  // The code went to the account's own email — it must still be that one.
  if (normalizeEmail(check.email) !== account.email) return { ok: false, error: 'failed' }
  try {
    // Google is already on the account (marked pending) — just clear the
    // mark and sign in. No second trip to Google.
    const { error } = await createAdminClient().auth.admin.updateUserById(account.userId, {
      app_metadata: { google_pending: null },
    })
    if (error) throw error
    const supabase = await createClient()
    await supabase.auth.signOut()
    await signInAs(supabase, account.email)
  } catch (err) {
    console.error('google link: sign-in after code failed', err)
    return { ok: false, error: 'failed' }
  }
  await clearGoogleLinkTicket()
  return { ok: true, data: null }
}
