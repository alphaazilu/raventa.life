'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { isMissingTable } from '@/lib/console/db-errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { SETTINGS_PATH } from '@/lib/auth/roles'
import { LEAVE_KINDS, type LeaveRules } from '@/lib/leave'
import type { PayCycleRules } from '@/lib/console/pay-cycle'

// Admin: Back Office › Settings (§19). Service role after an admin check;
// each change is logged in staff_actions.

export type SettingsResult = { ok: true } | { ok: false; error: string }

const fail = (error: { code?: string } | null): SettingsResult => ({ ok: false, error: isMissingTable(error) ? 'not_set_up' : 'failed' })

export async function saveAccessSettings(input: {
  staffDeskOnPhone: boolean
  staffMembersOnTablet: boolean
  staffIdleMinutes: number
  adminIdleMinutes: number
  floorCapacity: number
  vatRegistered: boolean
  leave: LeaveRules
}): Promise<SettingsResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const staffIdle = Math.round(Number(input.staffIdleMinutes))
  const adminIdle = Math.round(Number(input.adminIdleMinutes))
  if (!(staffIdle >= 1 && staffIdle <= 60) || !(adminIdle >= 1 && adminIdle <= 60)) return { ok: false, error: 'bad_minutes' }
  const capacity = Math.round(Number(input.floorCapacity))
  if (!(capacity >= 1 && capacity <= 10000)) return { ok: false, error: 'bad_capacity' }
  const lv = input.leave
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
  if (!lv || !int(lv.noticeDays, 0, 60) || !LEAVE_KINDS.every((k) => int(lv.quotas?.[k], 0, 366))) return { ok: false, error: 'bad_leave' }
  const row = {
    id: 1,
    staff_desk_on_phone: Boolean(input.staffDeskOnPhone),
    staff_members_on_tablet: Boolean(input.staffMembersOnTablet),
    staff_idle_minutes: staffIdle,
    admin_idle_minutes: adminIdle,
    floor_capacity: capacity,
    vat_registered: Boolean(input.vatRegistered),
    leave_notice_days: lv.noticeDays,
    leave_vacation: Boolean(lv.kinds.vacation),
    leave_sick: Boolean(lv.kinds.sick),
    leave_personal: Boolean(lv.kinds.personal),
    leave_quota_vacation: lv.quotas.vacation,
    leave_quota_sick: lv.quotas.sick,
    leave_quota_personal: lv.quotas.personal,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  }
  const admin = createAdminClient()
  const { error } = await admin.from('app_settings').upsert(row)
  if (error) return fail(error)
  await admin.from('staff_actions').insert({ actor_id: ctx.userId, action: 'settings_access', detail: row })
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

export async function setPhoneAccess(staffId: string, allowed: boolean): Promise<SettingsResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const admin = createAdminClient()
  const { data: p } = await admin.from('profiles').select('role').eq('id', staffId).maybeSingle()
  if (p?.role !== 'staff') return { ok: false, error: 'not_staff' }
  const { error } = allowed
    ? await admin.from('staff_phone_access').upsert({ staff_id: staffId, granted_by: ctx.userId })
    : await admin.from('staff_phone_access').delete().eq('staff_id', staffId)
  if (error) return fail(error)
  await admin.from('staff_actions').insert({ actor_id: ctx.userId, member_id: staffId, action: allowed ? 'phone_access_on' : 'phone_access_off' })
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

