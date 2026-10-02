'use server'

import { isMissingTable } from '@/lib/console/guard'
import { createClient } from '@/lib/supabase/server'
import { getConsoleSession } from '@/lib/console/session'
import { resolveAvatarUrl } from '@/lib/supabase/avatar'
import { verifyMemberQrToken } from '@/lib/member-card'
import { canUseDesk, isAdmin } from '@/lib/auth/roles'
import { getCurrentDevice } from '@/lib/console/device'
import { deskAllowed } from '@/lib/console/settings'
import { createAdminClient } from '@/lib/supabase/admin'
import { bangkokToday, isWeekend } from '@/lib/check-in/day'
import { dayTypeOf, loadCatalog, priceOn, type DayType } from '@/lib/console/catalog'

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
  // Set when the check-in came from a bill (v0.20): undo = void the bill.
  saleId: string | null
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

export type Takings = { cash: number; transfer: number; card: number; total: number }

export type Floor = {
  date: string
  visits: FloorVisit[]
  // Everything taken today: bills (§18) plus any older check-ins without one.
  takings: Takings
}

export type DeskResult<T> = { ok: true; data: T } | { ok: false; error: string }

function errorCode(error: { code?: string; message?: string } | null): string {
  if (!error) return 'failed'
  if (isMissingTable(error)) return 'not_set_up'
  // Our functions raise plain codes, e.g. "already_checked_in".
  const m = /^([a-z_]+)$/.exec((error.message ?? '').trim())
  return m ? m[1] : 'failed'
}

async function requireDesk(): Promise<{ supabase: Supabase; userId: string; onTablet: boolean } | { error: string }> {
  const { supabase, user, role } = await getConsoleSession()
  if (!user) return { error: 'not_staff' }
  if (!canUseDesk(role)) return { error: 'not_staff' }
  // Staff sell on a registered tablet unless an admin allowed their phone
  // (Back Office › Settings, §19).
  const onTablet = Boolean(await getCurrentDevice().catch(() => null))
  if (!(await deskAllowed({ userId: user.id, admin: isAdmin(role), onTablet }))) return { error: 'desk_tablet_only' }
  return { supabase, userId: user.id, onTablet }
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
    saleId: (v.sale_id as string | null) ?? null,
  }
}

const VISIT_COLUMNS_V11 = 'id, member_id, member_no, entry_type, price, payment_method, wristband, checked_in_at, checked_out_at'
const VISIT_COLUMNS = `${VISIT_COLUMNS_V11}, sale_id`

// visits.sale_id arrives with §18; until that SQL is run, read without it.
async function selectVisits<T>(run: (columns: string) => PromiseLike<{ data: T; error: { code?: string } | null }>) {
  const res = await run(VISIT_COLUMNS)
  return res.error?.code === '42703' ? run(VISIT_COLUMNS_V11) : res
}

async function loadMember(supabase: Supabase, userId: string, memberId: string): Promise<DeskResult<DeskMember>> {
  const today = bangkokToday()
  const [{ data: p, error: pErr }, visitRes, stampRes, priceRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email, member_no, role, created_at, avatar_path, provider_avatar_url')
      .eq('id', memberId)
      .maybeSingle(),
    selectVisits((cols) =>
      supabase.from('visits').select(cols).eq('member_id', memberId).eq('visit_date', today).is('cancelled_at', null).maybeSingle(),
    ),
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
      today: visitRes.data ? toVisit(visitRes.data as unknown as Record<string, unknown>) : null,
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
  const { data: rows, error } = await selectVisits((cols) =>
    supabase.from('visits').select(cols).eq('visit_date', today).is('cancelled_at', null).order('checked_in_at', { ascending: false }),
  )
  if (error) return { ok: false, error: errorCode(error) }
  const data = (rows ?? []) as unknown as Record<string, unknown>[]

  const ids = [...new Set(data.map((v) => v.member_id).filter(Boolean))] as string[]
  const names: Record<string, string> = {}
  const [people, salesRes] = await Promise.all([
    ids.length > 0 ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', ids) : Promise.resolve({ data: [] }),
    supabase.from('sales').select('total, payment_method').eq('sale_date', today).is('voided_at', null),
  ])
  for (const p of people.data ?? []) names[p.id] = fullName(p)

  const takings: Takings = { cash: 0, transfer: 0, card: 0, total: 0 }
  const add = (method: unknown, amount: number) => {
    if (method === 'cash' || method === 'transfer' || method === 'card') takings[method] += amount
    takings.total += amount
  }
  // Bills (§18) carry the money; a check-in made without a bill (before
  // v0.20) still counts its own price.
  for (const s of salesRes.error ? [] : (salesRes.data ?? [])) add(s.payment_method, Number(s.total))
  for (const v of data) if (!v.sale_id && v.entry_type === 'paid') add(v.payment_method, Number(v.price))

  return {
    ok: true,
    data: {
      date: today,
      takings,
      visits: data.map((v) => ({
        ...toVisit(v),
        memberId: (v.member_id as string | null) ?? null,
        memberNo: (v.member_no as string | null) ?? null,
        name: (v.member_id ? names[v.member_id as string] : undefined) || '—',
      })),
    },
  }
}

// ---- Bill (v0.20, schema.sql §18) ----

export type DeskItem = {
  id: string
  kind: string
  name: { th: string; en: string }
  price: number
  trackStock: boolean
  stock: number
  variants: { id: string; label: string; stock: number }[]
}

export type DeskCatalog = { items: DeskItem[]; dayType: DayType } | null

export type BillLine = { productId: string; variantId: string | null; qty: number }
export type DayPassMode = 'none' | 'paid' | 'reward'

export type BillInput = {
  memberId: string | null
  dayPass: DayPassMode
  items: BillLine[]
  code: string
}

export type Quote = {
  lines: { kind: string; name: string; nameEn: string; qty: number; unitPrice: number; lineTotal: number; reward: boolean }[]
  subtotal: number
  discount: number
  total: number
  promoName: string | null
  dayType: DayType
}

// What the counter can add to a bill today (not the Day Pass — that comes
// with the member). null = §18 not set up yet.
export async function getDeskCatalog(): Promise<DeskResult<DeskCatalog>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  try {
    const cat = await loadCatalog(ctx.supabase)
    if (!cat) return { ok: true, data: null }
    const dayType = dayTypeOf(bangkokToday(), cat.holidays)
    const items = cat.products
      .filter((p) => p.active && p.kind !== 'day_pass')
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        name: { th: p.nameTh, en: p.nameEn || p.nameTh },
        price: priceOn(p, dayType),
        trackStock: p.trackStock,
        stock: p.stock,
        variants: p.variants.filter((v) => v.active).map((v) => ({ id: v.id, label: v.label, stock: v.stock })),
      }))
    return { ok: true, data: { items, dayType } }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

