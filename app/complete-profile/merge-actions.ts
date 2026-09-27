'use server'

import { createHash, randomInt, timingSafeEqual } from 'crypto'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProfileComplete, PROFILE_COMPLETENESS_COLUMNS } from '@/lib/supabase/profile'
import { getResendClient } from '@/lib/resend'
import { mergeCodeEmail } from '@/lib/email-templates'

// Joins a brand-new LINE sign-in onto an existing membership.
//
// Who this is for: someone who joined with Google or email/password, later
// taps the LINE OA rich menu, and so gets a second, empty account from LINE.
// On /complete-profile the email OR phone they type turns out to be a
// member's already, and they choose "link to my existing account".
//
// 1. startMerge  — emails a 6-digit code to that existing member's own
//                  address (proof the person owns that membership).
// 2. verifyMerge — checks the code, signs the browser into the EXISTING
//                  account, then deletes the empty LINE account.
// 3. The browser then links LINE onto the existing account with
//    supabase.auth.linkIdentity (components/complete-profile/merge-panel).
//
// Order in step 2 matters: the session is switched first, and only then is
// anything deleted, so a failure part-way never leaves someone with no way
// back in. And only an account that is LINE-only AND never finished signing
// up is ever deleted — see isDisposableLineAccount().

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_ATTEMPTS = 5
// Per existing membership, per rolling 24 hours, across ALL requesters —
// the per-code limit above alone can be sidestepped by asking for new codes.
const MAX_CODES_PER_TARGET_PER_DAY = 5
const MAX_WRONG_PER_TARGET_PER_DAY = 10
const DAY_MS = 24 * 60 * 60 * 1000

// Which existing membership to join: the one whose login email matches, or
// the one that already has this phone number.
export type MergeTarget = { email: string } | { phone: string }

export type StartMergeResult =
  | { ok: true; maskedEmail: string }
  | { ok: false; reason: 'not_allowed' | 'not_found' | 'target_has_line' | 'too_soon' | 'target_limit' | 'failed' }

export type VerifyMergeResult =
  // canLinkLine is false only in the rare case the leftover LINE account
  // couldn't be removed: the person IS signed into their real membership,
  // but LINE can't be attached until an admin deletes the leftover.
  | { ok: true; canLinkLine: boolean }
  | { ok: false; reason: 'not_allowed' | 'wrong_code' | 'expired' | 'too_many_attempts' | 'failed' }

