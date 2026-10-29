import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { EventsView } from '@/components/calendar/events-view'
import { upcomingOutside } from '@/lib/console/calendar'
import { bangkokToday } from '@/lib/check-in/day'
import { BRAND } from '@/lib/brand/config'

export const metadata: Metadata = {
  title: `กิจกรรมและข่าวสาร | ${BRAND.fullName}`,
}

// Rebuilt at most every 5 minutes (calendar changes also refresh it).
export const revalidate = 300

// Public calendar items, the next four months (§31, v0.32).
export default async function EventsPage() {
  const items = await upcomingOutside({ id: null, role: 'public' }, bangkokToday(), 120, 60).catch(() => [])
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-20 md:pt-24">
        <EventsView items={items} />
      </main>
      <SiteFooter />
    </>
  )
}
