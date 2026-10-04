'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { shiftErrors, timeCopy } from '@/lib/console/copy'
import { fill } from '@/lib/check-in/copy'
import type { ShiftTemplate } from '@/lib/console/shift-math'
import { setAssignmentRange } from '@/app/console/time/shift-actions'
import { TIME_PATH } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'

// Roster › "Plan a date range": pick people, tap a first and last day on a
// month calendar, keep only some weekdays, choose a shift → one save.
const WEEK = [1, 2, 3, 4, 5, 6, 0] // Monday first, like the roster
const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (s: string) => new Date(`${s}T00:00:00Z`)
// The Monday of the week a day falls in (the roster's weeks start Monday).
const mondayOf = (s: string) => {
  const d = utc(s)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return iso(d)
}

export function RangePlanner({
  staff,
  templates,
  today,
}: {
  staff: { id: string; name: string }[]
  templates: ShiftTemplate[]
  today: string
}) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [who, setWho] = useState<Set<string>>(new Set())
  const [days, setDays] = useState<Set<number>>(new Set(WEEK))
  const [value, setValue] = useState(templates[0]?.id ?? 'off')
  const [overwrite, setOverwrite] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; nextWeek?: string } | null>(null)

  const dayName = (wd: number) =>
    new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + wd)))
  const monthLabel = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(`${month}-01`))

  // Monday-first grid for the month.
  const cells = useMemo(() => {
    const first = utc(`${month}-01`)
    const lead = (first.getUTCDay() + 6) % 7
    const out: (string | null)[] = Array(lead).fill(null)
    for (const d = new Date(first); d.getUTCMonth() === first.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1)) out.push(iso(d))
    return out
  }, [month])

  const shiftMonth = (n: number) => {
    const d = utc(`${month}-01`)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(iso(d).slice(0, 7))
  }

  const tap = (d: string) => {
    setMsg(null)
    if (!from || to) {
      setFrom(d)
      setTo(null)
    } else if (d < from) {
      setFrom(d)
    } else {
      setTo(d)
    }
  }
  const end = to ?? from
  const inRange = (d: string) => Boolean(from && end && d >= from && d <= end)
  const count = useMemo(() => {
    if (!from || !end) return 0
    let n = 0
    for (const d = utc(from); iso(d) <= end; d.setUTCDate(d.getUTCDate() + 1)) if (days.has(d.getUTCDay())) n++
    return n
  }, [from, end, days])

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  const apply = () =>
    start(async () => {
      if (!from || !end) return
      const r = await setAssignmentRange({ staffIds: [...who], from, to: end, weekdays: [...days], value, overwrite })
      if (!r.ok) {
        setMsg({ ok: false, text: tr(shiftErrors[r.error] ?? shiftErrors.failed) })
        return
      }
      const n = r.count ?? 0
      if (n === 0) {
        setMsg({ ok: true, text: tr(timeCopy.planNothing) })
        return
      }
      const fmt = (d: string) =>
        new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(d))
      const range = from === end ? fmt(from) : `${fmt(from)} – ${fmt(end)}`
      const week = mondayOf(from)
      const next = new Date(utc(week).getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
      setMsg({
        ok: true,
        text: fill(tr(who.size > 1 ? timeCopy.planSavedMany : timeCopy.planSaved), { n, range }),
        nextWeek: end >= next ? next : undefined,
      })
      // Show the week the plan starts in, so the saved shifts are on screen.
      router.push(`${TIME_PATH}?week=${week}&view=roster`)
      router.refresh()
    })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        <CalendarRange className="h-4 w-4" aria-hidden="true" />
        {tr(timeCopy.planRange)}
      </button>
    )
  }

  const chip = (on: boolean) =>
    cn('rounded-full border px-3 py-1.5 text-xs font-semibold', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background')

  return (
    <div className="mt-3 w-full rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{tr(timeCopy.planRange)}</p>
          <p className="text-xs text-muted-foreground">{tr(timeCopy.planRangeHint)}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="×" className="text-muted-foreground">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* Calendar */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-border" aria-label="‹">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold">{monthLabel}</span>
            <button type="button" onClick={() => shiftMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-border" aria-label="›">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
            {WEEK.map((wd) => (
              <span key={wd}>{dayName(wd)}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) =>
              d ? (
                <button
                  key={d}
                  type="button"
                  onClick={() => tap(d)}
                  className={cn(
                    'h-9 rounded-lg text-sm tabular-nums',
                    d === from || d === end
                      ? 'bg-primary font-bold text-primary-foreground'
                      : inRange(d)
                        ? days.has(utc(d).getUTCDay())
                          ? 'bg-primary/15 font-semibold text-foreground'
                          : 'bg-primary/5 text-muted-foreground line-through'
                        : 'hover:bg-secondary',
                    d === today && !inRange(d) && 'ring-1 ring-primary',
                  )}
                >
                  {Number(d.slice(8))}
                </button>
              ) : (
                <span key={`b${i}`} />
              ),
            )}
          </div>
        </div>

        {/* Who / which days / what */}
        <div className="space-y-4 text-sm">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{tr(timeCopy.planWho)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setWho(who.size === staff.length ? new Set() : new Set(staff.map((s) => s.id)))} className={chip(who.size === staff.length && staff.length > 0)}>
                {tr(timeCopy.planAll)}
              </button>
              {staff.map((s) => (
                <button key={s.id} type="button" onClick={() => setWho(toggle(who, s.id))} className={chip(who.has(s.id))}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{tr(timeCopy.planDays)}</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEK.map((wd) => (
                <button key={wd} type="button" onClick={() => setDays(toggle(days, wd))} className={cn(chip(days.has(wd)), 'min-w-11')}>
                  {dayName(wd)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="plan-shift" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              {tr(timeCopy.planShift)}
            </label>
            <select
              id="plan-shift"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.start}–{t.end}
                </option>
              ))}
              <option value="off">{tr(timeCopy.dayOff)}</option>
              <option value="">{tr(timeCopy.planClear)}</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="h-4 w-4 accent-primary" />
            {tr(timeCopy.planOverwrite)}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={apply}
              disabled={pending || !from || count === 0 || who.size === 0}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {pending && <Spinner className="h-4 w-4" />}
              {from ? fill(tr(timeCopy.planApply), { d: count, p: who.size }) : tr(timeCopy.planPickRange)}
            </button>
            {msg && (
              <span className={cn('text-sm font-semibold', msg.ok ? 'text-accent' : 'text-destructive')}>
                {msg.text}
                {msg.nextWeek && (
                  <a href={`${TIME_PATH}?week=${msg.nextWeek}&view=roster`} className="ml-2 text-primary underline">
                    {tr(timeCopy.planNextWeek)}
                  </a>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
