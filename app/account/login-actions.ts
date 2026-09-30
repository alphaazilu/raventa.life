'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  applyVerifiedEmail,
  checkEmailCode,
  EMAIL_RE,
  normalizeEmail,
  sendEmailCode,
} from '@/lib/email-verification'

// "Sign-in methods" on /account/settings: confirm an email for the account
// (LINE members) and add a password, so the member can also sign in with
// email + password. Linking Google happens in the browser (linkIdentity).

export type LoginActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

// Same rule as the signup form (app/login/actions.ts).
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

async function currentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function requestEmailCode(rawEmail: string): Promise<LoginActionResult<{ maskedEmail: string }>> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'not_signed_in' }
  // Changing an existing login email isn't offered here (yet).
  if (user.email) return { ok: false, error: 'already_has_email' }

  const email = normalizeEmail(rawEmail)
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'invalid_email' }

  const { data: taken } = await supabase.rpc('email_is_taken', { p_email: email, p_exclude_id: user.id })
  if (taken === true) return { ok: false, error: 'taken' }

  const sent = await sendEmailCode(user.id, email)
  return sent.ok ? { ok: true, data: { maskedEmail: sent.maskedEmail } } : { ok: false, error: sent.reason }
}

export async function confirmEmailCode(code: string): Promise<LoginActionResult<{ email: string }>> {
  const { user } = await currentUser()
  if (!user) return { ok: false, error: 'not_signed_in' }
  if (user.email) return { ok: false, error: 'already_has_email' }

  const checked = await checkEmailCode(user.id, code)
  if (!checked.ok) return { ok: false, error: checked.reason }
  const applied = await applyVerifiedEmail(user.id, checked.email)
  if (!applied.ok) return { ok: false, error: applied.reason }

  revalidatePath('/account', 'layout')
  return { ok: true, data: { email: checked.email } }
}

export async function setLoginPassword(password: string, confirm: string): Promise<LoginActionResult> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'not_signed_in' }
  // A password only works with a confirmed login email to go with it.
  if (!user.email) return { ok: false, error: 'needs_email' }
  if (!PASSWORD_RE.test(password)) return { ok: false, error: 'weak_password' }
  if (password !== confirm) return { ok: false, error: 'mismatch' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    console.error('setLoginPassword failed', error.code, error.message)
    const known = ['same_password', 'weak_password', 'reauthentication_needed']
    return { ok: false, error: error.code && known.includes(error.code) ? error.code : 'failed' }
  }
  await supabase.from('profiles').update({ has_password: true }).eq('id', user.id)
  revalidatePath('/account', 'layout')
  return { ok: true, data: null }
}
