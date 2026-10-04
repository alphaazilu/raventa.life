'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyMemberQrToken } from '@/lib/member-card'
import { getCurrentDevice } from '@/lib/console/device'
import { addDays, getOpenEntry, minutesOf } from '@/lib/console/time'
import { entryStats, getTimeSettings, listAssignments, listTemplates, pickAssignment } from '@/lib/console/shifts'
import { bangkokToday } from '@/lib/check-in/day'

// Tablet lock screen › "Clock in/out" (v0.21): scan your member card to
// clock in or out WITHOUT opening the tablet. Not clocked in → clock in.
// Clocked in → ask first (confirmOut=false), then clock out (confirmOut=true).

export type ClockShift = { name: string; start: string; end: string } | null

export type ClockResult =
  | {
      ok: true
      kind: 'in' | 'confirm' | 'out' | 'just_in'
      name: string
      at: string
      clockIn: string
      workedMinutes: number
      paidMinutes: number
      lateMinutes: number
      otMinutes: number
      shift: ClockShift
    }
  | { ok: false; error: string }

const JUST_IN_MS = 5 * 60 * 1000

async function shiftFor(staffId: string, date: string, at = new Date().toISOString()) {
  const [templates, assignments, rules] = await Promise.all([
    listTemplates().catch(() => []),
    listAssignments(date, addDays(date, 1), staffId).catch(() => []),
    getTimeSettings(),
  ])
  // Several shifts a day (v0.26): the one starting nearest to now.
  const tmap = new Map(templates.map((t) => [t.id, t]))
  const a = assignments.filter((x) => x.date === date)
  const near = pickAssignment(a, at, date, tmap)
  const t = near?.templateId ? tmap.get(near.templateId) : undefined
  return { a, tmap, rules, shift: t ? { name: t.name, start: t.start, end: t.end } : null }
}

export async function clockByCard(rawToken: string, confirmOut: boolean): Promise<ClockResult> {
  const device = await getCurrentDevice().catch(() => null)
  if (!device) return { ok: false, error: 'not_device' }
  const check = verifyMemberQrToken(rawToken)
  if (!check.ok) return { ok: false, error: check.reason === 'expired' ? 'qr_expired' : 'qr_invalid' }

  const admin = createAdminClient()
  const { data: p } = await admin.from('profiles').select('role, first_name, last_name, email').eq('id', check.userId).maybeSingle()
  if (p?.role === 'admin') return { ok: false, error: 'admin_no_clock' }
  if (p?.role !== 'staff') return { ok: false, error: 'not_staff' }
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—'
  const now = new Date().toISOString()
  const today = bangkokToday()

  const open = await getOpenEntry(check.userId)

  if (!open) {
    const { error } = await admin.from('time_entries').insert({ staff_id: check.userId, clock_in: now, device_id: device.id, in_method: 'card' })
    if (error && error.code !== '23505') {
      console.error('clockByCard in failed', error)
      return { ok: false, error: 'failed' }
    }
    await admin.from('staff_actions').insert({ actor_id: check.userId, action: 'clock_in', detail: { device_id: device.id, device: device.name, via: 'lock_screen' } })
    const s = await shiftFor(check.userId, today)
    const st = entryStats({ clockIn: now, clockOut: null }, 0, today, s.a, s.tmap, s.rules)
    return { ok: true, kind: 'in', name, at: now, clockIn: now, workedMinutes: 0, paidMinutes: 0, lateMinutes: st.lateMinutes, otMinutes: 0, shift: s.shift }
  }

  const inDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(open.clockIn))
  const s = await shiftFor(check.userId, inDate, open.clockIn)

  if (!confirmOut) {
    const worked = minutesOf(open)
    const kind = Date.now() - Date.parse(open.clockIn) < JUST_IN_MS ? 'just_in' : 'confirm'
    return { ok: true, kind, name, at: now, clockIn: open.clockIn, workedMinutes: worked, paidMinutes: 0, lateMinutes: 0, otMinutes: 0, shift: s.shift }
  }

  // Clock out ('card'; falls back to 'button' until schema §20 is run).
  let { error } = await admin.from('time_entries').update({ clock_out: now, out_method: 'card' }).eq('id', open.id).is('clock_out', null)
  if (error?.code === '23514') ({ error } = await admin.from('time_entries').update({ clock_out: now, out_method: 'button' }).eq('id', open.id).is('clock_out', null))
  if (error) {
    console.error('clockByCard out failed', error)
    return { ok: false, error: 'failed' }
  }
  await admin.from('staff_actions').insert({ actor_id: check.userId, action: 'clock_out', detail: { device_id: device.id, device: device.name, entry_id: open.id, via: 'lock_screen' } })
  const closed = { clockIn: open.clockIn, clockOut: now }
  const worked = minutesOf(closed)
  const st = entryStats(closed, worked, inDate, s.a, s.tmap, s.rules)
  return { ok: true, kind: 'out', name, at: now, clockIn: open.clockIn, workedMinutes: worked, paidMinutes: st.paidMinutes, lateMinutes: 0, otMinutes: st.otMinutes, shift: s.shift }
}
