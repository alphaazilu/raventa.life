'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EMAIL_RE, normalizeEmail } from '@/lib/email-verification'
import { getResendClient } from '@/lib/resend'
import { packageShareEmail } from '@/lib/email-templates'
import { hashShareToken, newShareToken, SHARE_EMAIL_DAYS, SHARE_QR_MINUTES, shareUrl } from '@/lib/package-share'
import { bangkokToday } from '@/lib/check-in/day'

// Sharing a package (§23). The owner makes a one-time link — shown as a QR
// for a friend standing next to them, or emailed — and the friend opens it
// while signed in. Depending on the product's setting the friend either gets
// ONE visit, taken off the owner's package there and then
// (package_share_split), or joins the whole package (package_shares;
// families, couples). Written with the service role after checking who is
// asking.

export type ShareResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

const MAX_INVITES_PER_DAY = 20

async function me() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

type PackageRow = {
  id: string
  member_id: string
  name: string
  shareable: boolean
  share_whole: boolean
  cancelled_at: string | null
  visits_total: number | null
  visits_used: number
  visits_given: number
  valid_days: number
  shared_from: string | null
  expires_on: string | null
  activate_by: string | null
  starts_on: string | null
  weekday_only: boolean
}

// The friend's visit lasts as long as the package could (same rule as
// package_share_split): its end date, or for one not started yet, the last
// day it could run if started on its deadline.
function pieceUntil(p: PackageRow): string {
  if (p.expires_on) return p.expires_on
  const today = bangkokToday()
  const from = p.activate_by && p.activate_by > today ? p.activate_by : today
  const d = new Date(`${from}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + p.valid_days - 1)
  return d.toISOString().slice(0, 10)
}

function shareableNow(p: PackageRow): boolean {
  const today = bangkokToday()
  if (!p.shareable || p.cancelled_at || p.shared_from) return false
  if (p.visits_total === null ? !p.share_whole : p.visits_used + p.visits_given >= p.visits_total) return false
  if (p.expires_on && p.expires_on < today) return false
  if (!p.starts_on && p.activate_by && p.activate_by < today) return false
  return true
}

const PACKAGE_COLUMNS =
  'id, member_id, name, shareable, share_whole, cancelled_at, visits_total, visits_used, visits_given, valid_days, shared_from, expires_on, activate_by, starts_on, weekday_only'

async function ownedPackage(packageId: string, userId: string): Promise<PackageRow | null> {
  const { data } = await createAdminClient()
    .from('member_packages')
    .select(PACKAGE_COLUMNS)
    .eq('id', packageId)
    .maybeSingle()
  return data && data.member_id === userId ? (data as PackageRow) : null
}

// email omitted → a short-lived link for a QR.
export async function createShareLink(packageId: string, rawEmail?: string): Promise<ShareResult<{ url: string; minutes: number }>> {
  const user = await me()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const pkg = await ownedPackage(packageId, user.id)
  if (!pkg) return { ok: false, error: 'not_yours' }
  if (!shareableNow(pkg)) return { ok: false, error: 'not_shareable' }

  const admin = createAdminClient()
  const { count } = await admin
    .from('package_share_invites')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
  if ((count ?? 0) >= MAX_INVITES_PER_DAY) return { ok: false, error: 'limit' }

  const email = rawEmail ? normalizeEmail(rawEmail) : null
  if (email !== null && !EMAIL_RE.test(email)) return { ok: false, error: 'invalid_email' }
  const minutes = email ? SHARE_EMAIL_DAYS * 24 * 60 : SHARE_QR_MINUTES
  const { token, hash } = newShareToken()
  const { error } = await admin.from('package_share_invites').insert({
    package_id: pkg.id,
    token_hash: hash,
    email,
    expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    created_by: user.id,
  })
  if (error) return { ok: false, error: 'failed' }
  const url = shareUrl(token)

  if (email) {
    const from = process.env.EMAIL_FROM_ADDRESS
    if (!from) return { ok: false, error: 'no_sender' }
    const { data: owner } = await admin.from('profiles').select('first_name').eq('id', user.id).maybeSingle()
    const { subject, html } = packageShareEmail(owner?.first_name || 'เพื่อนของคุณ', pkg.name, url, {
      whole: pkg.share_whole,
      until: pkg.share_whole ? null : pieceUntil(pkg),
    })
    const sent = await getResendClient().emails.send({ from, to: email, subject, html })
    if (sent.error) return { ok: false, error: 'send_failed' }
  }
  return { ok: true, data: { url, minutes } }
}

// The owner takes back the visits a friend hasn't used yet ('piece'), or
// removes a friend from the whole package ('member').
export async function revokeShare(id: string, kind: 'piece' | 'member'): Promise<ShareResult> {
  const user = await me()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const admin = createAdminClient()
  if (kind === 'member') {
    const { data: share } = await admin.from('package_shares').select('id, package_id, member_id, revoked_at').eq('id', id).maybeSingle()
    if (!share || !(await ownedPackage(share.package_id, user.id))) return { ok: false, error: 'not_yours' }
    if (share.revoked_at) return { ok: true, data: null }
    const { error } = await admin.from('package_shares').update({ revoked_at: new Date().toISOString() }).eq('id', id)
    if (error) return { ok: false, error: 'failed' }
    await logShareEvent({ package_id: share.package_id, owner_id: user.id, friend_id: share.member_id, action: 'remove', actor: user.id })
  } else {
    const { data: piece } = await admin.from('member_packages').select('id, shared_from').eq('id', id).maybeSingle()
    if (!piece?.shared_from || !(await ownedPackage(piece.shared_from, user.id))) return { ok: false, error: 'not_yours' }
    const { error } = await admin.rpc('package_share_revoke', { p_piece_id: id, p_actor: user.id })
    if (error) return { ok: false, error: error.message.includes('nothing_left') ? 'nothing_left' : 'failed' }
  }
  revalidatePath('/account')
  return { ok: true, data: null }
}

export type ShareInfo = {
  packageName: string
  ownerName: string
  whole: boolean
  until: string | null // one visit: use by; whole: the package's end (null = not started)
  visitsLeft: number | null // whole: left on the package (null = unlimited)
  weekdayOnly: boolean
}

// What the link is for (shown before accepting). Never reveals the email.
export async function readShareLink(token: string): Promise<ShareResult<ShareInfo>> {
  const invite = await findInvite(token)
  if (!invite.ok) return invite
  const { pkg } = invite.data
  const { data: owner } = await createAdminClient().from('profiles').select('first_name').eq('id', pkg.member_id).maybeSingle()
  return {
    ok: true,
    data: {
      packageName: pkg.name,
      ownerName: owner?.first_name || '—',
      whole: pkg.share_whole,
      until: pkg.share_whole ? pkg.expires_on : pieceUntil(pkg),
      visitsLeft: pkg.visits_total === null ? null : pkg.visits_total - pkg.visits_used - pkg.visits_given,
      weekdayOnly: pkg.weekday_only,
    },
  }
}

export async function acceptShareLink(token: string): Promise<ShareResult> {
  const user = await me()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const invite = await findInvite(token)
  if (!invite.ok) return invite
  const { id, pkg, via } = invite.data
  if (pkg.member_id === user.id) return { ok: false, error: 'own_package' }
  const admin = createAdminClient()
  // Claim the link first (one use), then hand over the visit / add the
  // friend. If that fails (no visits left by now), the link is released.
  const { data: claimed } = await admin
    .from('package_share_invites')
    .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq('id', id)
    .is('claimed_by', null)
    .select('id')
  if (!claimed?.length) return { ok: false, error: 'used' }
  const { error } = pkg.share_whole
    ? await admin.from('package_shares').insert({ package_id: pkg.id, member_id: user.id, invite_id: id })
    : await admin.rpc('package_share_split', { p_package_id: pkg.id, p_friend: user.id, p_via: via })
  // Already on the whole package = fine.
  if (error && !(pkg.share_whole && error.code === '23505')) {
    await admin.from('package_share_invites').update({ claimed_by: null, claimed_at: null }).eq('id', id)
    const code = ['not_shareable', 'own_package'].find((c) => error.message.includes(c))
    return { ok: false, error: code ?? 'failed' }
  }
  if (pkg.share_whole && !error) {
    await logShareEvent({ package_id: pkg.id, owner_id: pkg.member_id, friend_id: user.id, action: 'join', via, actor: user.id })
  }
  revalidatePath('/account')
  return { ok: true, data: null }
}

// The share history (schema §23, package_share_events). Best-effort: a
// missing log line never undoes a share. One-visit gives/take-backs are
// logged by the SQL functions themselves.
async function logShareEvent(row: {
  package_id: string
  owner_id: string
  friend_id: string
  action: 'join' | 'remove'
  via?: 'qr' | 'email'
  actor: string
}) {
  const { error } = await createAdminClient().from('package_share_events').insert({ ...row, visits: null })
  if (error) console.error('package_share_events insert failed', error.message)
}

async function findInvite(token: string): Promise<ShareResult<{ id: string; pkg: PackageRow; via: 'qr' | 'email' }>> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, error: 'invalid' }
  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('package_share_invites')
    .select('id, package_id, expires_at, claimed_by, email')
    .eq('token_hash', hashShareToken(token))
    .maybeSingle()
  if (!invite) return { ok: false, error: 'invalid' }
  if (invite.claimed_by) return { ok: false, error: 'used' }
  if (new Date(invite.expires_at).getTime() < Date.now()) return { ok: false, error: 'expired' }
  const { data: pkg } = await admin
    .from('member_packages')
    .select(PACKAGE_COLUMNS)
    .eq('id', invite.package_id)
    .maybeSingle()
  if (!pkg || !shareableNow(pkg as PackageRow)) return { ok: false, error: 'not_shareable' }
  return { ok: true, data: { id: invite.id, pkg: pkg as PackageRow, via: invite.email ? 'email' : 'qr' } }
}
