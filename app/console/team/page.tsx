import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, TEAM_PATH } from '@/lib/auth/roles'
import { can } from '@/lib/auth/permissions'
import { listPayTypes, listTeam, roleHistory } from '@/lib/console/team'
import { TeamView } from '@/components/console/team-view'
import { listRoles } from '@/lib/console/roles'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ทีมงานและสิทธิ์ | ${backOfficeName(brand)}`,
  }
}

export const dynamic = 'force-dynamic'

// Back Office › System › Team & roles: who is staff or admin, add people
// from the members, change or remove their role — no more editing
// profiles.role in Supabase by hand. Admins only.
export default async function TeamPage() {
  const { user } = await getConsoleSession()
  if (!user) redirect(`/login?next=${TEAM_PATH}`)
  if (!(await can(user.id, 'access:team.roles'))) redirect(DESK_PATH)
  const [history, pay, roles, manage] = await Promise.all([roleHistory(), listPayTypes(), listRoles(), can(user.id, 'action:roles.manage')])
  const team = await listTeam(history, pay)
  // RBAC 3a: extra roles can be given by those who manage roles.
  const options = manage && roles ? roles.map((r) => ({ id: r.id, key: r.key, nameTh: r.nameTh, nameEn: r.nameEn })) : null
  return (
    <main>
      <TeamView team={team} history={history} meId={user.id} paySetUp={pay !== null} roles={options} />
    </main>
  )
}