// Google Maps review link for 5-star answers (§32, v0.33).
export async function saveReviewUrl(url: string): Promise<SettingsResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const u = String(url ?? '').trim().slice(0, 500)
  if (u && !/^https:\/\/\S+$/.test(u)) return { ok: false, error: 'bad_review' }
  const admin = createAdminClient()
  const { error } = await admin.from('app_settings').update({ google_review_url: u || null, updated_by: ctx.userId, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) return error.code === '42703' || error.code === 'PGRST204' ? { ok: false, error: 'review_not_set_up' } : fail(error)
  await admin.from('staff_actions').insert({ actor_id: ctx.userId, action: 'settings_review_url', detail: { url: u || null } })
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

// Cash drawer float and alert size (§30, v0.31).
export async function saveCashRules(float: number, alert: number): Promise<SettingsResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const f = Number(float)
  const a = Number(alert)
  if (!Number.isInteger(f) || f < 0 || f > 100000 || !Number.isInteger(a) || a < 0 || a > 100000) return { ok: false, error: 'bad_cash' }
  const row = { cash_float: f, cash_alert: a, updated_by: ctx.userId, updated_at: new Date().toISOString() }
  const admin = createAdminClient()
  const { data, error } = await admin.from('app_settings').update(row).eq('id', 1).select('id')
  if (error) return error.code === '42703' || error.code === 'PGRST204' ? { ok: false, error: 'cash_not_set_up' } : fail(error)
  if (!data?.length) {
    const { error: e } = await admin.from('app_settings').insert({ id: 1, ...row })
    if (e) return fail(e)
  }
  await admin.from('staff_actions').insert({ actor_id: ctx.userId, action: 'settings_cash', detail: { cash_float: f, cash_alert: a } })
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

// Where pay periods end (§28, v0.28): saved apart from the rest so the
// other settings still save before that SQL is run.
export async function savePayCycle(input: PayCycleRules): Promise<SettingsResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const cut = Number(input.monthlyCutoffDay)
  const end = Number(input.dailyWeekEnd)
  if (!Number.isInteger(cut) || cut < 0 || cut > 28 || !Number.isInteger(end) || end < 0 || end > 6 || !['weekly', 'half', 'monthly'].includes(input.dailyCycle)) {
    return { ok: false, error: 'bad_pay' }
  }
  const row = { monthly_cutoff_day: cut, daily_cycle: input.dailyCycle, daily_week_end: end, updated_by: ctx.userId, updated_at: new Date().toISOString() }
  const admin = createAdminClient()
  const { data, error } = await admin.from('app_settings').update(row).eq('id', 1).select('id')
  // A missing column (§28 not run): 42703 from Postgres, PGRST204 from the API.
  if (error) return error.code === '42703' || error.code === 'PGRST204' ? { ok: false, error: 'pay_not_set_up' } : fail(error)
  if (!data?.length) {
    const { error: e } = await admin.from('app_settings').insert({ id: 1, ...row })
    if (e) return fail(e)
  }
  await admin.from('staff_actions').insert({ actor_id: ctx.userId, action: 'settings_pay', detail: row })
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

// ---- Branches (§46, v0.38 step 1) ----

export async function saveBranch(input: { id?: string; name: string; active?: boolean }): Promise<SettingsResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const name = input.name.trim().slice(0, 60)
  if (!name) return { ok: false, error: 'need_name' }
  const db = createAdminClient()
  if (input.id) {
    const row: Record<string, unknown> = { name }
    if (input.active !== undefined) row.is_active = input.active
    const { error } = await db.from('branches').update(row).eq('id', input.id)
    if (error) return fail(error)
  } else {
    const { data: last } = await db.from('branches').select('sort').order('sort', { ascending: false }).limit(1)
    const { error } = await db.from('branches').insert({ name, sort: Number(last?.[0]?.sort ?? 0) + 1 })
    if (error) return fail(error)
  }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

export async function deleteBranch(id: string): Promise<SettingsResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  // Keep at least one branch; a branch with history is hidden (set inactive),
  // not deleted — nothing is scoped to a branch yet, so for now delete is fine
  // only when more than one remains.
  const { count } = await db.from('branches').select('id', { count: 'exact', head: true })
  if ((count ?? 0) <= 1) return { ok: false, error: 'branch_last' }
  const { error } = await db.from('branches').delete().eq('id', id)
  if (error) return fail(error)
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}
