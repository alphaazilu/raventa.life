import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { createClient } from '@/lib/supabase/server'
import { bangkokToday } from '@/lib/check-in/day'
import { getRules, listCategories, listTypes, memberBookings, memberNoShow } from '@/lib/console/booking'
import { sortByCategory } from '@/lib/booking'
import { MY_BOOKINGS_PATH } from '@/lib/auth/roles'
import { MemberBooking, type PublicType } from '@/components/booking/member-booking'
import { getBrandInfo } from '@/lib/brand/settings'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `จองคิว | ${brand.name}`,
  }
}

export const dynamic = 'force-dynamic'

// My account › Bookings (§34, v0.35): book, see and cancel my bookings.
export default async function MyBookingsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(MY_BOOKINGS_PATH)}`)
  const q = await searchParams
  const [types, mine, rules, cats] = await Promise.all([
    listTypes(true).catch(() => null),
    memberBookings(user.id).catch(() => null),
    getRules(),
    listCategories(true).catch(() => null),
  ])
  const noShow = types ? await memberNoShow(user.id, rules).catch(() => null) : null
  // Only what members may see of each type.
  const open: PublicType[] = sortByCategory(types ?? [], cats ?? [])
    .filter((t) => t.memberBooking)
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      categoryId: t.categoryId,
      wholeDay: t.wholeDay,
      pickArrival: t.pickArrival,
      capacity: t.capacity,
      nameTh: t.nameTh,
      nameEn: t.nameEn,
      description: t.description,
      durationMin: t.durationMin,
      advanceDays: t.advanceDays,
      cancelHours: t.cancelHours,
      maxParty: t.maxParty,
      resources: t.memberPick ? t.resources.filter((r) => r.active).map((r) => ({ id: r.id, label: r.label })) : [],
    }))
  const cancelHours = Object.fromEntries((types ?? []).map((t) => [t.id, t.cancelHours]))

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-20 md:pt-24">
        <div className="mx-auto max-w-lg px-4 pt-4 pb-16 md:pt-6">
          <MemberBooking
            setUp={types !== null}
            types={open}
            categories={(cats ?? []).map((x) => ({ id: x.id, nameTh: x.nameTh, nameEn: x.nameEn, description: x.description, imageUrl: x.imageUrl }))}
            upcoming={mine?.upcoming ?? []}
            past={mine?.past ?? []}
            cancelHours={cancelHours}
            today={bangkokToday()}
            blockedUntil={noShow?.level === 'blocked' ? noShow.blockedUntil : null}
            warn={noShow?.level === 'warn' ? { score: noShow.score, block: rules.block, days: rules.blockDays } : null}
            startType={q.t ?? null}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
