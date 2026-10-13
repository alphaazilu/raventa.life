'use server'

import { revalidatePath } from 'next/cache'
import { getConsoleSession } from '@/lib/console/session'
import { canUseDesk, isAdmin, BOOKINGS_PATH } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { getBooking, listTypes, memberNoShow, sendBookingEmail, slotsFor } from '@/lib/console/booking'
import { CATEGORY_BUCKET, kindFor, STEP_OPTIONS, TEMPLATE_KEYS, type NoShowRules, type NoShowStatus, type Slot } from '@/lib/booking'

// Back Office › Bookings (§34, v0.35). Staff book for anyone and change
// statuses; setup and no-show rules are admin only. Written with the
// service role after the role check; book_slot() keeps places honest.

export type BkResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

async function team(): Promise<{ userId: string; admin: boolean } | { error: string }> {
  const { user, role } = await getConsoleSession()
  if (!user || !canUseDesk(role)) return { error: 'not_staff' }
  return { userId: user.id, admin: isAdmin(role) }
}

const rpcError = (e: { code?: string; message?: string } | null) => {
  if (!e) return 'failed'
  if (isMissingTable(e)) return 'not_set_up'
  const m = /^([a-z_]+)$/.exec((e.message ?? '').trim())
  return m ? m[1] : 'failed'
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

// ---- availability + booking ----

export async function staffSlots(typeId: string, day: string, ignore?: string): Promise<BkResult<{ slots: Slot[]; closed: boolean }>> {
  const ctx = await team()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!DAY_RE.test(day)) return { ok: false, error: 'bad_booking' }
  const types = await listTypes(true)
  const t = types?.find((x) => x.id === typeId)
  if (!t) return { ok: false, error: types ? 'bad_booking' : 'not_set_up' }
  return { ok: true, data: await slotsFor(t, day, 'staff', ignore) }
}

export type MemberPick = { id: string; name: string; memberNo: string | null; phone: string | null; noShow: NoShowStatus | null }

export async function findMembers(query: string): Promise<BkResult<MemberPick[]>> {
  const ctx = await team()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const q = query.trim()
  const digits = q.replace(/\D/g, '')
  const text = q.replace(/[^\p{L}\p{N} ]/gu, '').trim()
  let req = createAdminClient().from('profiles').select('id, first_name, last_name, email, member_no, phone').limit(8)
  if (digits.length >= 9 && digits.length === q.replace(/[\s-]/g, '').length) req = req.or(`phone.eq.${digits},member_no.eq.${digits.padStart(10, '0')}`)
  else if (digits.length > 0 && digits === q) req = req.eq('member_no', digits.padStart(10, '0'))
  else if (text.length >= 2) req = req.or(`first_name.ilike.%${text}%,last_name.ilike.%${text}%`)
  else return { ok: true, data: [] }
  const { data, error } = await req
  if (error) return { ok: false, error: 'failed' }
  const out = await Promise.all(
    (data ?? []).map(async (p) => ({
      id: p.id as string,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—',
      memberNo: (p.member_no as string | null) ?? null,
      phone: p.phone ? `•••${String(p.phone).slice(-4)}` : null,
      noShow: await memberNoShow(p.id as string).catch(() => null),
    })),
  )
  return { ok: true, data: out }
}

export async function staffBook(input: {
  typeId: string
  start: string
  resourceId: string | null
  party: number
  memberId: string | null
  guestName: string
  guestPhone: string
  note: string
}): Promise<BkResult<{ id: string }>> {
  const ctx = await team()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!input.memberId && !input.guestName.trim()) return { ok: false, error: 'need_who' }
  const { data, error } = await createAdminClient().rpc('book_slot', {
    p_type_id: input.typeId,
    p_resource_id: input.resourceId,
    p_start: input.start,
    p_party: Math.round(input.party) || 1,
    p_member_id: input.memberId,
    p_guest_name: input.memberId ? null : input.guestName.trim().slice(0, 80),
    p_guest_phone: input.memberId ? null : input.guestPhone.replace(/[^\d+]/g, '').slice(0, 20) || null,
    p_note: input.note.trim().slice(0, 300) || null,
    p_source: 'staff',
    p_created_by: ctx.userId,
  })
  if (error) return { ok: false, error: rpcError(error) }
  const id = data as string
  if (input.memberId) await sendBookingEmail(id, 'booked')
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: { id } }
}

