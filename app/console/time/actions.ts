'use server'

import { requireAdmin } from '@/lib/console/guard'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConsoleSession } from '@/lib/console/session'
import { getCurrentDevice } from '@/lib/console/device'
import { bangkokLocalToIso, getOpenEntry } from '@/lib/console/time'
import { CONSOLE_PATH, TIME_PATH } from '@/lib/auth/roles'

export type TimeResult = { ok: true } | { ok: false; error: string }

// "ออกงาน" on the counter tablet: close my open entry, then lock the tablet
// for the next person.
export async function clockOut(): Promise<TimeResult> {
  const { supabase, user } = await getConsoleSession()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const device = await getCurrentDevice().catch(() => null)
  if (!device) return { ok: false, error: 'not_device' }
  const open = await getOpenEntry(user.id)
  if (!open) return { ok: false, error: 'not_clocked_in' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('time_entries')
    .update({ clock_out: new Date().toISOString(), out_method: 'button' })
    .eq('id', open.id)
    .is('clock_out', null)
  if (error) {
    console.error('clockOut failed', error)
    return { ok: false, error: 'failed' }
  }
  await admin.from('staff_actions').insert({
    actor_id: user.id,
    action: 'clock_out',
    detail: { device_id: device.id, device: device.name, entry_id: open.id },
  })
  await supabase.auth.signOut({ scope: 'local' })
  redirect(CONSOLE_PATH)
}

function parseTimes(inLocal: string, outLocal: string): { inIso: string; outIso: string | null } | { error: string } {
  const inIso = bangkokLocalToIso(inLocal)
  if (!inIso) return { error: 'bad_time' }
  const outIso = outLocal ? bangkokLocalToIso(outLocal) : null
  if (outLocal && !outIso) return { error: 'bad_time' }
  if (outIso && Date.parse(outIso) <= Date.parse(inIso)) return { error: 'out_before_in' }
  if (Date.parse(inIso) > Date.now() + 5 * 60000 || (outIso && Date.parse(outIso) > Date.now() + 5 * 60000)) {
    return { error: 'in_future' }
  }
  if (outIso && Date.parse(outIso) - Date.parse(inIso) > 24 * 3600 * 1000) return { error: 'too_long' }
  return { inIso, outIso }
}

// Admin: correct an entry. The old times and the reason are kept.
export async function editEntry(entryId: string, inLocal: string, outLocal: string, reason: string): Promise<TimeResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const why = reason.trim()
  if (why.length < 3) return { ok: false, error: 'need_reason' }
  const t = parseTimes(inLocal, outLocal)
  if ('error' in t) return { ok: false, error: t.error }

  const admin = createAdminClient()
  const { data: before } = await admin.from('time_entries').select('id, clock_in, clock_out').eq('id', entryId).maybeSingle()
  if (!before) return { ok: false, error: 'not_found' }

  const { error } = await admin
    .from('time_entries')
    .update({
      clock_in: t.inIso,
      clock_out: t.outIso,
      out_method: t.outIso ? (before.clock_out ? undefined : 'admin') : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId)
  if (error) return { ok: false, error: error.code === '23505' ? 'already_open' : 'failed' }

  await admin.from('time_entry_edits').insert({
    entry_id: entryId,
    editor_id: ctx.userId,
    old_clock_in: before.clock_in,
    old_clock_out: before.clock_out,
    new_clock_in: t.inIso,
    new_clock_out: t.outIso,
    reason: why,
  })
  revalidatePath(TIME_PATH)
  return { ok: true }
}

// Admin: add a missing entry (someone forgot to scan in).
export async function addEntry(staffId: string, inLocal: string, outLocal: string, reason: string): Promise<TimeResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const why = reason.trim()
  if (why.length < 3) return { ok: false, error: 'need_reason' }
  if (!outLocal) return { ok: false, error: 'need_out' }
  const t = parseTimes(inLocal, outLocal)
  if ('error' in t) return { ok: false, error: t.error }

  const admin = createAdminClient()
  const { data: staff } = await admin.from('profiles').select('role').eq('id', staffId).maybeSingle()
  if (!staff || !['staff', 'admin'].includes(staff.role as string)) return { ok: false, error: 'not_staff' }

  const now = new Date().toISOString()
  const { data: row, error } = await admin
    .from('time_entries')
    .insert({ staff_id: staffId, clock_in: t.inIso, clock_out: t.outIso, in_method: 'admin', out_method: 'admin', created_at: now, updated_at: now })
    .select('id')
    .single()
  if (error || !row) return { ok: false, error: 'failed' }

  await admin.from('time_entry_edits').insert({
    entry_id: row.id,
    editor_id: ctx.userId,
    old_clock_in: null,
    old_clock_out: null,
    new_clock_in: t.inIso,
    new_clock_out: t.outIso,
    reason: why,
  })
  revalidatePath(TIME_PATH)
  return { ok: true }
}

// Admin: clock someone out from "Working now" (v0.28) — they left without
// pressing the button, or forgot. Kept like an edit: who, the time, why.
export async function adminClockOut(entryId: string, outLocal: string, reason: string): Promise<TimeResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const why = reason.trim()
  if (why.length < 3) return { ok: false, error: 'need_reason' }
  const outIso = bangkokLocalToIso(outLocal)
  if (!outIso) return { ok: false, error: outLocal ? 'bad_time' : 'need_out' }

  const admin = createAdminClient()
  const { data: before } = await admin.from('time_entries').select('id, clock_in, clock_out').eq('id', entryId).maybeSingle()
  if (!before) return { ok: false, error: 'not_found' }
  if (before.clock_out) return { ok: false, error: 'already_out' }
  const t = parseTimes(isoLocal(before.clock_in), outLocal)
  if ('error' in t) return { ok: false, error: t.error }

  const { data: done, error } = await admin
    .from('time_entries')
    .update({ clock_out: t.outIso, out_method: 'admin', updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .is('clock_out', null)
    .select('id')
  if (error) return { ok: false, error: 'failed' }
  if (!done?.length) return { ok: false, error: 'already_out' }

  await admin.from('time_entry_edits').insert({
    entry_id: entryId,
    editor_id: ctx.userId,
    old_clock_in: before.clock_in,
    old_clock_out: null,
    new_clock_in: before.clock_in,
    new_clock_out: t.outIso,
    reason: why,
  })
  revalidatePath(TIME_PATH)
  return { ok: true }
}

// ISO instant → "YYYY-MM-DDTHH:MM" Bangkok (parseTimes takes local times).
function isoLocal(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600 * 1000).toISOString().slice(0, 16)
}
