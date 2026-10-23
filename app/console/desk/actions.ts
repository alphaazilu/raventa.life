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
import { loadMemberPackages, type MemberPackage } from '@/lib/packages'
import { recordCommissions } from '@/lib/console/commission'
import { markArrived, memberToday } from '@/lib/console/booking'

// Front-desk actions. Every write is a database function (see
// supabase/schema.sql §13) called with the staff member's own session, so
// the database — not this file — decides who may do what, refuses
// self-service, and writes the audit log.

type Supabase = Awaited<ReturnType<typeof createClient>>

export type PaymentMethod = 'cash' | 'transfer' | 'card'
export type EntryType = 'paid' | 'reward' | 'package'

export type TodayVisit = {
  id: string
  entryType: EntryType
  price: number
  paymentMethod: PaymentMethod | null
  wristband: string | null
  locker: string | null
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
  // Visits before today (not cancelled) and the latest one — no money here.
  history: { count: number; last: string | null }
  // Packages still alive (§21), and the one a check-in today would use.
  packages: MemberPackage[]
  packageToday: string | null
  today: TodayVisit | null
  priceToday: number
  weekend: boolean
  // Booked for today (§34, v0.35): shown with "add to bill".
  bookingsToday: DeskBooking[]
}

export type DeskBooking = { id: string; name: { th: string; en: string }; start: string; end: string; wholeDay: boolean; arriveTime: string | null; productId: string | null; status: 'booked' | 'arrived'; kind: string; with: string | null }

export type MemberHit = { id: string; name: string; memberNo: string | null; phone: string | null; avatarUrl: string | null }

// loans: lent and not handed back yet (§39, v0.37.2).
export type FloorVisit = TodayVisit & { memberId: string | null; memberNo: string | null; name: string; loans?: { id: string; name: string; nameEn: string; qty: number }[] }

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

async function requireDesk(): Promise<{ supabase: Supabase; userId: string; onTablet: boolean; branchId: string | null } | { error: string }> {
  const { supabase, user, role } = await getConsoleSession()
  if (!user) return { error: 'not_staff' }
  if (!canUseDesk(role)) return { error: 'not_staff' }
  // Staff sell on a registered tablet unless an admin allowed their phone
  // (Back Office › Settings, §19).
  const device = await getCurrentDevice().catch(() => null)
  const onTablet = Boolean(device)
  if (!(await deskAllowed({ userId: user.id, admin: isAdmin(role), onTablet }))) return { error: 'desk_tablet_only' }
  // The branch this tablet rings up for (§47). Off a tablet there is no branch
  // to pin, so the row keeps its default (the main branch).
  return { supabase, userId: user.id, onTablet, branchId: device?.branchId ?? null }
}

// Pin a just-created sale and its visits to the tablet's branch (§47). The
// rows were inserted with the main branch as default; this corrects them for a
// multi-branch shop. Service-role, best-effort: a miss leaves the main branch,
// which never corrupts takings, only misattributes them.
async function tagBranch(branchId: string | null, saleId: string | null, visitId?: string | null): Promise<void> {
  if (!branchId) return
  const admin = createAdminClient()
  const ignore = () => undefined
  if (saleId) {
    await admin.from('sales').update({ branch_id: branchId }).eq('id', saleId).then(ignore, ignore)
    await admin.from('visits').update({ branch_id: branchId }).eq('sale_id', saleId).then(ignore, ignore)
  }
  if (visitId) await admin.from('visits').update({ branch_id: branchId }).eq('id', visitId).then(ignore, ignore)
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
    locker: (v.locker as string | null) ?? null,
    checkedInAt: v.checked_in_at as string,
    checkedOutAt: (v.checked_out_at as string | null) ?? null,
    saleId: (v.sale_id as string | null) ?? null,
  }
}

const VISIT_COLUMNS_BASE = 'id, member_id, member_no, entry_type, price, payment_method, wristband, checked_in_at, checked_out_at'
const VISIT_COLUMNS = `${VISIT_COLUMNS_BASE}, sale_id, locker`
const VISIT_COLUMNS_BRANCH = `${VISIT_COLUMNS}, branch_id`

