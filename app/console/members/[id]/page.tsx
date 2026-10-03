import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { MemberEditForm } from '@/components/admin/member-edit-form'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, MEMBERS_PATH } from '@/lib/auth/roles'
import { loadVisitHistory } from '@/lib/visit-history'
import { VisitHistoryView } from '@/components/visit-history-view'
import { PackageList } from '@/components/package-list'
import { loadMemberPackages } from '@/lib/packages'
import { bangkokToday } from '@/lib/check-in/day'

export const metadata: Metadata = {
  title: 'ข้อมูลสมาชิก | RAVENTA Back Office',
}

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user, role } = await getConsoleSession()

  if (!user) redirect(`/login?next=${MEMBERS_PATH}/${id}`)

  if (role !== 'admin') redirect(DESK_PATH)

  const [{ data: member }, history, stampRes, packages] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, member_no, first_name, last_name, email, phone, province, nationality')
      .eq('id', id)
      .single(),
    loadVisitHistory(supabase, id, { bills: true }),
    supabase.rpc('member_stamp_status', { p_member_id: id }),
    loadMemberPackages(supabase, id, bangkokToday(), true),
  ])

  if (!member) notFound()
  const st = Array.isArray(stampRes.data) ? stampRes.data[0] : stampRes.data
  const stamps = st ? { stamps: Number(st.stamps), rewardsAvailable: Number(st.rewards_available) } : null

  // Details on the left, history on the right (stacked on a tablet/phone).
  return (
    <main className="mx-auto grid max-w-7xl gap-2 lg:grid-cols-[28rem_1fr] lg:items-start">
      <MemberEditForm member={member} />
      <div className="px-4 pb-12 lg:py-12 lg:pr-6">
        <PackageList packages={packages} heading className="mb-6" />
        <VisitHistoryView history={history} stamps={stamps} admin />
      </div>
    </main>
  )
}