function hashCode(code: string, userId: string): string {
  // Peppered with the server secret, so the stored hash can't be brute-forced
  // offline from a database dump (only 1,000,000 possible codes).
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createHash('sha256').update(`${code}:${userId}:${pepper}`).digest('hex')
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 3))}@${domain}`
}

function isLineOnly(user: User): boolean {
  const identities = user.identities ?? []
  return identities.length > 0 && identities.every((i) => i.provider === 'custom:line') && !user.email
}

// The only kind of account this feature will ever delete: signed in with
// LINE and nothing else, and never finished /complete-profile (so there is
// no membership in it anyone could lose).
async function isDisposableLineAccount(user: User): Promise<boolean> {
  if (!isLineOnly(user)) return false
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select(`role, ${PROFILE_COMPLETENESS_COLUMNS}`)
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role === 'admin') return false
  return !isProfileComplete(profile)
}

async function countRecentEvents(targetId: string, kind: 'code_sent' | 'wrong_code'): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('account_merge_events')
    .select('id', { count: 'exact', head: true })
    .eq('target_user_id', targetId)
    .eq('kind', kind)
    .gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
  return count ?? 0
}

async function logEvent(targetId: string, kind: 'code_sent' | 'wrong_code'): Promise<void> {
  const { error } = await createAdminClient().from('account_merge_events').insert({ target_user_id: targetId, kind })
  if (error) console.error('merge: could not log event', error.message)
}

export async function startMerge(targetRef: MergeTarget): Promise<StartMergeResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || !(await isDisposableLineAccount(user))) return { ok: false, reason: 'not_allowed' }

    const admin = createAdminClient()

    // By email: must be an account that actually signs in with it (an email
    // another LINE member merely typed on their profile doesn't count —
    // there'd be no way to sign into it here). By phone: whoever has it.
    const { data: targetId } =
      'email' in targetRef
        ? await admin.rpc('find_user_id_by_email', { p_email: targetRef.email })
        : await admin.rpc('find_user_id_by_phone', { p_phone: targetRef.phone })
    if (!targetId || targetId === user.id) return { ok: false, reason: 'not_found' }

    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetId)
    const target = targetData?.user
    if (targetError || !target?.email) return { ok: false, reason: 'not_found' }
    if (target.identities?.some((i) => i.provider === 'custom:line')) {
      // That membership already has a (different) LINE account on it.
      return { ok: false, reason: 'target_has_line' }
    }

    const { data: existing } = await admin
      .from('account_merge_codes')
      .select('created_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing && Date.now() - new Date(existing.created_at).getTime() < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: 'too_soon' }
    }
    if (
      (await countRecentEvents(target.id, 'code_sent')) >= MAX_CODES_PER_TARGET_PER_DAY ||
      (await countRecentEvents(target.id, 'wrong_code')) >= MAX_WRONG_PER_TARGET_PER_DAY
    ) {
      return { ok: false, reason: 'target_limit' }
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const now = new Date()
    const { error: saveError } = await admin.from('account_merge_codes').upsert({
      user_id: user.id,
      target_user_id: target.id,
      code_hash: hashCode(code, user.id),
      expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      created_at: now.toISOString(),
    })
    if (saveError) throw saveError

    const from = process.env.EMAIL_FROM_ADDRESS
    if (!from) throw new Error('EMAIL_FROM_ADDRESS is not set')
    const { subject, html } = mergeCodeEmail(code)
    const { error: sendError } = await getResendClient().emails.send({ from, to: target.email, subject, html })
    if (sendError) throw new Error(sendError.message)
    await logEvent(target.id, 'code_sent')

    return { ok: true, maskedEmail: maskEmail(target.email) }
  } catch (err) {
    console.error('startMerge failed', err)
    return { ok: false, reason: 'failed' }
  }
}

export async function verifyMerge(code: string): Promise<VerifyMergeResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || !(await isDisposableLineAccount(user))) return { ok: false, reason: 'not_allowed' }

    const admin = createAdminClient()
    const { data: row } = await admin
      .from('account_merge_codes')
      .select('target_user_id, code_hash, expires_at, attempts')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' }
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' }
    if ((await countRecentEvents(row.target_user_id, 'wrong_code')) >= MAX_WRONG_PER_TARGET_PER_DAY) {
      return { ok: false, reason: 'too_many_attempts' }
    }

    const given = Buffer.from(hashCode(code.trim(), user.id))
    const stored = Buffer.from(row.code_hash)
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      await admin
        .from('account_merge_codes')
        .update({ attempts: row.attempts + 1 })
        .eq('user_id', user.id)
      await logEvent(row.target_user_id, 'wrong_code')
      return { ok: false, reason: row.attempts + 1 >= MAX_ATTEMPTS ? 'too_many_attempts' : 'wrong_code' }
    }

    const { data: targetData } = await admin.auth.admin.getUserById(row.target_user_id)
    const targetEmail = targetData?.user?.email
    if (!targetEmail) return { ok: false, reason: 'failed' }

    // 1) Switch this browser's session to the existing membership. A
    //    magic-link token generated server-side (no email is sent) and
    //    redeemed straight away sets the new session cookies.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
    })
    if (linkError || !link?.properties?.hashed_token) throw linkError ?? new Error('no token')
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: 'magiclink',
    })
    if (otpError) throw otpError

    // 2) Only now remove the empty LINE account. This also frees the LINE
    //    identity so step 3 (linkIdentity in the browser) can attach it to
    //    the existing membership. Its merge-code row goes with it (cascade).
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      // Signed into the right account already; LINE just can't be linked
      // until an admin removes the leftover account. Say so, don't hide it.
      console.error('verifyMerge: signed in, but could not delete the empty LINE account', deleteError.message)
      return { ok: true, canLinkLine: false }
    }

    return { ok: true, canLinkLine: true }
  } catch (err) {
    console.error('verifyMerge failed', err)
    return { ok: false, reason: 'failed' }
  }
}