// visits.sale_id arrives with §18, locker with §44 and branch_id with §47;
// before each is run, drop the missing column and read the rest.
async function selectVisits<T>(run: (columns: string) => PromiseLike<{ data: T; error: { code?: string } | null }>) {
  let res = await run(VISIT_COLUMNS_BRANCH)
  if (res.error?.code === '42703') res = await run(VISIT_COLUMNS)
  if (res.error?.code === '42703') res = await run(`${VISIT_COLUMNS_BASE}, sale_id`)
  if (res.error?.code === '42703') res = await run(VISIT_COLUMNS_BASE)
  return res
}

async function loadMember(supabase: Supabase, userId: string, memberId: string): Promise<DeskResult<DeskMember>> {
  const today = bangkokToday()
  const [{ data: p, error: pErr }, visitRes, stampRes, priceRes, pastRes, pkgRes, pkgNowRes, booked] = await Promise.all([
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
    supabase
      .from('visits')
      .select('visit_date', { count: 'exact' })
      .eq('member_id', memberId)
      .lt('visit_date', today)
      .is('cancelled_at', null)
      .order('visit_date', { ascending: false })
      .limit(1),
    loadMemberPackages(supabase, memberId, today),
    supabase.rpc('usable_package', { p_member_id: memberId, p_date: today }),
    memberToday(memberId),
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
      packages: pkgRes,
      packageToday: pkgNowRes.error ? null : ((pkgNowRes.data as string | null) ?? null),
      history: { count: pastRes.count ?? 0, last: (pastRes.data?.[0]?.visit_date as string | undefined) ?? null },
      today: visitRes.data ? toVisit(visitRes.data as unknown as Record<string, unknown>) : null,
      priceToday: Number(priceRes.data),
      weekend: isWeekend(today),
      bookingsToday: booked.map((b) => ({
        id: b.id,
        name: b.typeName,
        start: b.start,
        end: b.end,
        wholeDay: b.wholeDay,
        arriveTime: b.arriveTime,
        productId: b.productId,
        status: b.status as 'booked' | 'arrived',
        kind: b.kind,
        with: b.resourceLabel,
      })),
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

// Back in the same day (§22): reopens today's visit, no charge.
export async function reEnter(visitId: string): Promise<DeskResult<null>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await ctx.supabase.rpc('staff_reenter_visit', { p_visit_id: visitId })
  return error ? { ok: false, error: errorCode(error) } : { ok: true, data: null }
}

export async function checkOut(visitId: string): Promise<DeskResult<null>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await ctx.supabase.rpc('staff_check_out', { p_visit_id: visitId })
  if (error) return { ok: false, error: errorCode(error) }
  // Lent items come back at check-out (§39). Before §39 the table is missing — fine.
  await ctx.supabase.rpc('staff_return_loans', { p_visit_id: visitId })
  return { ok: true, data: null }
}

// Check out, settling lent items (§44): tick which came back, charge the
// lost ones (a small bill at today's price), leave the rest outstanding.
export type CheckoutLoansResult = { chargedTotal: number; receiptNo: number | null; outstanding: number }
export async function checkOutWithLoans(
  visitId: string,
  returnedIds: string[],
  chargeIds: string[],
  paymentMethod: PaymentMethod | null,
): Promise<DeskResult<CheckoutLoansResult>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { data, error } = await ctx.supabase.rpc('staff_checkout_with_loans', {
    p_visit: visitId,
    p_returned: returnedIds,
    p_charge: chargeIds,
    p_payment_method: chargeIds.length ? paymentMethod : null,
  })
  if (error) return { ok: false, error: errorCode(error) }
  const d = (data ?? {}) as { charged_total?: number; receipt_no?: number | null; outstanding?: number }
  return { ok: true, data: { chargedTotal: Number(d.charged_total ?? 0), receiptNo: d.receipt_no ?? null, outstanding: Number(d.outstanding ?? 0) } }
}


// Hand out one thing from a member's package (§40). Returns the use (to undo) and what's left.
export async function redeemPackageItem(rowId: string): Promise<DeskResult<{ useId: string; left: number | null }>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { data, error } = await ctx.supabase.rpc('staff_use_package_item', { p_row: rowId, p_qty: 1 })
  if (error) return { ok: false, error: errorCode(error) }
  const d = data as { use_id: string; left: number | null }
  return { ok: true, data: { useId: d.use_id, left: d.left ?? null } }
}

