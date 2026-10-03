'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { isMissingTable } from '@/lib/console/db-errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { SETTINGS_PATH } from '@/lib/auth/roles'

// Admin: Back Office › Settings (§19). Service role after an admin check;
// each change is logged in staff_actions.

export type SettingsResult = { ok: true } | { ok: false; error: string }

const fail = (error: { code?: string } | null): SettingsResult => ({ ok: false, error: isMissingTable(error) ? 'not_set_up' : 'failed' })

export async function saveAccessSettings(input: {
  staffDeskOnPhone: boolean
  staffMembersOnTablet: boolean
  staffIdleMinutes: number
  adminIdleMinutes: number
  vatRegistered: boolean
}): Promise<SettingsResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const staffIdle = Math.round(Number(input.staffIdleMinutes))
  const adminIdle = Math.round(Number(input.adminIdleMinutes))
  if (!(staffIdle >= 1 && staffIdle <= 60) || !(adminIdle >= 1 && adminIdle <= 60)) return { ok: false, error: 'bad_minutes' }
  const row = {
    id: 1,
    staff_desk_on_phone: Boolean(input.staffDeskOnPhone),
    staff_members_on_tablet: Boolean(input.staffMembersOnTablet),
    staff_idle_minutes: staffIdle,
    admin_idle_minutes: adminIdle,
    vat_registered: Boolean(input.vatRegistered),
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