function rpcArgs(input: BillInput) {
  return {
    p_member_id: input.memberId,
    p_day_pass: input.dayPass,
    p_items: input.items
      .filter((l) => l.qty > 0)
      .map((l) => ({ product_id: l.productId, variant_id: l.variantId, qty: Math.min(99, Math.round(l.qty)) })),
    p_promo_code: input.code.trim().toUpperCase().slice(0, 20) || null,
  }
}

// Before §18 is run the desk still sells a plain Day Pass the old way.
function legacyOnly(input: BillInput) {
  return input.dayPass !== 'none' && input.items.length === 0 && !input.code.trim()
}

export async function quoteBill(input: BillInput): Promise<DeskResult<Quote>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { data, error } = await ctx.supabase.rpc('pos_quote', rpcArgs(input))
  if (error) {
    const code = errorCode(error)
    if (code === 'not_set_up' && legacyOnly(input)) {
      const today = bangkokToday()
      const price = input.dayPass === 'reward' ? 0 : Number((await ctx.supabase.rpc('day_pass_price', { p_date: today })).data ?? 0)
      return {
        ok: true,
        data: {
          lines: [{ kind: 'day_pass', name: 'Day Pass', nameEn: 'Day Pass', qty: 1, unitPrice: price, lineTotal: price, reward: input.dayPass === 'reward' }],
          subtotal: price,
          discount: 0,
          total: price,
          promoName: null,
          dayType: isWeekend(today) ? 'weekend' : 'weekday',
        },
      }
    }
    return { ok: false, error: code }
  }
  const q = data as Record<string, unknown>
  return {
    ok: true,
    data: {
      lines: ((q.lines as Record<string, unknown>[]) ?? []).map((l) => ({
        kind: l.kind as string,
        name: l.name as string,
        nameEn: (l.name_en as string) || (l.name as string),
        qty: Number(l.qty),
        unitPrice: Number(l.unit_price),
        lineTotal: Number(l.line_total),
        reward: Boolean(l.reward),
      })),
      subtotal: Number(q.subtotal),
      discount: Number(q.discount),
      total: Number(q.total),
      promoName: (q.promo_name as string | null) ?? null,
      dayType: q.day_type as DayType,
    },
  }
}

export type CheckoutDone = { receiptNo: number | null; total: number; member: DeskMember | null }

export async function checkoutBill(
  input: BillInput & { paymentMethod: PaymentMethod | null; wristband: string },
): Promise<DeskResult<CheckoutDone>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const wristband = input.wristband.trim().slice(0, 20) || null
  const { data, error } = await ctx.supabase.rpc('pos_checkout', {
    ...rpcArgs(input),
    p_payment_method: input.paymentMethod,
    p_wristband: input.dayPass === 'none' ? null : wristband,
  })
  let receiptNo: number | null = null
  let total = 0
  if (error) {
    const code = errorCode(error)
    if (!(code === 'not_set_up' && legacyOnly(input) && input.memberId)) return { ok: false, error: code }
    const legacy = await ctx.supabase.rpc('staff_check_in', {
      p_member_id: input.memberId,
      p_entry_type: input.dayPass,
      p_payment_method: input.dayPass === 'paid' ? input.paymentMethod : null,
      p_wristband: wristband,
    })
    if (legacy.error) return { ok: false, error: errorCode(legacy.error) }
  } else {
    const r = data as Record<string, unknown>
    receiptNo = Number(r.receipt_no)
    total = Number(r.total)
    // Sold away from a counter tablet (an admin, or staff allowed on their
    // phone): note it, so the log shows where each bill was taken.
    if (!ctx.onTablet) {
      await createAdminClient()
        .from('staff_actions')
        .insert({ actor_id: ctx.userId, member_id: input.memberId, action: 'sale_off_tablet', detail: { sale_id: r.sale_id, receipt_no: receiptNo, total } })
        .then(() => undefined, () => undefined)
    }
  }
  if (!input.memberId) return { ok: true, data: { receiptNo, total, member: null } }
  const m = await loadMember(ctx.supabase, ctx.userId, input.memberId)
  return { ok: true, data: { receiptNo, total, member: m.ok ? m.data : null } }
}

export async function voidSale(saleId: string, reason: string): Promise<DeskResult<null>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await ctx.supabase.rpc('pos_void_sale', { p_sale_id: saleId, p_reason: reason.trim().slice(0, 200) })
  return error ? { ok: false, error: errorCode(error) } : { ok: true, data: null }
}