// Move to another time / person: the new place is taken first (so a full
// time can't be lost), then the old booking is cancelled and points at it.
export async function moveBooking(id: string, start: string, resourceId: string | null): Promise<BkResult<{ id: string }>> {
  const ctx = await team()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  const { data: old } = await db.from('bookings').select('*').eq('id', id).maybeSingle()
  if (!old || old.status !== 'booked') return { ok: false, error: 'bad_status' }
  const { data, error } = await db.rpc('book_slot', {
    p_type_id: old.type_id,
    p_resource_id: resourceId,
    p_start: start,
    p_party: old.party,
    p_member_id: old.member_id,
    p_guest_name: old.guest_name,
    p_guest_phone: old.guest_phone,
    p_note: old.note,
    p_source: old.source,
    p_created_by: old.created_by,
    p_ignore: id,
  })
  if (error) return { ok: false, error: rpcError(error) }
  await db.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: ctx.userId, moved_to: data }).eq('id', id)
  if (old.member_id) await sendBookingEmail(data as string, 'moved')
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: { id: data as string } }
}

// Arrived / no-show / cancelled, or back to booked (a mistake).
export async function setBookingStatus(id: string, status: 'arrived' | 'no_show' | 'cancelled' | 'booked'): Promise<BkResult> {
  const ctx = await team()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  const { data: b } = await db.from('bookings').select('status, start_at, member_id, moved_to, type_id, party').eq('id', id).maybeSingle()
  if (!b || b.moved_to) return { ok: false, error: 'bad_status' }
  if (status === b.status) return { ok: true, data: null }
  const now = new Date().toISOString()
  const reset = { arrived_at: null, no_show_at: null, no_show_by: null, cancelled_at: null, cancelled_by: null, late_cancel: false }
  const patch =
    status === 'arrived'
      ? { ...reset, status, arrived_at: now }
      : status === 'no_show'
        ? { ...reset, status, no_show_at: now, no_show_by: ctx.userId }
        : status === 'cancelled'
          ? { ...reset, status, cancelled_at: now, cancelled_by: ctx.userId } // the shop cancelled: never "late"
          : { ...reset, status }
  // Back to "booked" must still fit (someone may have taken the place).
  if (status === 'booked' && (b.status === 'cancelled' || b.status === 'no_show')) {
    const { data: t } = await db.from('booking_types').select('capacity').eq('id', b.type_id).maybeSingle()
    const { data: same } = await db.from('bookings').select('party').eq('type_id', b.type_id).eq('start_at', b.start_at).in('status', ['booked', 'arrived'])
    const used = (same ?? []).reduce((n, x) => n + Number(x.party), 0)
    if (t && used + Number(b.party) > Number(t.capacity)) return { ok: false, error: 'slot_full' }
  }
  const { error } = await db.from('bookings').update(patch).eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  if (status === 'cancelled' && b.member_id && Date.parse(b.start_at as string) > Date.now()) await sendBookingEmail(id, 'cancelled')
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: null }
}

// ---- admin: setup ----

async function admin(): Promise<{ userId: string } | { error: string }> {
  const ctx = await team()
  if ('error' in ctx) return ctx
  return ctx.admin ? { userId: ctx.userId } : { error: 'not_admin' }
}

