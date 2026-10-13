'use client'

import Link from 'next/link'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { UpcomingList } from '@/components/calendar/upcoming-list'
import { calCopy, type Occurrence } from '@/lib/calendar'

// Home page: "Coming up at RAVENTA" — public calendar items (§31, v0.32).
// Not shown when there is nothing coming up.
export function UpcomingSection({ items }: { items: Occurrence[] }) {
  const { tr } = useLanguage()
  if (!items.length) return null
  return (
    <section id="events" className="bg-secondary/40 py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold md:text-3xl">
            <CalendarDays className="h-6 w-6 text-primary" aria-hidden="true" />
            {tr(calCopy.comingSoon)}
          </h2>
          <Link href="/events" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {tr(calCopy.seeAll)} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-5 rounded-2xl border border-border bg-card px-4 md:px-6">
          <UpcomingList items={items} />
        </div>
      </div>
    </section>
  )
}