export async function undoPackageItem(useId: string): Promise<DeskResult<null>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await ctx.supabase.rpc('staff_undo_package_item', { p_use: useId })
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
  let data = (rows ?? []) as unknown as Record<string, unknown>[]
  // On a branch's tablet, show only that branch's floor and takings (§47).
  // Pre-§47 rows carry no branch_id, so the filter is skipped for them.
  const branchId = ctx.branchId
  const scoped = Boolean(branchId) && data.some((v) => 'branch_id' in v)
  if (scoped) data = data.filter((v) => v.branch_id === branchId)

  const ids = [...new Set(data.map((v) => v.member_id).filter(Boolean))] as string[]
  const names: Record<string, string> = {}
  const visitIds = data.map((v) => v.id as string)
  // Takings sales, scoped to this branch when we can. branch_id arrives with
  // §47; fall back to the whole shop if it isn't there.
  const salesQuery = () => {
    const base = supabase.from('sales').select('total, payment_method, branch_id').eq('sale_date', today).is('voided_at', null)
    return scoped ? base.eq('branch_id', branchId as string) : base
  }
  const [people, salesRes0, loansRes] = await Promise.all([
    ids.length > 0 ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', ids) : Promise.resolve({ data: [] }),
    salesQuery(),
    visitIds.length > 0
      ? supabase.from('visit_loans').select('id, visit_id, qty, item_id, name').in('visit_id', visitIds).is('returned_at', null)
      : Promise.resolve({ data: [], error: null }),
  ])
  // sales.branch_id (and sale_date) may predate §47/§18; on a column error,
  // retry the takings query plainly so money still shows.
  let salesRes = salesRes0 as { data: { total: unknown; payment_method: unknown }[] | null; error: { code?: string } | null }
  if (salesRes.error?.code === '42703') {
    salesRes = await supabase.from('sales').select('total, payment_method').eq('sale_date', today).is('voided_at', null)
  }
  for (const p of people.data ?? []) names[p.id] = fullName(p)
  const loanRows = (loansRes.error ? [] : (loansRes.data ?? [])) as unknown as Record<string, unknown>[]
  // Product names separately — a PostgREST embed (products(...)) could error on
  // the relationship and silently drop every loan, so it is kept out of the
  // query. The loan's own stored `name` is the Thai fallback.
  const itemIds = [...new Set(loanRows.map((l) => l.item_id).filter(Boolean))] as string[]
  const itemName: Record<string, { th: string; en: string }> = {}
  if (itemIds.length > 0) {
    const { data: prods } = await supabase.from('products').select('id, name_th, name_en').in('id', itemIds)
    for (const p of prods ?? []) itemName[p.id as string] = { th: p.name_th as string, en: (p.name_en as string) || (p.name_th as string) }
  }
  const loans: Record<string, { id: string; name: string; nameEn: string; qty: number }[]> = {}
  for (const l of loanRows) {
    const pn = l.item_id ? itemName[l.item_id as string] : undefined
    const name = (l.name as string) || pn?.th || '—'
    ;(loans[l.visit_id as string] ??= []).push({ id: l.id as string, name, nameEn: pn?.en || name, qty: Number(l.qty) })
  }

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
        loans: loans[v.id as string],
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
  // Packages: what one buys (§21).
  pkg: { visits: number | null; days: number } | null
  group?: string // a category id | 'none' (v0.37)
}

// groups: the category chips over the items (v0.37) — only ones with items.
// entries: the entry products on sale today (§41) — the first is the default.
export type DeskEntry = { id: string; name: { th: string; en: string }; price: number }
export type DeskCatalog = { items: DeskItem[]; dayType: DayType; groups?: { id: string; name: { th: string; en: string } }[]; entries?: DeskEntry[] } | null

export type BillLine = { productId: string; variantId: string | null; qty: number }
export type DayPassMode = 'none' | 'paid' | 'reward' | 'package'

export type BillInput = {
  memberId: string | null
  dayPass: DayPassMode
  items: BillLine[]
  code: string
  entryId?: string | null // which entry (§41); none = the first
}

