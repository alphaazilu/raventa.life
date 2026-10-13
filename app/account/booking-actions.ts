'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { bangkokToday } from '@/lib/check-in/day'
import { listTypes, memberNoShow, sendBookingEmail, slotsFor } from '@/lib/console/booking'
import { addDays, type Slot } from '@/lib/booking'
import { MY_BOOKINGS_PATH } from '@/lib/auth/roles'

// A member books / cancels for themselves (§34, v0.35). Everything is
// checked again here: the type is open to members, the day is in range,
// the time is far enough ahead, the member isn't paused for no-shows and
// has nothing else at that time. book_slot() takes the place safely.

export type MemberBookResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

async function bookableType(typeId: string) {
  const types = await listTypes(true)
  if (!types) return { error: 'not_set_up' as const }
  const t = types.find((x) => x.id === typeId && x.memberBooking)
  return t ? { t } : { error: 'not_bookable' as const }
}

export async function memberSlots(typeId: string, day: string): Promise<MemberBookResult<{ slots: Slot[]; closed: boolean }>> {
  if (!(await me())) return { ok: false, error: 'not_signed_in' }
  if (!DAY_RE.test(day)) return { ok: false, error: 'bad_booking' }
  const r = await bookableType(typeId)
  if ('error' in r) return { ok: false, error: r.error as string }
  const today = bangkokToday()
  if (day < today) return { ok: false, error: 'too_soon' }
  if (day > addDays(today, r.t.advanceDays)) return { ok: false, error: 'too_far' }
  return { ok: true, data: await slotsFor(r.t, day, 'member') }
}

export async function memberBook(input: { typeId: string; start: string; resourceId: string | null; party: number; note: string }): Promise<MemberBookResult<{ id: string }>> {
  const userId = await me()
  if (!userId) return { ok: false, error: 'not_signed_in' }
  const r = await bookableType(input.typeId)
  if ('error' in r) return { ok: false, error: r.error as string }
  const t = r.t
  const start = Date.parse(input.start)
  if (!Number.isFinite(start)) return { ok: false, error: 'bad_booking' }
  if (start < Date.now() + t.minHours * 3_600_000) return { ok: false, error: 'too_soon' }
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(start))
  if (day > addDays(bangkokToday(), t.advanceDays)) return { ok: false, error: 'too_far' }
  // The time must be one the type offers that day.
  const { slots, closed } = await slotsFor(t, day, 'member')
  if (closed) return { ok: false, error: 'closed' }
  const slot = slots.find((s) => Date.parse(s.start) === start)
  if (!slot) return { ok: false, error: 'bad_booking' }
  const party = Math.min(t.maxParty, Math.max(1, Math.round(input.party) || 1))
  if (slot.left < party) return { ok: false, error: 'slot_full' }

  const ns = await memberNoShow(userId)
  if (ns?.level === 'blocked') return { ok: false, error: 'blocked' }

  const db = createAdminClient()
  const end = new Date(start + t.durationMin * 60_000).toISOString()
  const { data: clash } = await db
    .from('bookings')
    .select('id')
    .eq('member_id', userId)
    .eq('status', 'booked')
    .lt('start_at', end)
    .gt('end_at', new Date(start).toISOString())
    .limit(1)
  if (clash?.length) return { ok: false, error: 'overlap' }

  const { data, error } = await db.rpc('book_slot', {
    p_type_id: t.id,
    p_resource_id: input.resourceId,
    p_start: new Date(start).toISOString(),
    p_party: party,
    p_member_id: userId,
    p_guest_name: null,
    p_guest_phone: null,
    p_note: input.note.trim().slice(0, 300) || null,
    p_source: 'member',
    p_created_by: userId,
  })
  if (error) {
    if (isMissingTable(error)) return { ok: false, error: 'not_set_up' }
    return { ok: false, error: /slot_full/.test(error.message ?? '') ? 'slot_full' : 'failed' }
  }
  await sendBookingEmail(data as string, 'booked')
  revalidatePath(MY_BOOKINGS_PATH)
  revalidatePath('/account')
  return { ok: true, data: { id: data as string } }
}

// Cancel one of my bookings. Inside the type's cancel window it counts as a
// late cancel (for the no-show rules) — the screen says so before asking.
export async function memberCancel(id: string): Promise<MemberBookResult<{ late: boolean }>> {
  const userId = await me()
  if (!userId) return { ok: false, error: 'not_signed_in' }
  const db = createAdminClient()
  const { data: b } = await db.from('bookings').select('id, member_id, status, start_at, type_id').eq('id', id).maybeSingle()
  if (!b || b.member_id !== userId) return { ok: false, error: 'not_yours' }
  if (b.status !== 'booked' || Date.parse(b.start_at as string) <= Date.now()) return { ok: false, error: 'bad_status' }
  const { data: t } = await db.from('booking_types').select('cancel_hours').eq('id', b.type_id).maybeSingle()
  const late = Date.now() > Date.parse(b.start_at as string) - Number(t?.cancel_hours ?? 0) * 3_600_000
  const { error } = await db
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: userId, late_cancel: late })
    .eq('id', id)
    .eq('status', 'booked')
  if (error) return { ok: false, error: 'failed' }
  await sendBookingEmail(id, 'cancelled')
  revalidatePath(MY_BOOKINGS_PATH)
  revalidatePath('/account')
  return { ok: true, data: { late } }
}
