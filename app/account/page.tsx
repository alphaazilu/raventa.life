import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AccountHome } from '@/components/account/account-home'
import { deskAllowed } from '@/lib/console/settings'
import { createClient } from '@/lib/supabase/server'
import { resolveAvatarUrl } from '@/lib/supabase/avatar'
import { isGift, loadMemberPackages, packageAlive } from '@/lib/packages'
import { bangkokToday } from '@/lib/check-in/day'
import { loadMyShifts } from '@/lib/my-shifts'
import { dueNow } from '@/lib/console/checklist'
import { upcomingOutside, upcomingTeam } from '@/lib/console/calendar'
import { pendingVisit } from '@/lib/console/feedback'
import { isEarner, myCommissionCard } from '@/lib/console/commission'
import { codeFor } from '@/lib/console/referral'
import { listTypes, memberBookings } from '@/lib/console/booking'
import { BRAND } from '@/lib/brand/config'

export const metadata: Metadata = {
  title: `My Account | ${BRAND.fullName}`,
}

const GIFT_KEEP_DAYS = 60

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; link_error?: string; link?: string; card?: string }>
}) {
  const params = await searchParams

  // The "link LINE" round trip used to land here; it now belongs on the
  // settings page (older links, and the merge flow, still say /account).
  if (params.linked || params.link_error) {
    const qs = new URLSearchParams()
    if (params.linked) qs.set('linked', params.linked)
    if (params.link_error) qs.set('link_error', params.link_error)
    if (params.link) qs.set('link', params.link)
    redirect(`/account/settings?${qs.toString()}`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=${encodeURIComponent(params.card === '1' ? '/account?card=1' : '/account')}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, first_name, last_name, member_no, avatar_path, provider_avatar_url, created_at, role')
    .eq('id', user.id)
    .maybeSingle()

  const avatarUrl = await resolveAvatarUrl(supabase, profile)
  // Stamp card (supabase/schema.sql §13). Hidden, not an error, until that
  // part of the schema has been run.
  const { data: stampRows } = await supabase.rpc('member_stamp_status', { p_member_id: user.id })
  const stampRow = Array.isArray(stampRows) ? stampRows[0] : stampRows
  const stamps = stampRow
    ? { progress: Number(stampRow.progress), rewardsAvailable: Number(stampRow.rewards_available) }
    : null
  // Gifts (visits a friend handed over, §23) get their own vouchers; used or
  // expired ones stay a while, faded, so a gift doesn't just vanish.
  const today = bangkokToday()
  const allPackages = await loadMemberPackages(supabase, user.id, today, true)
  const packages = allPackages.filter((k) => !isGift(k) && packageAlive(k, today))
  const recent = new Date(Date.now() - GIFT_KEEP_DAYS * 86_400_000).toISOString()
  const gifts = allPackages.filter((k) => isGift(k) && !k.cancelled && (packageAlive(k, today) || k.createdAt >= recent))
  // Staff: their roster and leave requests (§17, §25).
  const myShifts = profile?.role === 'staff' ? await loadMyShifts(user.id, today) : null
  // Team: checklists due now (§29), a row linking to the scan page.
  const checklist = profile?.role === 'staff' || profile?.role === 'admin' ? await dueNow(today).catch(() => null) : null
  // Calendar (§31): events / campaigns for members; team items for staff.
  const team = profile?.role === 'staff' || profile?.role === 'admin'
  const [upcoming, teamSoon, feedbackVisit, commission, bookable, myBookings] = await Promise.all([
    upcomingOutside({ id: user.id, role: 'member' }, today, 45, 5).catch(() => []),
    team
      ? upcomingTeam({ id: user.id, role: profile?.role === 'admin' ? 'admin' : 'staff' }, today, 7)
          .then((list) => list.filter((o) => o.item.visibility !== 'members' && o.item.visibility !== 'public').slice(0, 6))
          .catch(() => [])
      : Promise.resolve([]),
    // §32: a visit waiting to be rated (within 7 days)
    pendingVisit(user.id).catch(() => null),
    // §33: my commission this pay period (people who earn)
    team ? myCommissionCard(user.id, today) : Promise.resolve(null),
    // §34: anything members can book, and my next booking
    listTypes(true).then((t) => (t ?? []).some((x) => x.memberBooking)).catch(() => false),
    memberBookings(user.id).catch(() => null),
  ])
  // §36: my referral code + QR (team) — the QR opens sign-up with it filled in.
  const refCode = team ? await codeFor(user.id).catch(() => null) : null
  const referral = refCode
    ? {
        code: refCode,
        link: `${(process.env.SITE_URL ?? BRAND.siteUrl).replace(/\/$/, '')}/login?ref=${refCode}`,
        earns: Boolean(await isEarner(user.id).catch(() => false)),
      }
    : null
  const booking =
    bookable || (myBookings?.upcoming.length ?? 0) > 0 ? { next: myBookings?.upcoming[0] ?? null, count: myBookings?.upcoming.length ?? 0 } : null
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
  // Staff see the front-desk link only when an admin allowed it on their
  // phone (Back Office › Settings); otherwise they use the counter tablet.
  const showDeskLink =
    profile?.role === 'staff' && (await deskAllowed({ userId: user.id, admin: false, onTablet: false }).catch(() => false))

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-20 md:pt-24">
        <AccountHome
          name={fullName || user.email || profile?.email || '—'}
          memberNo={profile?.member_no ?? null}
          avatarUrl={avatarUrl}
          joinedAt={profile?.created_at ?? null}
          stamps={stamps}
          showDeskLink={showDeskLink}
          role={profile?.role ?? 'customer'}
          packages={packages}
          gifts={gifts}
          myShifts={myShifts}
          checklist={checklist}
          upcoming={upcoming}
          teamSoon={teamSoon}
          feedbackVisit={feedbackVisit}
          commission={commission}
          referral={referral}
          booking={booking}
          // /account?card=1 (the LINE rich menu's member card button) opens
          // the check-in QR straight away.
          openCardOnLoad={params.card === '1'}
        />
      </main>
      <SiteFooter />
    </>
  )
}
