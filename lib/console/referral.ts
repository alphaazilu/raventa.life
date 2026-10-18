import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { REF_ALPHABET, REF_RE, extractRefCode } from '@/lib/referral'

// Member referrals (§36, v0.36). SERVER ONLY (service role).

const db = () => createAdminClient()
const TEAM = ['staff', 'admin']
const nameOf = (p: { first_name?: unknown; last_name?: unknown; email?: unknown }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—'

export type RefVia = 'code' | 'qr' | 'admin' | 'default'

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')
}

// A team member's code, made the first time it's asked for. null = §36 not run / not on the team.
export async function codeFor(staffId: string): Promise<string | null> {
  const { data, error } = await db().from('staff_ref_codes').select('code').eq('staff_id', staffId).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  if (data) return data.code as string
  const { data: p } = await db().from('profiles').select('role').eq('id', staffId).maybeSingle()
  if (!p || !TEAM.includes(p.role as string)) return null
  for (let i = 0; i < 8; i++) {
    const code = newCode()
    const { error: e } = await db().from('staff_ref_codes').insert({ staff_id: staffId, code })
    if (!e) return code
    if (e.code !== '23505') throw e
    // Someone else made one at the same moment, or the code was taken: look again.
    const { data: again } = await db().from('staff_ref_codes').select('code').eq('staff_id', staffId).maybeSingle()
    if (again) return again.code as string
  }
  return null
}

// Who a code belongs to — team members only. First name only (shown to the guest).
export async function staffByCode(text: string): Promise<{ id: string; firstName: string; name: string } | null> {
  const code = extractRefCode(text)
  if (!REF_RE.test(code)) return null
  const { data, error } = await db().from('staff_ref_codes').select('staff_id').eq('code', code).maybeSingle()
  if (error || !data) return null
  const { data: p } = await db().from('profiles').select('id, first_name, last_name, email, role').eq('id', data.staff_id).maybeSingle()
  if (!p || !TEAM.includes(p.role as string)) return null
  return { id: p.id as string, firstName: (p.first_name as string) || nameOf(p), name: nameOf(p) }
}

// Has this member had a bill that stands (not voided)? Optionally leaving one out.
async function hasPaidBill(memberId: string, except?: string): Promise<boolean> {
  let q = db().from('sales').select('id').eq('member_id', memberId).is('voided_at', null).limit(1)
  if (except) q = q.neq('id', except)
  const { data } = await q
  return Boolean(data?.length)
}

// Is the first-bill referral used up? Yes when it was paid on a bill that
// still stands (v0.36.1: a bill with nothing for the referrer doesn't use
// it). No row = signed up before v0.36: used up once they've had any bill.
async function used(memberId: string, row: { paid_sale_id: unknown } | null, except?: string): Promise<boolean> {
  if (!row) return hasPaidBill(memberId, except)
  const paid = row.paid_sale_id as string | null
  if (!paid || paid === except) return false
  const { data } = await db().from('sales').select('voided_at').eq('id', paid).maybeSingle()
  return Boolean(data && !data.voided_at)
}

// At sign-up: keep who referred this member — or that they gave no code
// (referrer null → the default referrer when their first bill comes).
// Quietly does nothing for a member who already has a row or has visited,
// or before §36 is run — signing up never fails because of this.
export async function saveSignupReferral(memberId: string, text: string, via: 'code' | 'qr'): Promise<void> {
  try {
    const staff = text.trim() ? await staffByCode(text) : null
    if (await hasPaidBill(memberId)) return
    await db()
      .from('member_referrals')
      .upsert(
        staff && staff.id !== memberId
          ? { member_id: memberId, referrer_id: staff.id, via, set_by: memberId }
          : { member_id: memberId, referrer_id: null, via: 'default', set_by: memberId },
        { onConflict: 'member_id', ignoreDuplicates: true },
      )
  } catch (err) {
    console.error('referral save failed', (err as Error).message)
  }
}

export type MemberReferral = {
  referrerId: string | null // null = the default referrer applies
  name: string | null
  via: RefVia | null
  paid: boolean
  locked: boolean // first bill paid already → can't change
}

