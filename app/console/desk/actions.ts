'use server'

import { createClient } from '@/lib/supabase/server'
import { getConsoleSession } from '@/lib/console/session'
import { resolveAvatarUrl } from '@/lib/supabase/avatar'
import { verifyMemberQrToken } from '@/lib/member-card'
import { canUseDesk } from '@/lib/auth/roles'
import { bangkokToday, isWeekend } from '@/lib/check-in/day'

// Front-desk actions. Every write is a database function (see
// supabase/schema.sql §13) called with the staff member's own session, so
// the database — not this file — decides who may do what, refuses
// self-service, and writes the audit log.

type Supabase = Awaited<ReturnType<typeof createClient>>

export type PaymentMethod = 'cash' | 'transfer' | 'card'
export type EntryType = 'paid' | 'reward'

export type TodayVisit = {
  id: string
  entryType: EntryType
  price: number
  paymentMethod: PaymentMethod | null
  wristband: string | null
  checkedInAt: string
  checkedOutAt: string | null
}

export type DeskMember = {
  id: string
  name: string
  memberNo: string | null
  avatarUrl: string | null
  joinedAt: string | null
  role: string
  isSelf: boolean
  stamps: { stamps: number; rewardsAvailable: number; progress: number } | null
  today: TodayVisit | null
  priceToday: number
  weekend: boolean
}

export type MemberHit = { id: string; name: string; memberNo: string | null; phone: string | null; avatarUrl: string | null }

export type FloorVisit = TodayVisit & { memberId: string | null; memberNo: string | null; name: string }

export type Floor = {
  date: string
  visits: FloorVisit[]
}

export type DeskResult<T> = { ok: true; data: T } | { ok: false; error: string }

// PostgREST / Postgres codes meaning "the §13 objects don't exist yet".
const MISSING_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01'])

function errorCode(error: { code?: string; message?: string } | null): string {
  if (!error) return 'failed'
  if (error.code && MISSING_CODES.has(error.code)) return 'not_set_up'
  // Our functions raise plain codes, e.g. "already_checked_in".
  const m = /^([a-z_]+)$/.exec((error.message ?? '').trim())
  return m ? m[1] : 'failed'
}

async function requireDesk(): Promise<{ supabase: Supabase; userId: string } | { error: string }> {
  const { supabase, user, role } = await getConsoleSession()
  if (!user) return { error: 'not_staff' }
  if (!canUseDesk(role)) return { error: 'not_staff' }
  return { supabase, userId: user.id }
}

function fullName(p: { first_name?: string | null; last_name?: string | null; email?: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—'
}

function toVisit(v: Record<string, unknown>): TodayVisit {
  return {
    id: v.id as string,
    entryType: v.entry_type as EntryType,
    price: v.price as number,
    paymentMethod: (v.payment_method as PaymentMethod | null) ?? null,
    wristband: (v.wristband as string | null) ?? null,
    checkedInAt: v.checked_in_at as string,
    checkedOutAt: (v.checked_out_at as string | null) ?? null,
  }
}

const VISIT_COLUMNS = 'id, member_id, member_no, entry_type, price, payment_method, wristband, checked_in_at, checked_out_at'

async function loadMember(supabase: Supabase, userId: string, memberId: string): Promise<DeskResult<DeskMember>> {
  const today = bangkokToday()
  const [{ data: p, error: pErr }, visitRes, stampRes, priceRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email, member_no, role, created_at, avatar_path, provider_avatar_url')
      .eq('id', memberId)
      .maybeSingle(),
    supabase
      .from('visits')
      .select(VISIT_COLUMNS)
      .eq('member_id', memberId)
      .eq('visit_date', today)
      .is('cancelled_at', null)
      .maybeSingle(),
    supabase.rpc('member_stamp_status', { p_member_id: memberId }),
    supabase.rpc('day_pass_price', { p_date: today }),
  ])
  if (pErr) return { ok: false, error: errorCode(pErr) }
  if (!p) return { ok: false, error: 'member_not_found' }
  const setupError = [visitRes.error, stampRes.error, priceRes.error].find(Boolean)
  if (setupError) return { ok: false, error: errorCode(setupError) }

  const s = Array.isArray(stampRes.data) ? stampRes.data[0] : stampRes.data
  return {
    ok: true,
    data: {
      id: p.id,
      name: fullName(p),
      memberNo: p.member_no ?? null,
      avatarUrl: await resolveAvatarUrl(supabase, p),
      joinedAt: p.created_at ?? null,
      role: p.role ?? 'customer',
      isSelf: p.id === userId,
      stamps: s ? { stamps: s.stamps, rewardsAvailable: s.rewards_available, progress: s.progress } : null,
      today: visitRes.data ? toVisit(visitRes.data) : null,
      priceToday: Number(priceRes.data),
      weekend: isWeekend(today),
    },
  }
}

