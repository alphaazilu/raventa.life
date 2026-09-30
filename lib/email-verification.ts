// Server-only (service-role key). Never import from a client component.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getResendClient } from '@/lib/resend'
import { emailVerificationCodeEmail } from '@/lib/email-templates'

// Proves a member owns an email address before it becomes their login
// email: a 6-digit code emailed to it (through Resend, like every other
// site email), then — once entered — the address is written onto the
// account in Supabase Auth as confirmed. Used by the LINE sign-up on
// /complete-profile and by "set up email login" on /account/settings.
//
// Limits (same idea as the LINE merge codes): a code lives 10 minutes and
// allows 5 guesses; a new one only after a minute; per rolling day at most
// 5 codes per member and 5 per email address (so nobody can use the site
// to flood someone else's inbox) and 10 wrong guesses per member.

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_CODES_PER_USER_PER_DAY = 5
const MAX_CODES_PER_EMAIL_PER_DAY = 5
const MAX_WRONG_PER_USER_PER_DAY = 10
const DAY_MS = 24 * 60 * 60 * 1000

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type SendCodeResult =
  | { ok: true; maskedEmail: string }
  | { ok: false; reason: 'too_soon' | 'limit' | 'failed' }

export type CheckCodeResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'no_code' | 'wrong_code' | 'expired' | 'too_many_attempts' | 'limit' }

export type ApplyResult = { ok: true } | { ok: false; reason: 'taken' | 'failed' }

function hashCode(code: string, userId: string, email: string): string {
  // Peppered with the server secret so a leaked table can't be brute-forced
  // offline (only a million possible codes); bound to member + address.
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createHash('sha256').update(`email-verify:${code}:${userId}:${email}:${pepper}`).digest('hex')
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 3))}@${domain}`
}

async function countSince(column: 'user_id' | 'email', value: string, kind: 'code_sent' | 'wrong_code') {
  const { count } = await createAdminClient()
    .from('email_verification_events')
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .eq('kind', kind)
    .gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
  return count ?? 0
}

async function logEvent(userId: string, email: string, kind: 'code_sent' | 'wrong_code') {
  const { error } = await createAdminClient().from('email_verification_events').insert({ user_id: userId, email, kind })
  if (error) console.error('email-verification: could not log event', error.message)
}

export async function sendEmailCode(userId: string, rawEmail: string): Promise<SendCodeResult> {
  const email = normalizeEmail(rawEmail)
  const admin = createAdminClient()
  try {
    const { data: existing } = await admin
      .from('email_verification_codes')
      .select('created_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (existing && Date.now() - new Date(existing.created_at).getTime() < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: 'too_soon' }
    }
    const [byUser, byEmail] = await Promise.all([
      countSince('user_id', userId, 'code_sent'),
      countSince('email', email, 'code_sent'),
    ])
    if (byUser >= MAX_CODES_PER_USER_PER_DAY || byEmail >= MAX_CODES_PER_EMAIL_PER_DAY) {
      return { ok: false, reason: 'limit' }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const { error } = await admin.from('email_verification_codes').upsert(
      {
        user_id: userId,
        email,
        code_hash: hashCode(code, userId, email),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        attempts: 0,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (error) {
      console.error('email-verification: could not store code', error.message)
      return { ok: false, reason: 'failed' }
    }

    const from = process.env.EMAIL_FROM_ADDRESS
    if (!from) return { ok: false, reason: 'failed' }
    const { subject, html } = emailVerificationCodeEmail(code)
    const sent = await getResendClient().emails.send({ from, to: email, subject, html })
    if (sent.error) {
      console.error('email-verification: send failed', sent.error)
      return { ok: false, reason: 'failed' }
    }
    await logEvent(userId, email, 'code_sent')
    return { ok: true, maskedEmail: maskEmail(email) }
  } catch (err) {
    console.error('email-verification: sendEmailCode failed', err)
    return { ok: false, reason: 'failed' }
  }
}

// Checks a code against the member's pending one. The email comes from the
// stored row, never from the browser, so what gets verified is exactly the
// address the code was sent to.
export async function checkEmailCode(userId: string, rawCode: string): Promise<CheckCodeResult> {
  const code = rawCode.replace(/\D/g, '')
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('email_verification_codes')
    .select('email, code_hash, expires_at, attempts')
    .eq('user_id', userId)
    .maybeSingle()
  if (!row) return { ok: false, reason: 'no_code' }
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' }
  if ((await countSince('user_id', userId, 'wrong_code')) >= MAX_WRONG_PER_USER_PER_DAY) {
    return { ok: false, reason: 'limit' }
  }

  const expected = Buffer.from(row.code_hash, 'hex')
  const given = Buffer.from(hashCode(code, userId, row.email), 'hex')
  if (code.length !== 6 || expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await admin.from('email_verification_codes').update({ attempts: row.attempts + 1 }).eq('user_id', userId)
    await logEvent(userId, row.email, 'wrong_code')
    return { ok: false, reason: row.attempts + 1 >= MAX_ATTEMPTS ? 'too_many_attempts' : 'wrong_code' }
  }

  await admin.from('email_verification_codes').delete().eq('user_id', userId)
  return { ok: true, email: row.email }
}

// Makes a verified address the account's login email (confirmed), and the
// profile's contact email. Supabase refuses an address another account
// already signs in with — reported as 'taken'.
export async function applyVerifiedEmail(userId: string, email: string): Promise<ApplyResult> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
  if (error) {
    const taken = error.code === 'email_exists' || /already.*registered|already exists/i.test(error.message)
    if (!taken) console.error('email-verification: could not set login email', error.message)
    return { ok: false, reason: taken ? 'taken' : 'failed' }
  }
  const { error: pErr } = await admin.from('profiles').update({ email }).eq('id', userId)
  if (pErr) console.error('email-verification: could not copy email to profile', pErr.message)
  return { ok: true }
}
