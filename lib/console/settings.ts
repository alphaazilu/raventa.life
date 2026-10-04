import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { DEFAULT_LEAVE_RULES, type LeaveRules } from '@/lib/leave'

// Back Office › Settings (schema.sql §19). Read on the server with the
// service role; until §19 is run the defaults below apply.

export type AppSettings = {
  staffDeskOnPhone: boolean
  staffMembersOnTablet: boolean
  staffIdleMinutes: number
  adminIdleMinutes: number
  vatRegistered: boolean // reports split out 7% VAT (prices include it)
  leave: LeaveRules // §25
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  staffDeskOnPhone: false,
  staffMembersOnTablet: true,
  staffIdleMinutes: 10,
  adminIdleMinutes: 5,
  vatRegistered: false,
  leave: DEFAULT_LEAVE_RULES,
}

export const getAppSettings = cache(async (): Promise<AppSettings> => {
  const { data, error } = await createAdminClient().from('app_settings').select('*').eq('id', 1).maybeSingle()
  if (error) {
    if (!isMissingTable(error)) console.error('app settings load failed', error.code)
    return DEFAULT_APP_SETTINGS
  }
  if (!data) return DEFAULT_APP_SETTINGS
  return {
    staffDeskOnPhone: Boolean(data.staff_desk_on_phone),
    staffMembersOnTablet: Boolean(data.staff_members_on_tablet),
    staffIdleMinutes: Number(data.staff_idle_minutes) || DEFAULT_APP_SETTINGS.staffIdleMinutes,
    adminIdleMinutes: Number(data.admin_idle_minutes) || DEFAULT_APP_SETTINGS.adminIdleMinutes,
    vatRegistered: Boolean(data.vat_registered),
    leave: {
      noticeDays: data.leave_notice_days == null ? DEFAULT_LEAVE_RULES.noticeDays : Number(data.leave_notice_days),
      kinds: {
        vacation: data.leave_vacation ?? true,
        sick: data.leave_sick ?? true,
        personal: data.leave_personal ?? true,
      },
      quotas: {
        vacation: Number(data.leave_quota_vacation ?? 0),
        sick: Number(data.leave_quota_sick ?? 0),
        personal: Number(data.leave_quota_personal ?? 0),
      },
    },
  }
})

// Staff allowed to use the front desk from their own phone (one by one).
export const listPhoneAccess = cache(async (): Promise<string[]> => {
  const { data, error } = await createAdminClient().from('staff_phone_access').select('staff_id')
  if (error) return []
  return (data ?? []).map((r) => r.staff_id as string)
})

// May this person sell / check in from where they are now?
// Admins: anywhere. Staff: on a registered tablet, or from their phone when
// an admin allowed it (for everyone, or for them).
export async function deskAllowed(input: { userId: string; admin: boolean; onTablet: boolean }): Promise<boolean> {
  if (input.admin || input.onTablet) return true
  const settings = await getAppSettings()
  if (settings.staffDeskOnPhone) return true
  return (await listPhoneAccess()).includes(input.userId)
}
