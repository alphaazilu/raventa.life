'use server'

import { isMissingTable, requireAdmin } from '@/lib/console/guard'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIME_PATH } from '@/lib/auth/roles'

// Admin: shift templates, the weekly roster and the late/OT rules (§17).

export type ShiftResult = { ok: true } | { ok: false; error: string }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const missing = isMissingTable

export async function saveTemplate(input: {
  id?: string
  name: string
  start: string
  end: string
  breakMinutes: number
  active: boolean
}): Promise<ShiftResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const name = input.name.trim()
  if (!name || name.length > 40) return { ok: false, error: 'need_name' }
  if (!TIME_RE.test(input.start) || !TIME_RE.test(input.end)) return { ok: false, error: 'bad_time' }
  if (input.start === input.end) return { ok: false, error: 'same_time' }
  const breakMinutes = Math.round(Number(input.breakMinutes) || 0)
  if (breakMinutes < 0 || breakMinutes > 240) return { ok: false, error: 'bad_break' }

  const row = { name, start_time: input.start, end_time: input.end, break_minutes: breakMinutes, is_active: input.active }
  const admin = createAdminClient()
  const { error } = input.id
    ? await admin.from('shift_templates').update(row).eq('id', input.id)
    : await admin.from('shift_templates').insert(row)
  if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  revalidatePath(TIME_PATH)
  return { ok: true }
}

export async function saveTimeSettings(lateGraceMinutes: number, otMinMinutes: number): Promise<ShiftResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const grace = Math.round(Number(lateGraceMinutes))
  const ot = Math.round(Number(otMinMinutes))
  if (!(grace >= 0 && grace <= 120) || !(ot >= 0 && ot <= 240)) return { ok: false, error: 'bad_rule' }
  const { error } = await createAdminClient()
    .from('time_settings')
    .upsert({ id: 1, late_grace_minutes: grace, ot_min_minutes: ot, updated_by: ctx.userId, updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  revalidatePath(TIME_PATH)
  return { ok: true }
}

// value: a template id, 'off' (day off) or '' (nothing planned).
export async function setAssignment(staffId: string, date: string, value: string): Promise<ShiftResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!DATE_RE.test(date)) return { ok: false, error: 'bad_time' }
  const admin = createAdminClient()
  if (!value) {
    const { error } = await admin.from('shift_assignments').delete().eq('staff_id', staffId).eq('work_date', date)
    if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  } else {
    const { error } = await admin.from('shift_assignments').upsert(
      {
        staff_id: staffId,
        work_date: date,
        template_id: value === 'off' ? null : value,
        day_off: value === 'off',
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'staff_id,work_date' },
    )
    if (error) return { ok: false, error: missing(error) ? 'not_set_up' : 'failed' }
  }
  revalidatePath(TIME_PATH)
  return { ok: true }
}

// Copy last week's roster onto this week (only days still empty).
export async function copyPreviousWeek(weekStart: string): Promise<ShiftResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!DATE_RE.test(weekStart)) return { ok: false, error: 'bad_time' }
  const shift = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const admin = createAdminClient()
  const [{ data: prev, error: e1 }, { data: cur, error: e2 }] = await Promise.all([
    admin.from('shift_assignments').select('staff_id, work_date, template_id, day_off').gte('work_date', shift(weekStart, -7)).lt('work_date', weekStart),
    admin.from('shift_assignments').select('staff_id, work_date').gte('work_date', weekStart).lt('work_date', shift(weekStart, 7)),
  ])
  if (e1 || e2) return { ok: false, error: missing(e1 ?? e2) ? 'not_set_up' : 'failed' }
  const taken = new Set((cur ?? []).map((r) => `${r.staff_id}|${r.work_date}`))
  const rows = (prev ?? [])
    .map((r) => ({ ...r, work_date: shift(r.work_date as string, 7) }))
    .filter((r) => !taken.has(`${r.staff_id}|${r.work_date}`))
    .map((r) => ({ ...r, updated_by: ctx.userId, updated_at: new Date().toISOString() }))
  if (rows.length === 0) return { ok: false, error: 'nothing_to_copy' }
  const { error } = await admin.from('shift_assignments').insert(rows)
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(TIME_PATH)
  return { ok: true }
}