export async function lookupByToken(token: string): Promise<DeskResult<DeskMember>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const check = verifyMemberQrToken(token)
  if (!check.ok) return { ok: false, error: check.reason === 'expired' ? 'qr_expired' : 'qr_invalid' }
  return loadMember(ctx.supabase, ctx.userId, check.userId)
}

export async function getMember(memberId: string): Promise<DeskResult<DeskMember>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  return loadMember(ctx.supabase, ctx.userId, memberId)
}

export async function searchMembers(query: string): Promise<DeskResult<MemberHit[]>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { supabase } = ctx

  const q = query.trim()
  const digits = q.replace(/\D/g, '')
  // Only letters (any script), digits and spaces reach the filter string.
  const text = q.replace(/[^\p{L}\p{N} ]/gu, '').trim()

  let req = supabase
    .from('profiles')
    .select('id, first_name, last_name, email, member_no, phone, avatar_path, provider_avatar_url')
    .limit(8)
  if (digits.length >= 9 && digits.length === q.replace(/[\s-]/g, '').length) {
    req = req.or(`phone.eq.${digits},member_no.eq.${digits.padStart(10, '0')}`)
  } else if (digits.length > 0 && digits === q) {
    // A short number is a member number without its leading zeros.
    req = req.eq('member_no', digits.padStart(10, '0'))
  } else if (text.length >= 2) {
    req = req.or(`first_name.ilike.%${text}%,last_name.ilike.%${text}%`)
  } else {
    return { ok: true, data: [] }
  }

  const { data, error } = await req
  if (error) return { ok: false, error: errorCode(error) }
  const hits = await Promise.all(
    (data ?? []).map(async (p) => ({
      id: p.id,
      name: fullName(p),
      memberNo: p.member_no ?? null,
      phone: p.phone ?? null,
      avatarUrl: await resolveAvatarUrl(supabase, p),
    })),
  )
  return { ok: true, data: hits }
}

export async function checkIn(input: {
  memberId: string
  entryType: EntryType
  paymentMethod: PaymentMethod | null
  wristband: string
}): Promise<DeskResult<DeskMember>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await ctx.supabase.rpc('staff_check_in', {
    p_member_id: input.memberId,
    p_entry_type: input.entryType,
    p_payment_method: input.entryType === 'paid' ? input.paymentMethod : null,
    p_wristband: input.wristband.trim().slice(0, 20) || null,
  })
  if (error) return { ok: false, error: errorCode(error) }
  return loadMember(ctx.supabase, ctx.userId, input.memberId)
}

export async function checkOut(visitId: string): Promise<DeskResult<null>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await ctx.supabase.rpc('staff_check_out', { p_visit_id: visitId })
  return error ? { ok: false, error: errorCode(error) } : { ok: true, data: null }
}

export async function cancelVisit(visitId: string, reason: string): Promise<DeskResult<null>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await ctx.supabase.rpc('staff_cancel_visit', {
    p_visit_id: visitId,
    p_reason: reason.trim().slice(0, 200),
  })
  return error ? { ok: false, error: errorCode(error) } : { ok: true, data: null }
}

// Everyone who checked in today (uncancelled), newest first.
export async function getFloor(): Promise<DeskResult<Floor>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { supabase } = ctx
  const today = bangkokToday()
  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_COLUMNS)
    .eq('visit_date', today)
    .is('cancelled_at', null)
    .order('checked_in_at', { ascending: false })
  if (error) return { ok: false, error: errorCode(error) }

  const ids = [...new Set((data ?? []).map((v) => v.member_id).filter(Boolean))] as string[]
  const names: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: people } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', ids)
    for (const p of people ?? []) names[p.id] = fullName(p)
  }
  return {
    ok: true,
    data: {
      date: today,
      visits: (data ?? []).map((v) => ({
        ...toVisit(v),
        memberId: v.member_id ?? null,
        memberNo: v.member_no ?? null,
        name: (v.member_id && names[v.member_id]) || '—',
      })),
    },
  }
}