export type TypeInput = {
  id?: string
  categoryId: string | null
  memberPick: boolean
  arriveOnCheckin: boolean
  nameTh: string
  nameEn: string
  description: string
  durationMin: number
  bufferMin: number
  capacity: number
  stepMin: number
  productId: string | null
  memberBooking: boolean
  advanceDays: number
  minHours: number
  cancelHours: number
  maxParty: number
  active: boolean
  sort: number
  resources: { id?: string; label: string; staffId: string | null; active: boolean }[]
  hours: { weekday: number; start: string; end: string }[]
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

export async function saveBookingType(input: TypeInput): Promise<BkResult<{ id: string }>> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const nameTh = input.nameTh.trim()
  if (
    nameTh.length < 1 ||
    nameTh.length > 60 ||
    input.nameEn.trim().length > 60 ||
    !int(input.durationMin, 10, 720) ||
    !int(input.bufferMin, 0, 120) ||
    !int(input.capacity, 1, 500) ||
    !(STEP_OPTIONS as readonly number[]).includes(input.stepMin) ||
    !int(input.advanceDays, 0, 180) ||
    !num(input.minHours, 0, 72) ||
    !num(input.cancelHours, 0, 168) ||
    !int(input.maxParty, 1, 20) ||
    input.resources.some((r) => !r.label.trim() || r.label.trim().length > 40)
  )
    return { ok: false, error: 'bad_type' }
  if (input.hours.some((h) => !int(h.weekday, 0, 6) || !TIME_RE.test(h.start) || !TIME_RE.test(h.end) || h.end <= h.start)) return { ok: false, error: 'bad_hours' }

  const db = createAdminClient()
  const row = {
    kind: kindFor(input),
    member_pick: Boolean(input.memberPick),
    arrive_on_checkin: Boolean(input.arriveOnCheckin),
    name_th: nameTh,
    ...(input.categoryId !== undefined ? { category_id: input.categoryId || null } : {}),
    name_en: input.nameEn.trim(),
    description: input.description.trim().slice(0, 500) || null,
    duration_min: input.durationMin,
    buffer_min: input.bufferMin,
    capacity: input.capacity,
    step_min: input.stepMin,
    product_id: input.productId || null,
    member_booking: input.memberBooking,
    advance_days: input.advanceDays,
    min_hours: input.minHours,
    cancel_hours: input.cancelHours,
    max_party: input.maxParty,
    is_active: input.active,
    sort: Math.round(input.sort) || 0,
    updated_at: new Date().toISOString(),
  }
  let id = input.id
  // Before §35 there's no category column: save without it.
  const noColumn = (e: { code?: string } | null) => e?.code === 'PGRST204' || e?.code === '42703'
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { category_id: _cat, member_pick: _p, arrive_on_checkin: _a, ...rowNoCat } = row as typeof row & { category_id?: string | null }
  if (id) {
    let { error } = await db.from('booking_types').update(row).eq('id', id)
    if (noColumn(error)) ({ error } = await db.from('booking_types').update(rowNoCat).eq('id', id))
    if (error) return { ok: false, error: rpcError(error) }
  } else {
    let { data, error } = await db.from('booking_types').insert(row).select('id').single()
    if (noColumn(error)) ({ data, error } = await db.from('booking_types').insert(rowNoCat).select('id').single())
    if (error || !data) return { ok: false, error: rpcError(error) }
    id = data.id as string
  }
  // People / rooms: update the kept ones, add new ones; ones removed are
  // turned off (old bookings still point at them).
  const { data: had } = await db.from('booking_resources').select('id').eq('type_id', id)
  const keep = new Set(input.resources.map((r) => r.id).filter(Boolean) as string[])
  for (const [i, r] of input.resources.entries()) {
    const v = { type_id: id, label: r.label.trim(), staff_id: r.staffId || null, is_active: r.active, sort: i }
    if (r.id) await db.from('booking_resources').update(v).eq('id', r.id).eq('type_id', id)
    else await db.from('booking_resources').insert(v)
  }
  const gone = (had ?? []).map((r) => r.id as string).filter((x) => !keep.has(x))
  if (gone.length) {
    const { data: used } = await db.from('bookings').select('resource_id').in('resource_id', gone).limit(1000)
    const usedIds = new Set((used ?? []).map((u) => u.resource_id as string))
    const del = gone.filter((g) => !usedIds.has(g))
    if (del.length) await db.from('booking_resources').delete().in('id', del)
    const off = gone.filter((g) => usedIds.has(g))
    if (off.length) await db.from('booking_resources').update({ is_active: false, sort: 999 }).in('id', off)
  }
  // Hours: replaced as a whole.
  await db.from('booking_hours').delete().eq('type_id', id)
  if (input.hours.length) {
    const { error } = await db.from('booking_hours').insert(input.hours.map((h) => ({ type_id: id, weekday: h.weekday, start_time: h.start, end_time: h.end })))
    if (error) return { ok: false, error: 'bad_hours' }
  }
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: { id: id as string } }
}

export async function deleteBookingType(id: string): Promise<BkResult> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  const { count } = await db.from('bookings').select('id', { count: 'exact', head: true }).eq('type_id', id)
  if ((count ?? 0) > 0) return { ok: false, error: 'in_use' }
  const { error } = await db.from('booking_types').delete().eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: null }
}

export async function saveNoShowRules(r: NoShowRules): Promise<BkResult> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!int(r.lateMin, 0, 240) || !int(r.windowDays, 7, 365) || !num(r.warn, 0, 20) || !num(r.block, 0, 20) || !int(r.blockDays, 1, 365) || !num(r.lateCancelWeight, 0, 1))
    return { ok: false, error: 'bad_type' }
  const { error } = await createAdminClient()
    .from('app_settings')
    .update({
      booking_late_min: r.lateMin,
      noshow_window_days: r.windowDays,
      noshow_warn: r.warn,
      noshow_block: r.block,
      noshow_block_days: r.blockDays,
      late_cancel_weight: r.lateCancelWeight,
    })
    .eq('id', 1)
  if (error) return { ok: false, error: rpcError(error) }
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: null }
}

// Lift a member's pause: no-shows before now stop counting.
export async function pardonMember(memberId: string): Promise<BkResult> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await createAdminClient()
    .from('booking_pardons')
    .upsert({ member_id: memberId, pardoned_at: new Date().toISOString(), pardoned_by: ctx.userId })
  if (error) return { ok: false, error: rpcError(error) }
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: null }
}

