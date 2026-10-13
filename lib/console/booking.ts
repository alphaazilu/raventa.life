import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { bangkokToday } from '@/lib/check-in/day'
import { listItems } from '@/lib/console/calendar'
import { occurrences } from '@/lib/calendar'
import { getResendClient } from '@/lib/resend'
import { bookingEmail } from '@/lib/email-templates'
import {
  addDays,
  bkkHm,
  daySlots,
  DEFAULT_NOSHOW_RULES,
  noShowStatus,
  toMin,
  type Booking,
  type BookingKind,
  type BookingStatus,
  type BookingType,
  type Closed,
  type NoShowRules,
  type NoShowStatus,
  type Slot,
} from '@/lib/booking'

// Bookings (§34, v0.35). SERVER ONLY (service role). Callers check who is asking.

const db = () => createAdminClient()

const nameOf = (p: { first_name?: unknown; last_name?: unknown; email?: unknown }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—'

// ---- types ----

// All types with their people/rooms and hours. null = §34 not run.
export async function listTypes(onlyActive = false): Promise<BookingType[] | null> {
  const [t, r, h] = await Promise.all([
    db().from('booking_types').select('*').order('sort').order('name_th'),
    db().from('booking_resources').select('*').order('sort'),
    db().from('booking_hours').select('type_id, weekday, start_time, end_time').order('weekday').order('start_time'),
  ])
  const err = t.error ?? r.error ?? h.error
  if (err) {
    if (isMissingTable(err)) return null
    throw err
  }
  return (t.data ?? [])
    .filter((x) => !onlyActive || x.is_active)
    .map((x) => ({
      id: x.id as string,
      kind: x.kind as BookingKind,
      nameTh: x.name_th as string,
      nameEn: (x.name_en as string) || '',
      description: (x.description as string | null) || null,
      durationMin: Number(x.duration_min),
      bufferMin: Number(x.buffer_min),
      capacity: Number(x.capacity),
      stepMin: Number(x.step_min),
      productId: (x.product_id as string | null) ?? null,
      memberBooking: Boolean(x.member_booking),
      advanceDays: Number(x.advance_days),
      minHours: Number(x.min_hours),
      cancelHours: Number(x.cancel_hours),
      maxParty: Number(x.max_party),
      active: Boolean(x.is_active),
      sort: Number(x.sort),
      resources: (r.data ?? [])
        .filter((y) => y.type_id === x.id)
        .map((y) => ({ id: y.id as string, label: y.label as string, staffId: (y.staff_id as string | null) ?? null, active: Boolean(y.is_active), sort: Number(y.sort) })),
      hours: (h.data ?? [])
        .filter((y) => y.type_id === x.id)
        .map((y) => ({ weekday: Number(y.weekday), start: (y.start_time as string).slice(0, 5), end: (y.end_time as string).slice(0, 5) })),
    }))
}

export async function getRules(): Promise<NoShowRules> {
  const { data } = await db().from('app_settings').select('*').eq('id', 1).maybeSingle()
  if (!data || !('noshow_block' in data)) return DEFAULT_NOSHOW_RULES
  return {
    lateMin: Number(data.booking_late_min),
    windowDays: Number(data.noshow_window_days),
    warn: Number(data.noshow_warn),
    block: Number(data.noshow_block),
    blockDays: Number(data.noshow_block_days),
    lateCancelWeight: Number(data.late_cancel_weight),
  }
}

// ---- bookings ----

// Bookings still "booked" from an earlier day become no-shows (the day is
// over). Run lazily whenever bookings are read — there's no nightly job.
export async function sweepNoShows(): Promise<void> {
  await db()
    .from('bookings')
    .update({ status: 'no_show', no_show_at: new Date().toISOString() })
    .eq('status', 'booked')
    .lt('day', bangkokToday())
    .then(
      () => undefined,
      () => undefined,
    )
}

type Row = Record<string, unknown>

async function toBookings(rows: Row[]): Promise<Booking[]> {
  if (!rows.length) return []
  const typeIds = [...new Set(rows.map((r) => r.type_id as string))]
  const resIds = [...new Set(rows.map((r) => r.resource_id).filter(Boolean) as string[])]
  const people = [...new Set(rows.flatMap((r) => [r.member_id, r.created_by]).filter(Boolean) as string[])]
  const [t, rs, p] = await Promise.all([
    db().from('booking_types').select('id, kind, name_th, name_en, product_id').in('id', typeIds),
    resIds.length ? db().from('booking_resources').select('id, label').in('id', resIds) : Promise.resolve({ data: [] as Row[] }),
    people.length ? db().from('profiles').select('id, first_name, last_name, email, member_no').in('id', people) : Promise.resolve({ data: [] as Row[] }),
  ])
  const types = new Map((t.data ?? []).map((x) => [x.id as string, x]))
  const res = new Map((rs.data ?? []).map((x) => [x.id as string, x.label as string]))
  const prof = new Map((p.data ?? []).map((x) => [x.id as string, x]))
  return rows.map((r) => {
    const ty = types.get(r.type_id as string)
    const m = r.member_id ? prof.get(r.member_id as string) : undefined
    const c = r.created_by ? prof.get(r.created_by as string) : undefined
    return {
      id: r.id as string,
      typeId: r.type_id as string,
      typeName: { th: (ty?.name_th as string) ?? '—', en: ((ty?.name_en as string) || (ty?.name_th as string)) ?? '—' },
      kind: ((ty?.kind as BookingKind) ?? 'service') as BookingKind,
      productId: (ty?.product_id as string | null) ?? null,
      resourceId: (r.resource_id as string | null) ?? null,
      resourceLabel: r.resource_id ? (res.get(r.resource_id as string) ?? null) : null,
      day: r.day as string,
      start: r.start_at as string,
      end: r.end_at as string,
      memberId: (r.member_id as string | null) ?? null,
      memberName: m ? nameOf(m) : null,
      memberNo: m ? ((m.member_no as string | null) ?? null) : null,
      guestName: (r.guest_name as string | null) ?? null,
      guestPhone: (r.guest_phone as string | null) ?? null,
      party: Number(r.party),
      status: r.status as BookingStatus,
      source: r.source as 'member' | 'staff',
      note: (r.note as string | null) ?? null,
      createdAt: r.created_at as string,
      createdByName: c ? nameOf(c) : null,
      lateCancel: Boolean(r.late_cancel),
      movedTo: (r.moved_to as string | null) ?? null,
      arrivedAt: (r.arrived_at as string | null) ?? null,
      noShowAt: (r.no_show_at as string | null) ?? null,
      noShowAuto: r.status === 'no_show' && !r.no_show_by,
    }
  })
}

export async function listBookings(from: string, to: string, opts: { memberId?: string; typeId?: string; limit?: number } = {}): Promise<Booking[] | null> {
  await sweepNoShows()
  let q = db().from('bookings').select('*').gte('day', from).lte('day', to).order('start_at').limit(opts.limit ?? 2000)
  if (opts.memberId) q = q.eq('member_id', opts.memberId)
  if (opts.typeId) q = q.eq('type_id', opts.typeId)
  const { data, error } = await q
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  return toBookings((data ?? []) as Row[])
}

export async function getBooking(id: string): Promise<Booking | null> {
  const { data } = await db().from('bookings').select('*').eq('id', id).maybeSingle()
  return data ? (await toBookings([data as Row]))[0] : null
}

// A member's bookings: coming up (booked, today on) and the latest past ones.
export async function memberBookings(memberId: string): Promise<{ upcoming: Booking[]; past: Booking[] } | null> {
  await sweepNoShows()
  const today = bangkokToday()
  const [{ data: up, error }, { data: past }] = await Promise.all([
    db().from('bookings').select('*').eq('member_id', memberId).gte('day', today).eq('status', 'booked').order('start_at').limit(50),
    db().from('bookings').select('*').eq('member_id', memberId).or(`day.lt.${today},status.neq.booked`).order('start_at', { ascending: false }).limit(20),
  ])
  if (error) {
    if (isMissingTable(error)) return null
    return null
  }
  return { upcoming: await toBookings((up ?? []) as Row[]), past: await toBookings((past ?? []) as Row[]) }
}

// ---- closed days (calendar) ----

export async function closedOn(day: string): Promise<Closed> {
  const items = await listItems(day, day).catch(() => null)
  const out: Closed = { all: false, ranges: [] }
  for (const it of items ?? []) {
    if (it.kind !== 'closed') continue
    for (const o of occurrences(it, day, day)) {
      if (o.start > day || o.end < day) continue
      // Times only bite on the first and last day of a multi-day item.
      const s = o.start === day && it.startTime ? toMin(it.startTime) : 0
      const e = o.end === day && it.endTime ? toMin(it.endTime) : 24 * 60
      if (s <= 0 && e >= 24 * 60) out.all = true
      else out.ranges.push([s, e])
    }
  }
  return out
}

// ---- availability ----

export async function slotsFor(type: BookingType, day: string, who: 'member' | 'staff', ignore?: string): Promise<{ slots: Slot[]; closed: boolean }> {
  const closed = await closedOn(day)
  if (closed.all) return { slots: [], closed: true }
  const { data } = await db()
    .from('bookings')
    .select('*')
    .eq('type_id', type.id)
    .in('status', ['booked', 'arrived'])
    .gte('day', addDays(day, -1))
    .lte('day', addDays(day, 1))
  const taken = await toBookings((data ?? []) as Row[])
  // Members: at least min_hours ahead. Staff: anything not over yet.
  const notBefore = who === 'member' ? Date.now() + type.minHours * 3_600_000 : Date.now() - type.durationMin * 60_000
  return { slots: daySlots(type, day, taken, closed, notBefore, ignore), closed: false }
}

// ---- no-shows ----

export async function memberNoShow(memberId: string, rules?: NoShowRules): Promise<NoShowStatus | null> {
  const r = rules ?? (await getRules())
  const today = bangkokToday()
  const since = `${addDays(today, -r.windowDays)}`
  const [{ data, error }, { data: pardon }] = await Promise.all([
    db().from('bookings').select('status, late_cancel, start_at, no_show_at, cancelled_at').eq('member_id', memberId).gte('day', since).or('status.eq.no_show,late_cancel.eq.true'),
    db().from('booking_pardons').select('pardoned_at').eq('member_id', memberId).maybeSingle(),
  ])
  if (error) return null
  const incidents = (data ?? []).map((b) =>
    b.status === 'no_show'
      ? { at: b.start_at as string, kind: 'no_show' as const }
      : { at: (b.cancelled_at as string) ?? (b.start_at as string), kind: 'late_cancel' as const },
  )
  return noShowStatus(incidents, r, today, (pardon?.pardoned_at as string | undefined) ?? null)
}

// ---- email ----

export async function sendBookingEmail(bookingId: string, kind: 'booked' | 'cancelled' | 'moved'): Promise<void> {
  try {
    const from = process.env.EMAIL_FROM_ADDRESS
    if (!from) return
    const b = await getBooking(bookingId)
    if (!b?.memberId) return
    const { data: p } = await db().from('profiles').select('email, first_name').eq('id', b.memberId).maybeSingle()
    const to = p?.email as string | undefined
    if (!to) return
    const { data: t } = await db().from('booking_types').select('duration_min, cancel_hours').eq('id', b.typeId).maybeSingle()
    const cancelBy = t ? new Date(Date.parse(b.start) - Number(t.cancel_hours) * 3_600_000).toISOString() : null
    const site = process.env.SITE_URL ?? 'https://www.raventawellness.com'
    const { subject, html } = bookingEmail({
      kind,
      firstName: (p?.first_name as string | null) ?? null,
      what: b.typeName.th,
      day: b.day,
      time: `${bkkHm(b.start)}–${bkkHm(b.end)}`,
      withWhom: b.resourceLabel,
      party: b.party,
      cancelBy: cancelBy ? `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(cancelBy))} ${bkkHm(cancelBy)}` : null,
      url: `${site}/account/bookings`,
    })
    await getResendClient().emails.send({ from, to, subject, html })
  } catch (err) {
    console.error('booking email failed', (err as Error).message)
  }
}

// ---- dashboard / desk ----

export async function todayCounts(lateMin: number): Promise<{ total: number; late: number } | null> {
  const { data, error } = await db().from('bookings').select('status, start_at').eq('day', bangkokToday()).in('status', ['booked', 'arrived'])
  if (error) return null
  const now = Date.now()
  return {
    total: (data ?? []).length,
    late: (data ?? []).filter((b) => b.status === 'booked' && now > Date.parse(b.start_at as string) + lateMin * 60_000).length,
  }
}

// Desk: today's bookings of one member, still to come or arrived.
export async function memberToday(memberId: string): Promise<Booking[]> {
  try {
    const { data, error } = await db().from('bookings').select('*').eq('member_id', memberId).eq('day', bangkokToday()).in('status', ['booked', 'arrived']).order('start_at')
    if (error) return []
    return toBookings((data ?? []) as Row[])
  } catch {
    return []
  }
}

// After a bill is paid: the member's bookings today that came with it are "arrived".
export async function markArrived(memberId: string, ids: string[], saleId: string | null, entryToo: boolean): Promise<void> {
  try {
    const today = bangkokToday()
    const list = await memberToday(memberId)
    const pick = list.filter((b) => b.status === 'booked' && (ids.includes(b.id) || (entryToo && b.kind === 'entry')))
    if (!pick.length) return
    await db()
      .from('bookings')
      .update({ status: 'arrived', arrived_at: new Date().toISOString(), sale_id: saleId })
      .in('id', pick.map((b) => b.id))
      .eq('day', today)
      .eq('status', 'booked')
  } catch (err) {
    console.error('booking arrive failed', (err as Error).message)
  }
}

// Summary for a period (admin).
export type BookingStats = {
  total: number
  arrived: number
  noShow: number
  cancelled: number
  lateCancel: number
  self: number
  byType: { name: { th: string; en: string }; total: number; arrived: number; noShow: number; cancelled: number }[]
  top: { memberId: string; name: string; memberNo: string | null; noShows: number }[]
}

export async function bookingStats(from: string, to: string): Promise<BookingStats | null> {
  const list = await listBookings(from, to, { limit: 10_000 })
  if (!list) return null
  const real = list.filter((b) => !b.movedTo)
  const by = new Map<string, BookingStats['byType'][number]>()
  const top = new Map<string, BookingStats['top'][number]>()
  for (const b of real) {
    const t = by.get(b.typeId) ?? { name: b.typeName, total: 0, arrived: 0, noShow: 0, cancelled: 0 }
    t.total += 1
    if (b.status === 'arrived') t.arrived += 1
    if (b.status === 'no_show') t.noShow += 1
    if (b.status === 'cancelled') t.cancelled += 1
    by.set(b.typeId, t)
    if (b.status === 'no_show' && b.memberId) {
      const x = top.get(b.memberId) ?? { memberId: b.memberId, name: b.memberName ?? '—', memberNo: b.memberNo, noShows: 0 }
      x.noShows += 1
      top.set(b.memberId, x)
    }
  }
  return {
    total: real.length,
    arrived: real.filter((b) => b.status === 'arrived').length,
    noShow: real.filter((b) => b.status === 'no_show').length,
    cancelled: real.filter((b) => b.status === 'cancelled').length,
    lateCancel: real.filter((b) => b.lateCancel).length,
    self: real.filter((b) => b.source === 'member').length,
    byType: [...by.values()].sort((a, b) => b.total - a.total),
    top: [...top.values()].filter((x) => x.noShows > 1).sort((a, b) => b.noShows - a.noShows).slice(0, 10),
  }
}
