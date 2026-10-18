'use client'

import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { MemberCard } from '@/components/account/member-card'
import { LinkRow } from '@/components/account/account-view'
import { DESK_PATH, MY_CHECKLIST_PATH } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'
import { CalendarCheck, Coins, ChevronRight, Gift, ListChecks, Star } from 'lucide-react'
import { formatMemberDate } from '@/lib/format-date'
import Link from 'next/link'
import { checklistCopy } from '@/lib/checklist'
import { PackageList } from '@/components/package-list'
import { PackageShare } from '@/components/account/package-share'
import { GiftVoucher } from '@/components/gift-voucher'
import { MyShifts } from '@/components/account/my-shifts'
import { UpcomingList } from '@/components/calendar/upcoming-list'
import { calCopy, type Occurrence } from '@/lib/calendar'
import { fbCopy, type PendingVisit } from '@/lib/feedback'
import type { MyShifts as MyShiftsData } from '@/lib/my-shifts'
import { packageAlive, packageLeft, type MemberPackage } from '@/lib/packages'
import { bangkokToday } from '@/lib/check-in/day'
import { cmCopy, money } from '@/lib/commission'
import { bkCopy, bkkHm, type Booking } from '@/lib/booking'
import { MY_BOOKINGS_PATH } from '@/lib/auth/roles'
import type { MyCommissionCard } from '@/lib/console/commission'
import { ReferralCard, type MyReferral } from '@/components/account/referral-card'

// Staff: "My work" (today's checklists, my shifts / leave) sits under the
// card, apart from the member things (stamps, packages) — v0.30.
const myWork = { th: 'งานของฉัน', en: 'My work' }

// The member page people open at the counter: just the card (and its
// check-in QR). Phone, email and the rest sit one tap away on the settings
// page, so nobody glancing at the screen sees them.
export function AccountHome({
  name,
  memberNo,
  avatarUrl,
  joinedAt,
  openCardOnLoad,
  stamps,
  showDeskLink,
  role,
  packages,
  gifts = [],
  myShifts = null,
  checklist = null,
  upcoming = [],
  teamSoon = [],
  feedbackVisit = null,
  commission = null,
  referral = null,
  booking = null,
}: {
  name: string
  memberNo: string | null
  avatarUrl: string | null
  joinedAt: string | null
  openCardOnLoad: boolean
  stamps: { progress: number; rewardsAvailable: number } | null
  showDeskLink: boolean
  role: string
  packages: MemberPackage[]
  gifts?: MemberPackage[]
  myShifts?: MyShiftsData | null
  checklist?: { rounds: number; left: number } | null
  upcoming?: Occurrence[] // calendar: members + public, next weeks (§31)
  teamSoon?: Occurrence[] // calendar: team items, next 7 days (staff/admin)
  feedbackVisit?: PendingVisit | null // a visit waiting to be rated (§32)
  commission?: MyCommissionCard | null // my commission this pay period (§33)
  referral?: MyReferral | null // team: my referral code + QR (§36)
  booking?: { next: Booking | null; count: number } | null // bookings (§34); null = nothing bookable
}) {
  const { tr, lang } = useLanguage()
  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-16 md:pt-6">
      <h1 className="font-display text-3xl font-extrabold text-foreground md:text-4xl">
        {tr(authCopy.accountHeading)}
      </h1>

      {feedbackVisit && (
        <Link href="/account/feedback" className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-400/50 bg-amber-400/10 px-4 py-3.5">
          <Star className="h-6 w-6 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{tr(fbCopy.cardTitle)}</span>
            <span className="block text-sm text-muted-foreground">
              {tr(fbCopy.cardSub).replace('{d}', formatMemberDate(`${feedbackVisit.visitDate}T12:00:00+07:00`, lang, true) ?? feedbackVisit.visitDate)}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}

      <div className="mt-8">
        <MemberCard name={name} memberNo={memberNo} avatarUrl={avatarUrl} joinedAt={joinedAt} role={role} autoOpen={openCardOnLoad} />
      </div>

      {booking && (
        <Link href={MY_BOOKINGS_PATH} className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
          <CalendarCheck className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{booking.next ? tr(bkCopy.myBookings) : tr(bkCopy.bookNow)}</span>
            <span className="block truncate text-sm text-muted-foreground">
              {booking.next
                ? tr(bkCopy.nextBooking).replace(
                    '{t}',
                    `${tr(booking.next.typeName)} · ${formatMemberDate(`${booking.next.day}T12:00:00+07:00`, lang, true) ?? booking.next.day} ${booking.next.wholeDay ? (booking.next.arriveTime ? `~${booking.next.arriveTime}` : tr(bkCopy.allDay)) : bkkHm(booking.next.start)}`,
                  ) + (booking.count > 1 ? ` (+${booking.count - 1})` : '')
                : tr(bkCopy.payAtShop)}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}

      {(checklist || myShifts || teamSoon.length > 0 || commission || referral) && <h2 className="mt-8 text-base font-semibold text-card-foreground">{tr(myWork)}</h2>}

      {checklist && (
        <Link
          href={MY_CHECKLIST_PATH}
          className={cn(
            'mt-3 flex items-center gap-3 rounded-2xl border px-4 py-3.5',
            checklist.left > 0 ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
          )}
        >
          <ListChecks className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{tr(checklistCopy.today)}</span>
            <span className="block text-sm text-muted-foreground">
              {checklist.left > 0 ? tr(checklistCopy.left).replace('{n}', String(checklist.left)) : tr(checklistCopy.scan)}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}

      {teamSoon.length > 0 && (
        <section className="mt-3 rounded-2xl border border-border bg-card px-4 py-2">
          <p className="pt-1.5 text-sm font-semibold text-muted-foreground">{tr(calCopy.teamUpcoming)}</p>
          <UpcomingList items={teamSoon} />
        </section>
      )}

      {commission && (
        <section className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <Coins className="h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{tr(cmCopy.mine)}</span>
            <span className="block text-xs text-muted-foreground">
              {tr(cmCopy.mineSub)
                .replace('{p}', `${formatMemberDate(`${commission.from}T12:00:00+07:00`, lang, true) ?? commission.from} – ${formatMemberDate(`${commission.to}T12:00:00+07:00`, lang, true) ?? commission.to}`)
                .replace('{n}', String(commission.lines))}
              {commission.last > 0 && ` · ${tr(cmCopy.mineLast).replace('{a}', money(commission.last))}`}
            </span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">{tr(cmCopy.mineNote)}</span>
          </span>
          <span className="shrink-0 text-right font-display text-2xl font-extrabold">
            {money(commission.amount)} <span className="text-sm font-bold">฿</span>
          </span>
        </section>
      )}

      {referral && <ReferralCard data={referral} />}

      {myShifts && <MyShifts data={myShifts} />}

      {upcoming.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold text-card-foreground">{tr(calCopy.upcoming)}</h2>
          <div className="rounded-2xl border border-border bg-card px-4">
            <UpcomingList items={upcoming} />
          </div>
        </section>
      )}

      {stamps && <StampCard progress={stamps.progress} rewardsAvailable={stamps.rewardsAvailable} />}

      {gifts.length > 0 && <MyGifts gifts={gifts} />}

      {packages.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold text-card-foreground">{tr(authCopy.myPackages)}</h2>
          <PackageList packages={packages} extra={(k) => (k.isOwner && k.shareable ? <PackageShare pkg={k} /> : null)} />
        </section>
      )}

      <nav className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
        {/* Staff allowed to sell from their phone (Back Office › Settings);
            everyone else uses the counter tablet, admins the header button. */}
        {showDeskLink && <LinkRow href={DESK_PATH}>{tr(authCopy.deskLinkLabel)}</LinkRow>}
        <LinkRow href="/account/history">{tr(authCopy.historyLink)}</LinkRow>
        <LinkRow href="/account/settings">{tr(authCopy.settingsLink)}</LinkRow>
      </nav>
    </div>
  )
}