export async function bookingDetail(id: string): Promise<BkResult<{ noShow: NoShowStatus | null }>> {
  const ctx = await team()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const b = await getBooking(id)
  if (!b) return { ok: false, error: 'not_yours' }
  return { ok: true, data: { noShow: b.memberId ? await memberNoShow(b.memberId) : null } }
}

// ---- admin: categories (§35, v0.35.1) ----

export async function saveCategory(input: { id?: string; nameTh: string; nameEn: string; description: string; active: boolean }): Promise<BkResult<{ id: string }>> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const nameTh = input.nameTh.trim()
  if (nameTh.length < 1 || nameTh.length > 40 || input.nameEn.trim().length > 40) return { ok: false, error: 'bad_category' }
  const db = createAdminClient()
  const row = { name_th: nameTh, name_en: input.nameEn.trim(), description: input.description.trim().slice(0, 300) || null, is_active: input.active }
  if (input.id) {
    const { error } = await db.from('booking_categories').update(row).eq('id', input.id)
    if (error) return { ok: false, error: rpcError(error) }
    revalidatePath(BOOKINGS_PATH)
    return { ok: true, data: { id: input.id } }
  }
  const { data: last } = await db.from('booking_categories').select('sort').order('sort', { ascending: false }).limit(1)
  const { data, error } = await db
    .from('booking_categories')
    .insert({ ...row, sort: (Number(last?.[0]?.sort) || 0) + 1 })
    .select('id')
    .single()
  if (error) return { ok: false, error: rpcError(error) }
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: { id: data.id as string } }
}

// The whole order at once (ids top to bottom).
export async function orderCategories(ids: string[]): Promise<BkResult> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  for (const [i, id] of ids.slice(0, 100).entries()) await db.from('booking_categories').update({ sort: i + 1 }).eq('id', id)
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: null }
}

// Its items stay, without a category.
export async function deleteCategory(id: string): Promise<BkResult> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  const { data: c } = await db.from('booking_categories').select('image_path').eq('id', id).maybeSingle()
  const { error } = await db.from('booking_categories').delete().eq('id', id)
  if (error) return { ok: false, error: rpcError(error) }
  if (c?.image_path) await db.storage.from(CATEGORY_BUCKET).remove([c.image_path as string])
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: null }
}

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// A picture for a category (the browser has already shrunk it). null file = remove.
export async function setCategoryImage(id: string, form: FormData | null): Promise<BkResult> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  const { data: c } = await db.from('booking_categories').select('image_path').eq('id', id).maybeSingle()
  if (!c) return { ok: false, error: 'bad_category' }
  let path: string | null = null
  const file = form?.get('file')
  if (file) {
    if (!(file instanceof File) || !IMAGE_TYPES[file.type] || file.size > 2 * 1024 * 1024) return { ok: false, error: 'bad_image' }
    path = `categories/${id}-${Date.now()}.${IMAGE_TYPES[file.type]}`
    const { error } = await db.storage.from(CATEGORY_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (error) return { ok: false, error: 'bad_image' }
  }
  const { error } = await db.from('booking_categories').update({ image_path: path }).eq('id', id)
  if (error) return { ok: false, error: rpcError(error) }
  if (c.image_path) await db.storage.from(CATEGORY_BUCKET).remove([c.image_path as string])
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: null }
}

// ---- admin: templates (v0.35.3) ----

export async function saveTemplate(name: string, data: Record<string, unknown>): Promise<BkResult<{ id: string }>> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const n = name.trim()
  if (n.length < 1 || n.length > 40) return { ok: false, error: 'bad_category' }
  // Only the known settings; no ids of people/rooms.
  const clean: Record<string, unknown> = {}
  for (const k of TEMPLATE_KEYS) if (k in data) clean[k] = data[k]
  if (Array.isArray(clean.resources)) clean.resources = (clean.resources as Record<string, unknown>[]).slice(0, 50).map((r) => ({ label: String(r.label ?? '').slice(0, 40), staffId: r.staffId ?? null, active: true }))
  if (JSON.stringify(clean).length > 15000) return { ok: false, error: 'bad_type' }
  const { data: row, error } = await createAdminClient().from('booking_templates').insert({ name: n, data: clean, created_by: ctx.userId }).select('id').single()
  if (error) return { ok: false, error: rpcError(error) }
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: { id: row.id as string } }
}

export async function deleteTemplate(id: string): Promise<BkResult> {
  const ctx = await admin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await createAdminClient().from('booking_templates').delete().eq('id', id)
  if (error) return { ok: false, error: rpcError(error) }
  revalidatePath(BOOKINGS_PATH)
  return { ok: true, data: null }
}
