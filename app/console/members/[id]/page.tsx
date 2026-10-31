import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { MemberEditForm } from '@/components/admin/member-edit-form'
import { getConsoleSession } from '@/lib/console/session'
import { DESK_PATH, MEMBERS_PATH } from '@/lib/auth/roles'
import { gatePage } from '@/lib/console/guard'
import { mayOpen } from '@/lib/auth/permissions'
import { loadVisitHistory } from '@/lib/visit-history'
import { VisitHistoryView } from '@/components/visit-history-view'
import { PackageList } from '@/components/package-list'
import { loadMemberPackages } from '@/lib/packages'
import { bangkokToday } from '@/lib/check-in/day'
import { loadShareHistory } from '@/lib/package-share-history'
import { ShareHistory } from '@/components/console/share-history'
import { MemberRole } from '@/components/console/member-role'
import { MemberBookings } from '@/components/console/member-bookings'
import { getRules, memberBookings, memberNoShow } from '@/lib/console/booking'
import { MemberReferral } from '@/components/console/member-referral'
import { referralOf } from '@/lib/console/referral'
import { listEarners } from '@/lib/console/commission'
import { getBrandInfo } from '@/lib/brand/settings'
import { backOfficeName } from '@/lib/brand/info'
import { latestConsents } from '@/lib/consent'
import { PDPA_VERSION, WAIVER_VERSION } from '@/lib/legal/content'
import { MemberConsent } from '@/components/console/member-consent'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `ข้อมูลสมาชิก | ${backOfficeName(brand)}`,
  }
}

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user, role } = await getConsoleSession()

  if (!user) redirect(`/login?next=${MEMBERS_PATH}/${id}`)
  // RBAC 3b: ROUTE_RULES with the person's real roles (the middleware no longer checks per page).
  await gatePage(`${MEMBERS_PATH}/${id}`)

  // The full record: access:storefront.members + action:pii.view (ROUTE_RULES).
  if (!(await mayOpen(user.id, `${MEMBERS_PATH}/${id}`, false))) redirect(DESK_PATH)

  const [{ data: member }, history, stampRes, packages, shareEvents, bookings, rules, referral, team, consents] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, member_no, first_name, last_name, email, phone, province, nationality, role')
      .eq('id', id)
      .single(),
    loadVisitHistory(supabase, id, { bills: true }),
    supabase.rpc('member_stamp_status', { p_member_id: id }),
    loadMemberPackages(supabase, id, bangkokToday(), true),
    loadShareHistory(supabase, id),
    memberBookings(id).catch(() => null),
    getRules(),
    // §36: who referred them (null = not run yet)
    referralOf(id).catch(() => null),
    listEarners().catch(() => null),
    // §54 (v0.43.1): PDPA + health waiver; null = not set up (card hidden)
    latestConsents(supabase, id),
  ])
  const noShow = bookings ? await memberNoShow(id, rules).catch(() => null) : null

  if (!member) notFound()
  const st = Array.isArray(stampRes.data) ? stampRes.data[0] : stampRes.data
  const stamps = st ? { stamps: Number(st.stamps), rewardsAvailable: Number(st.rewards_available) } : null

  // Details on the left, history on the right (stacked on a tablet/phone).
  return (
    <main className="grid w-full gap-2 lg:grid-cols-[28rem_minmax(0,1fr)] 2xl:grid-cols-[32rem_minmax(0,1fr)] lg:items-start">
      <MemberEditForm member={member} />
      <div className="px-4 pb-12 lg:py-12 lg:pr-6 xl:pr-8">
        <MemberRole
          person={{ id: member.id, name: [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email || '—', role: member.role }}
          meId={user.id}
        />
        {consents && <MemberConsent pdpa={consents.pdpa ?? null} waiver={consents.waiver ?? null} pdpaCurrent={PDPA_VERSION} waiverCurrent={WAIVER_VERSION} />}
        {referral && (
          <MemberReferral
            memberId={id}
            data={referral}
            team={(team ?? []).filter((p) => p.id !== id).map((p) => ({ id: p.id, name: p.enabled ? p.name : `${p.name} (ไม่รับคอม)` }))}
          />
        )}
        {bookings && <MemberBookings memberId={id} list={[...bookings.upcoming, ...bookings.past]} noShow={noShow} rules={rules} />}
        <PackageList packages={packages} heading className="mb-6" />
        <ShareHistory events={shareEvents} className="mb-6" />
        <VisitHistoryView history={history} stamps={stamps} admin />
      </div>
    </main>
  )
}
