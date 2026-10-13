'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { addDays, bkCopy as c } from '@/lib/booking'
import { cn } from '@/lib/utils'

// A month to pick a booking day from (v0.35.5): Monday first, each day
// shows whether there's room — places left for whole-day items, a dot for
// timed ones (green, orange when nearly full). Full, closed, past and
// out-of-range days are faded and can't be picked.

const WD = [
  { th: 'จ', en: 'Mo' },
  { th: 'อ', en: 'Tu' },
  { th: 'พ', en: 'We' },
  { th: 'พฤ', en: 'Th' },
  { th: 'ศ', en: 'Fr' },
  { th: 'ส', en: 'Sa' },
  { th: 'อา', en: 'Su' },
]

const monthOf = (d: string) => `${d.slice(0, 7)}-01`
const shiftMonth = (m: string, n: number) => {
  const y = Number(m.slice(0, 4))
  const mo = Number(m.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(mo / 12)
  const mm = ((mo % 12) + 12) % 12
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`
}
// First cell of the grid (the Monday on or before the 1st).
export const gridStart = (month: string) => addDays(month, -((new Date(`${month}T00:00:00Z`).getUTCDay() + 6) % 7))

export function MonthPicker({
  value,
  onChange,
  free,
  min,
  max,
  capacity,
  wholeDay,
  onMonth,
}: {
  value: string
  onChange: (day: string) => void
  // Places left per day: 0 = full, -1 = closed / not open (missing = not known yet).
  free: Record<string, number> | null
  min: string
  max: string
  capacity: number
  wholeDay: boolean
  // The month shown changed (to load its days).
  onMonth?: (month: string) => void
}) {
  const { tr, lang } = useLanguage()
  const [month, setMonth] = useState(monthOf(value))
  useEffect(() => setMonth(monthOf(value)), [value])
  useEffect(() => onMonth?.(month), [month]) // eslint-disable-line react-hooks/exhaustive-deps
  const start = gridStart(month)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const weeks = days[35].slice(0, 7) === month.slice(0, 7) ? 6 : 5
  const title = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}T00:00:00Z`))

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={month <= monthOf(min)}
          aria-label={tr(c.prev)}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="font-display text-base font-bold">{title}</span>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= monthOf(max)}
          aria-label={tr(c.next)}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WD.map((w, i) => (
          <span key={i} className="pb-1 text-[11px] font-semibold text-muted-foreground">
            {tr(w)}
          </span>
        ))}
        {days.slice(0, weeks * 7).map((d) => {
          const inMonth = d.slice(0, 7) === month.slice(0, 7)
          const known = free !== null && d in free
          const left = known ? (free as Record<string, number>)[d] : null
          const out = d < min || d > max
          const disabled = out || (left !== null && left <= 0)
          const near = left !== null && left > 0 && left < Math.max(1, capacity * 0.2)
          const selected = d === value
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => onChange(d)}
              aria-pressed={selected}
              className={cn(
                'flex min-h-[3rem] flex-col items-center justify-center rounded-xl text-sm font-bold tabular-nums transition-colors',
                !inMonth && 'invisible',
                selected ? 'bg-primary text-primary-foreground' : disabled ? 'text-muted-foreground/40' : 'hover:bg-secondary',
              )}
            >
              {Number(d.slice(8))}
              {!disabled && left !== null && (
                wholeDay ? (
                  <span className={cn('text-[10px] font-semibold leading-tight', selected ? 'opacity-90' : near ? 'text-amber-600' : 'text-accent')}>
                    {tr(c.left).replace('{n}', String(left))}
                  </span>
                ) : (
                  <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', selected ? 'bg-primary-foreground' : near ? 'bg-amber-500' : 'bg-accent')} />
                )
              )}
              {!out && left === 0 && <span className="text-[10px] font-normal leading-tight">{tr(c.full)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