export type Quote = {
  lines: { kind: string; name: string; nameEn: string; qty: number; unitPrice: number; lineTotal: number; reward: boolean; included?: boolean }[]
  // Lent with the bill (§39): handed back at check-out.
  loans?: { name: string; nameEn: string; qty: number }[]
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
        pkg: p.pkg ? { visits: p.pkg.visits, days: p.pkg.days } : null,
        group: p.categoryId && cat.categories?.some((x) => x.id === p.categoryId) ? p.categoryId : 'none',
      }))
    const has = new Set(items.map((i) => i.group))
    const groups = cat.categories
      ? [
          ...cat.categories.map((x) => ({ id: x.id, name: { th: x.nameTh, en: x.nameEn || x.nameTh } })),
          { id: 'none', name: { th: 'อื่นๆ', en: 'Other' } },
        ].filter((g) => has.has(g.id))
      : []
    const entries = cat.products
      .filter((p) => p.active && p.kind === 'day_pass')
      .sort((a, b) => a.sort - b.sort)
      .map((p) => ({ id: p.id, name: { th: p.nameTh, en: p.nameEn || p.nameTh }, price: priceOn(p, dayType) }))
    return { ok: true, data: { items, dayType, groups, entries } }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

function rpcArgs(input: BillInput, branchId?: string | null) {
  return {
    p_member_id: input.memberId,
    p_day_pass: input.dayPass,
    p_items: input.items
      .filter((l) => l.qty > 0)
      .map((l) => ({ product_id: l.productId, variant_id: l.variantId, qty: Math.min(99, Math.round(l.qty)) })),
    p_promo_code: input.code.trim().toUpperCase().slice(0, 20) || null,
    // Only sent when picked — before §41 the functions don't take it.
    ...(input.entryId ? { p_entry: input.entryId } : {}),
    // The tablet's branch, so the bill is priced with that branch's prices
    // (§48). Sent only when set, so older databases aren't asked for it.
    ...(branchId ? { p_branch: branchId } : {}),
  }
}

// Before §18 is run the desk still sells a plain Day Pass the old way.
function legacyOnly(input: BillInput) {
  return (input.dayPass === 'paid' || input.dayPass === 'reward') && input.items.length === 0 && !input.code.trim()
}

export async function quoteBill(input: BillInput): Promise<DeskResult<Quote>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { data, error } = await ctx.supabase.rpc('pos_quote', rpcArgs(input, ctx.branchId))
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
        included: Boolean(l.included),
      })),
      loans: ((q.loans as Record<string, unknown>[]) ?? []).map((l) => ({
        name: l.name as string,
        nameEn: (l.name_en as string) || (l.name as string),
        qty: Number(l.qty),
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

// Who earns commission on this bill (§33): a person picked for single lines
// (by lineKey). The member's referrer earns on their first bill (§36, v0.36).
export type BillCommission = { lineStaff: Record<string, string> }

export async function checkoutBill(
  input: BillInput & { paymentMethod: PaymentMethod | null; wristband: string; locker?: string; commission?: BillCommission; bookingIds?: string[] },
): Promise<DeskResult<CheckoutDone>> {
  const ctx = await requireDesk()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const wristband = input.wristband.trim().slice(0, 20) || null
  const locker = (input.locker ?? '').trim().slice(0, 20) || null
  const { data, error } = await ctx.supabase.rpc('pos_checkout', {
    ...rpcArgs(input, ctx.branchId),
    p_payment_method: input.paymentMethod,
    p_wristband: input.dayPass === 'none' ? null : wristband,
    p_locker: input.dayPass === 'none' ? null : locker,
  })
  let receiptNo: number | null = null
  let total = 0
  let saleId: string | null = null
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
    await tagBranch(ctx.branchId, null, (legacy.data as string | null) ?? null)
  } else {
    const r = data as Record<string, unknown>
    receiptNo = Number(r.receipt_no)
    total = Number(r.total)
    saleId = (r.sale_id as string | undefined) ?? null
    await tagBranch(ctx.branchId, saleId, (r.visit_id as string | null) ?? null)
    // Sold away from a counter tablet (an admin, or staff allowed on their
    // phone): note it, so the log shows where each bill was taken.
    if (!ctx.onTablet) {
      await createAdminClient()
        .from('staff_actions')
        .insert({ actor_id: ctx.userId, member_id: input.memberId, action: 'sale_off_tablet', detail: { sale_id: r.sale_id, receipt_no: receiptNo, total } })
        .then(() => undefined, () => undefined)
    }
    if (r.sale_id) {
      await recordCommissions({
        saleId: r.sale_id as string,
        cashierId: ctx.userId,
        memberId: input.memberId,
        lineStaff: input.commission?.lineStaff ?? {},
      })
    }
  }
  // Bookings that came with this bill (and today's entry window when
  // checking in) are now "arrived" (§34).
  if (input.memberId) await markArrived(input.memberId, input.bookingIds ?? [], saleId, input.dayPass !== 'none')
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

