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
// while signed in to join the package. Written with the service role after
// checking who is asking.

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
  cancelled_at: string | null
  visits_total: number | null
  visits_used: number
  expires_on: string | null
  activate_by: string | null
  starts_on: string | null
}

function shareableNow(p: PackageRow): boolean {
  const today = bangkokToday()
  if (!p.shareable || p.cancelled_at) return false
  if (p.visits_total !== null && p.visits_used >= p.visits_total) return false
  if (p.expires_on && p.expires_on < today) return false
  if (!p.starts_on && p.activate_by && p.activate_by < today) return false
  return true
}

async function ownedPackage(packageId: string, userId: string): Promise<PackageRow | null> {
  const { data } = await createAdminClient()
    .from('member_packages')
    .select('id, member_id, name, shareable, cancelled_at, visits_total, visits_used, expires_on, activate_by, starts_on')
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
    const { subject, html } = packageShareEmail(owner?.first_name || 'เพื่อนของคุณ', pkg.name, url)
    const sent = await getResendClient().emails.send({ from, to: email, subject, html })
    if (sent.error) return { ok: false, error: 'send_failed' }
  }
  return { ok: true, data: { url, minutes } }
}

export async function revokeShare(shareId: string): Promise<ShareResult> {
  const user = await me()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const admin = createAdminClient()
  const { data: share } = await admin.from('package_shares').select('id, package_id').eq('id', shareId).maybeSingle()
  if (!share || !(await ownedPackage(share.package_id, user.id))) return { ok: false, error: 'not_yours' }
  const { error } = await admin.from('package_shares').update({ revoked_at: new Date().toISOString() }).eq('id', shareId)
  if (error) return { ok: false, error: 'failed' }
  revalidatePath('/account')
  return { ok: true, data: null }
}

export type ShareInfo = { packageName: string; ownerName: string; visitsLeft: number | null }

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
      visitsLeft: pkg.visits_total === null ? null : pkg.visits_total - pkg.visits_used,
    },
  }
}

export async function acceptShareLink(token: string): Promise<ShareResult> {
  const user = await me()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const invite = await findInvite(token)
  if (!invite.ok) return invite
  const { id, pkg } = invite.data
  if (pkg.member_id === user.id) return { ok: false, error: 'own_package' }
  const admin = createAdminClient()
  // Claim the link first (one use), then add the friend (already in = fine).
  const { data: claimed } = await admin
    .from('package_share_invites')
    .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq('id', id)
    .is('claimed_by', null)
    .select('id')
  if (!claimed?.length) return { ok: false, error: 'used' }
  const { error } = await admin.from('package_shares').insert({ package_id: pkg.id, member_id: user.id, invite_id: id })
  if (error && error.code !== '23505') return { ok: false, error: 'failed' }
  revalidatePath('/account')
  return { ok: true, data: null }
}

async function findInvite(token: string): Promise<ShareResult<{ id: string; pkg: PackageRow }>> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, error: 'invalid' }
  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('package_share_invites')
    .select('id, package_id, expires_at, claimed_by')
    .eq('token_hash', hashShareToken(token))
    .maybeSingle()
  if (!invite) return { ok: false, error: 'invalid' }
  if (invite.claimed_by) return { ok: false, error: 'used' }
  if (new Date(invite.expires_at).getTime() < Date.now()) return { ok: false, error: 'expired' }
  const { data: pkg } = await admin
    .from('member_packages')
    .select('id, member_id, name, shareable, cancelled_at, visits_total, visits_used, expires_on, activate_by, starts_on')
    .eq('id', invite.package_id)
    .maybeSingle()
  if (!pkg || !shareableNow(pkg as PackageRow)) return { ok: false, error: 'not_shareable' }
  return { ok: true, data: { id: invite.id, pkg: pkg as PackageRow } }
}