// For the member page (admin). null = §36 not run.
export async function referralOf(memberId: string): Promise<MemberReferral | null> {
  const { data, error } = await db().from('member_referrals').select('referrer_id, via, paid_sale_id').eq('member_id', memberId).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  const locked = await used(memberId, data ?? null)
  if (!data) return { referrerId: null, name: null, via: null, paid: false, locked }
  let name: string | null = null
  if (data.referrer_id) {
    const { data: p } = await db().from('profiles').select('first_name, last_name, email').eq('id', data.referrer_id).maybeSingle()
    name = p ? nameOf(p) : null
  }
  return { referrerId: (data.referrer_id as string | null) ?? null, name, via: data.via as RefVia, paid: locked && Boolean(data.paid_sale_id), locked }
}

// Admin: set a member's referrer (null = the default referrer) — only
// until their first-bill referral is paid.
export async function setReferral(memberId: string, referrerId: string | null, by: string): Promise<'ok' | 'ref_locked' | 'not_staff_member' | 'not_ref_set_up'> {
  const { data: row, error: probe } = await db().from('member_referrals').select('paid_sale_id').eq('member_id', memberId).maybeSingle()
  if (probe) {
    if (isMissingTable(probe)) return 'not_ref_set_up'
    throw probe
  }
  if (await used(memberId, row ?? null)) return 'ref_locked'
  if (referrerId) {
    const { data: p } = await db().from('profiles').select('role').eq('id', referrerId).maybeSingle()
    if (!p || !TEAM.includes(p.role as string) || referrerId === memberId) return 'not_staff_member'
  }
  const { error } = await db()
    .from('member_referrals')
    .upsert({ member_id: memberId, referrer_id: referrerId, via: referrerId ? 'admin' : 'default', set_by: by, paid_sale_id: null, updated_at: new Date().toISOString() }, { onConflict: 'member_id' })
  if (error) throw error
  return 'ok'
}

// At checkout, for a bill with something for the referrer: who earns the
// member's first-bill referral. Their referrer if they earn commission,
// else the default referrer (v0.36.1); if neither earns, nobody — and the
// referral waits for the next bill. Marks the bill as the one paid on.
// null = not due (used up / signed up before v0.36 and visited) or §36 not run.
export async function firstBillReferrer(memberId: string, saleId: string, earns: (id: string) => boolean): Promise<string | null> {
  try {
    const { data: row, error } = await db().from('member_referrals').select('referrer_id, paid_sale_id').eq('member_id', memberId).maybeSingle()
    if (error) return null
    if (await used(memberId, row ?? null, saleId)) return null
    const { data: s } = await db().from('app_settings').select('default_referrer_id').eq('id', 1).maybeSingle()
    const own = (row?.referrer_id as string | null | undefined) ?? null
    const fallback = (s?.default_referrer_id as string | null | undefined) ?? null
    const pick = [own, fallback].find((id): id is string => Boolean(id) && id !== memberId && earns(id as string)) ?? null
    if (!pick) return null
    if (row) await db().from('member_referrals').update({ paid_sale_id: saleId, updated_at: new Date().toISOString() }).eq('member_id', memberId)
    else await db().from('member_referrals').insert({ member_id: memberId, referrer_id: null, via: 'default', paid_sale_id: saleId })
    return pick
  } catch (err) {
    console.error('first-bill referral failed', (err as Error).message)
    return null
  }
}

// Settings: the default referrer. undefined = §36 not run.
export async function getDefaultReferrer(): Promise<string | null | undefined> {
  const { data, error } = await db().from('app_settings').select('default_referrer_id').eq('id', 1).maybeSingle()
  if (error) return undefined
  return (data?.default_referrer_id as string | null | undefined) ?? null
}

// Every team member's code (made if missing) — for the admin list.
export async function allCodes(ids: string[]): Promise<Record<string, string> | null> {
  const out: Record<string, string> = {}
  for (const id of ids) {
    const c = await codeFor(id).catch(() => null)
    if (c === null) {
      const { error } = await db().from('staff_ref_codes').select('staff_id').limit(1)
      if (error && isMissingTable(error)) return null
      continue
    }
    out[id] = c
  }
  return out
}
