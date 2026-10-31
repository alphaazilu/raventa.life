import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { getCurrentDevice } from '@/lib/console/device'
import { listBranches } from '@/lib/console/settings'
import { BranchTree } from '@/components/console/branch-tree'
import { DESK_PATH, BRANCHES_PATH } from '@/lib/auth/roles'
import { can } from '@/lib/auth/permissions'
import { BRAND } from '@/lib/brand/config'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `สาขา | ${backOfficeName(brand)}`,
  }
}

export const dynamic = 'force-dynamic'

// Back Office › Branches (§50, v0.38.8). The org as a tree: company → region /
// province → branch. Click a branch to set its prices and stock. Admins only,
// never on a tablet.
export default async function BranchesPage() {
  const { user } = await getConsoleSession()
  if (!user) redirect(`/login?next=${BRANCHES_PATH}`)
  if (!(await can(user.id, 'access:system.branches'))) redirect(DESK_PATH)
  if (await getCurrentDevice().catch(() => null)) redirect(DESK_PATH)

  const branches = await listBranches().catch(() => null)

  return (
    <main>
      <div className="px-4 pt-6 md:px-6">
        <h1 className="font-display text-2xl font-extrabold text-foreground">สาขา</h1>
      </div>
      {branches === null ? (
        <p className="mx-4 mt-6 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground md:mx-6">
          ยังตั้งค่าสาขาไม่ได้ — ต้องรัน schema.sql ถึง §46 ก่อน
        </p>
      ) : (
        <BranchTree branches={branches} companyName={BRAND.name} />
      )}
    </main>
  )
}
