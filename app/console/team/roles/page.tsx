import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, TEAM_PATH } from '@/lib/auth/roles'
import { can } from '@/lib/auth/permissions'
import { listRoles } from '@/lib/console/roles'
import { RolesView } from '@/components/console/roles-view'
import { rolesCopy } from '@/lib/console/copy'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return { title: `จัดการ role | ${backOfficeName(brand)}` }
}

export const dynamic = 'force-dynamic'

// Back Office › Team & roles › Roles (RBAC phase 3a, v0.44.4): what each role
// may open and do. Gated like the team page (access:team.roles — ROUTE_RULES
// covers /console/team/*); editing needs action:roles.manage too.
export default async function RolesPage() {
  const { user } = await getConsoleSession()
  if (!user) redirect(`/login?next=${TEAM_PATH}/roles`)
  if (!(await can(user.id, 'access:team.roles'))) redirect(DESK_PATH)
  const [roles, canEdit] = await Promise.all([listRoles(), can(user.id, 'action:roles.manage')])
  if (!roles) {
    return (
      <main className="px-4 py-8 md:px-6 xl:px-8">
        <p className="rounded-2xl bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-300">{rolesCopy.notSetUp.th}</p>
      </main>
    )
  }
  return (
    <main>
      <RolesView roles={roles} canEdit={canEdit} />
    </main>
  )
}
