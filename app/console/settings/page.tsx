import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SettingsView, type SettingsTab } from '@/components/console/settings-view'
import { getConsoleSession } from '@/lib/console/session'
import { getAppSettings, listPhoneAccess } from '@/lib/console/settings'
import { DEFAULT_SETTINGS, getTimeSettings } from '@/lib/console/shifts'
import { isMissingTable } from '@/lib/console/db-errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { DESK_PATH, isAdmin, SETTINGS_PATH } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: 'ตั้งค่า | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office › Settings (schema.sql §19), in tabs (v0.28): ?tab=team|work|shop.
// Admins only, never on a tablet.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${SETTINGS_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)

  const { tab } = await searchParams
  const initialTab: SettingsTab = tab === 'work' || tab === 'shop' ? tab : 'team'
  const admin = createAdminClient()
  const [settings, phone, check, staffRes, timeRules] = await Promise.all([
    getAppSettings(),
    listPhoneAccess(),
    admin.from('app_settings').select('id').limit(1),
    admin.from('profiles').select('id, first_name, last_name, email').eq('role', 'staff').order('first_name'),
    getTimeSettings().catch(() => DEFAULT_SETTINGS),
  ])
  const staff = (staffRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—',
  }))

  return (
    <main>
      <SettingsView settings={settings} staff={staff} phoneAccess={phone} setUp={!isMissingTable(check.error)} initialTab={initialTab} timeRules={timeRules} />
    </main>
  )
}
