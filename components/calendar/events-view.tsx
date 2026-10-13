'use client'

import { useLanguage } from '@/components/language-provider'
import { UpcomingList } from '@/components/calendar/upcoming-list'
import { calCopy, type Occurrence } from '@/lib/calendar'

export function EventsView({ items }: { items: Occurrence[] }) {
  const { tr } = useLanguage()
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 pb-16 md:pt-6">
      <h1 className="font-display text-3xl font-extrabold md:text-4xl">{tr(calCopy.eventsTitle)}</h1>
      <p className="mt-2 text-muted-foreground">{tr(calCopy.eventsIntro)}</p>
      <div className="mt-6 rounded-2xl border border-border bg-card px-4 md:px-6">
        {items.length ? <UpcomingList items={items} /> : <p className="py-10 text-center text-sm text-muted-foreground">{tr(calCopy.nothingRange)}</p>}
      </div>
    </div>
  )
}
