import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { getCurrentDevice } from '@/lib/console/device'
import { loadBranchDetail } from '@/lib/console/branch-detail'
import { BranchSettingsView } from '@/components/console/branch-settings-view'
import { DESK_PATH, isAdmin, SETTINGS_PATH } from '@/lib/auth/roles'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ตั้งค่าสาขา | ${backOfficeName(brand)}`,
  }
}

export const dynamic = 'force-dynamic'

// Back Office › Settings › Branches › one branch (v0.38.7). Its price overrides,
// its own stock, and the tablets assigned to it, in one place. Admins only,
// never on a tablet (same rule as the rest of Settings).
export default async function BranchSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${SETTINGS_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)
  if (await getCurrentDevice().catch(() => null)) redirect(DESK_PATH)

  const { id } = await params
  const detail = await loadBranchDetail(id).catch(() => null)
  if (!detail) notFound()

  return (
    <main>
      <BranchSettingsView detail={detail} />
    </main>
  )
}
