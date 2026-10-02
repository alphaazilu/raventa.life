import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SettingsView } from '@/components/console/settings-view'
import { getConsoleSession } from '@/lib/console/session'
import { getAppSettings, listPhoneAccess } from '@/lib/console/settings'
import { isMissingTable } from '@/lib/console/db-errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONSOLE_PATH, isAdmin, SETTINGS_PATH } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: 'ตั้งค่า | RAVENTA Back Office',
}

export const dynamic = 'force-dynamic'

// Back Office › Settings (schema.sql §19). Admins only, never on a tablet.
export default async function SettingsPage() {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${SETTINGS_PATH}`)
  if (!isAdmin(role)) redirect(CONSOLE_PATH)

  const admin = createAdminClient()
  const [settings, phone, check, staffRes] = await Promise.all([
    getAppSettings(),
    listPhoneAccess(),
    admin.from('app_settings').select('id').limit(1),
    admin.from('profiles').select('id, first_name, last_name, email').eq('role', 'staff').order('first_name'),
  ])
  const staff = (staffRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—',
  }))

  return (
    <main>
      <SettingsView settings={settings} staff={staff} phoneAccess={phone} setUp={!isMissingTable(check.error)} />
    </main>
  )
}
