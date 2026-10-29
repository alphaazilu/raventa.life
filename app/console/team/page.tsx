import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, isAdmin, TEAM_PATH } from '@/lib/auth/roles'
import { listPayTypes, listTeam, roleHistory } from '@/lib/console/team'
import { TeamView } from '@/components/console/team-view'
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
  const { user, role } = await getConsoleSession()
  if (!user) redirect(`/login?next=${TEAM_PATH}`)
  if (!isAdmin(role)) redirect(DESK_PATH)
  const [history, pay] = await Promise.all([roleHistory(), listPayTypes()])
  const team = await listTeam(history, pay)
  return (
    <main>
      <TeamView team={team} history={history} meId={user.id} paySetUp={pay !== null} />
    </main>
  )
}