// Visits friends handed this member (§23), as gift vouchers: ready ones
// first, then used/expired ones (faded) from the last couple of months.
function MyGifts({ gifts }: { gifts: MemberPackage[] }) {
  const { tr } = useLanguage()
  const today = bangkokToday()
  const rows = gifts
    .map((k) => {
      const left = packageLeft(k) ?? 0
      const state = packageAlive(k, today) ? 'ready' : left === 0 ? 'used' : 'expired'
      return { k, left, state } as const
    })
    .sort((a, b) => Number(a.state !== 'ready') - Number(b.state !== 'ready'))
  const anyReady = rows.some((r) => r.state === 'ready')
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-base font-semibold text-card-foreground">
        <Gift className="h-4 w-4 text-primary" aria-hidden="true" />
        {tr(authCopy.myGifts)}
      </h2>
      <div className="space-y-3">
        {rows.map(({ k, left, state }) => (
          <GiftVoucher
            key={k.id}
            from={k.ownerName ?? '—'}
            left={left}
            total={k.visitsTotal ?? 1}
            until={k.expiresOn}
            weekdayOnly={k.weekdayOnly}
            state={state}
          />
        ))}
      </div>
      {anyReady && <p className="mt-2 text-xs text-muted-foreground">{tr(authCopy.myGiftsHint)}</p>}
    </section>
  )
}

// 1 stamp per paid visit (max one a day); 10 = a free weekday Day Pass.
// Counted from check-ins by staff, so there's nothing to forget to collect.
function StampCard({ progress, rewardsAvailable }: { progress: number; rewardsAvailable: number }) {
  const { tr } = useLanguage()
  return (
    <section className="mt-6 rounded-2xl border border-border bg-secondary px-5 py-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-card-foreground">{tr(authCopy.stampCardHeading)}</h2>
        <span className="font-display text-lg font-extrabold text-foreground">{progress}/10</span>
      </div>
      <div className="mt-3 grid grid-cols-10 gap-1.5" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'aspect-square rounded-full',
              i < progress ? 'bg-primary' : 'border border-dashed border-border bg-background',
            )}
          />
        ))}
      </div>
      {rewardsAvailable > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-accent">
          <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
          {tr(authCopy.stampCardReward)}
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{tr(authCopy.stampCardHint)}</p>
      )}
    </section>
  )
}
