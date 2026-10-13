'use client'

import { Clock, MapPin } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { hm, kindCopy, type CalKind, type Occurrence } from '@/lib/calendar'
import { cn } from '@/lib/utils'

// Calendar items for My account and the website (§31, v0.32): what's coming up.
const DOT: Record<CalKind, string> = { event: 'bg-primary', campaign: 'bg-amber-500', note: 'bg-sky-500', closed: 'bg-foreground' }

export function UpcomingList({ items, compact = false }: { items: Occurrence[]; compact?: boolean }) {
  const { tr, lang } = useLanguage()
  const loc = lang === 'en' ? 'en-GB' : 'th-TH'
  return (
    <ul className="divide-y divide-border">
      {items.map((o) => {
        const i = o.item
        const title = lang === 'en' && i.titleEn ? i.titleEn : i.title
        const body = lang === 'en' && i.bodyEn ? i.bodyEn : i.body
        const date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' })
        return (
          <li key={i.id + o.start} className="flex gap-3 py-3">
            <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT[i.kind])} aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">{title}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {date.format(new Date(`${o.start}T00:00:00Z`))}
                  {o.end !== o.start && ` – ${date.format(new Date(`${o.end}T00:00:00Z`))}`}
                  {hm(i.startTime) && ` · ${hm(i.startTime)}${hm(i.endTime) ? `–${hm(i.endTime)}` : ''}`}
                </span>
                {i.place && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {i.place}
                  </span>
                )}
                <span>{tr(kindCopy[i.kind])}</span>
              </p>
              {!compact && body && <p className="mt-1 text-sm whitespace-pre-line text-foreground/80">{body}</p>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
