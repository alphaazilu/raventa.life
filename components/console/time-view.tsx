'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Download, LogOut, Pencil, Plus } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { timeCopy, timeErrors } from '@/lib/console/copy'
import { TIME_PATH } from '@/lib/auth/roles'
import type { TimeEntry } from '@/lib/console/time'
import { entryStats, isForgotten, minutesOf, type ShiftAssignment, type ShiftTemplate, type TimeSettings } from '@/lib/console/shift-math'
import { RosterGrid, ShiftSettings } from '@/components/console/shift-admin'
import { addEntry, clockOut, editEntry } from '@/app/console/time/actions'
import { cn } from '@/lib/utils'

const TZ = 'Asia/Bangkok'

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary'
const btn =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50'

const forgotten = isForgotten
const toLocal = (iso: string) => new Date(Date.parse(iso) + 7 * 3600 * 1000).toISOString().slice(0, 16)
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function TimeView({
  admin,
  onTablet,
  weekStart,
  today,
  mine,
  myWeek,
  entries,
  open,
  staff,
  loadError,
  view,
  templates,
  shiftsReady,
  assignments,
  settings,
}: {
  admin: boolean
  onTablet: boolean
  weekStart: string
  today: string
  mine: TimeEntry | null
  myWeek: TimeEntry[]
  entries: TimeEntry[]
  open: TimeEntry[]
  staff: { id: string; name: string }[]
  loadError: boolean
  view: 'entries' | 'roster' | 'shifts'
  templates: ShiftTemplate[]
  shiftsReady: boolean
  assignments: ShiftAssignment[]
  settings: TimeSettings
}) {
  const { tr, lang } = useLanguage()
  const tmap = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates])
  const amap = useMemo(() => new Map(assignments.map((a) => [`${a.staffId}|${a.date}`, a])), [assignments])
  const statsOf = (e: TimeEntry, now: number) =>
    entryStats(e, minutesOf(e, now), toLocal(e.clockIn).slice(0, 10), amap.get(`${e.staffId}|${toLocal(e.clockIn).slice(0, 10)}`), tmap, settings)
  const locale = lang === 'th' ? 'th-TH' : 'en-GB'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const fmtTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
  const fmtDur = (min: number) => `${Math.floor(min / 60)} ${tr(timeCopy.hoursShort)} ${String(min % 60).padStart(2, '0')} ${tr(timeCopy.minutesShort)}`
  const weekLabel = `${fmtDay(`${weekStart}T12:00:00+07:00`)} – ${fmtDay(`${addDays(weekStart, 6)}T12:00:00+07:00`)}`
  const isThisWeek = today >= weekStart && today < addDays(weekStart, 7)

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold text-foreground md:text-3xl">{tr(timeCopy.heading)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`${TIME_PATH}?week=${addDays(weekStart, -7)}${view !== 'entries' ? `&view=${view}` : ''}`} aria-label={tr(timeCopy.prevWeek)} className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-primary/40">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <span className="min-w-[11rem] text-center text-sm font-semibold tabular-nums">{isThisWeek ? `${tr(timeCopy.thisWeek)} · ` : ''}{weekLabel}</span>
          <Link href={`${TIME_PATH}?week=${addDays(weekStart, 7)}${view !== 'entries' ? `&view=${view}` : ''}`} aria-label={tr(timeCopy.nextWeek)} className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-primary/40">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {admin && (
            <a href={`/api/console/time?week=${weekStart}`} className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold hover:border-primary/40">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {tr(timeCopy.csv)}
            </a>
          )}
        </div>
      </div>

      {admin && (
        <nav aria-label={tr(timeCopy.heading)} className="flex flex-wrap gap-2">
          {(['entries', 'roster', 'shifts'] as const).map((v) => (
            <Link
              key={v}
              href={`${TIME_PATH}?week=${weekStart}${v === 'entries' ? '' : `&view=${v}`}`}
              aria-current={view === v ? 'page' : undefined}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold',
                view === v ? 'bg-foreground text-background' : 'border border-border text-foreground hover:border-primary/40',
              )}
            >
              {tr(v === 'entries' ? timeCopy.viewEntries : v === 'roster' ? timeCopy.viewRoster : timeCopy.viewShifts)}
            </Link>
          ))}
        </nav>
      )}

      {admin && view !== 'entries' && !shiftsReady && (
        <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr(timeCopy.shiftsNotReady)}
        </div>
      )}

      {loadError && (
        <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr(timeCopy.loadError)}
        </div>
      )}

      {(onTablet || mine) && view === 'entries' && (
        <MyStatus mine={mine} now={now} onTablet={onTablet} fmtTime={fmtTime} fmtDur={fmtDur} lateMinutes={mine ? statsOf(mine, now).lateMinutes : 0} />
      )}

      {!admin && shiftsReady && (
        <MySchedule weekStart={weekStart} today={today} assignments={assignments} tmap={tmap} fmtDay={fmtDay} />
      )}

      {!admin && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">{tr(timeCopy.myWeek)}</h2>
            <span className="text-sm font-semibold tabular-nums">
              {tr(timeCopy.total)} {fmtDur(myWeek.filter((e) => !forgotten(e, now)).reduce((s, e) => s + minutesOf(e, now), 0))}
            </span>
          </div>
          <EntryList entries={myWeek} now={now} fmtDay={fmtDay} fmtTime={fmtTime} fmtDur={fmtDur} />
        </section>
      )}

      {admin && view === 'entries' && (
        <AdminTime entries={entries} open={open} staff={staff} now={now} fmtDay={fmtDay} fmtTime={fmtTime} fmtDur={fmtDur} statsOf={statsOf} />
      )}
      {admin && view === 'roster' && shiftsReady && (
        <RosterGrid weekStart={weekStart} today={today} staff={staff} templates={templates} assignments={assignments} fmtDay={fmtDay} />
      )}
      {admin && view === 'shifts' && shiftsReady && <ShiftSettings templates={templates} settings={settings} />}
    </div>
  )
}

function MyStatus({
  mine,
  now,
  onTablet,
  fmtTime,
  fmtDur,
  lateMinutes,
}: {
  mine: TimeEntry | null
  now: number
  onTablet: boolean
  fmtTime: (iso: string) => string
  fmtDur: (m: number) => string
  lateMinutes: number
}) {
  const { tr } = useLanguage()
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!mine) {
    return (
      <section className="rounded-2xl border border-border bg-secondary p-5 text-sm text-muted-foreground">{tr(timeCopy.notIn)}</section>
    )
  }
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-accent">
          <Clock className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">
            {tr(timeCopy.myStatus)} · {tr(timeCopy.inSince)} <b className="text-foreground tabular-nums">{fmtTime(mine.clockIn)}</b>
            {lateMinutes > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {tr(timeCopy.late)} {lateMinutes} {tr(timeCopy.minutesShort)}
              </span>
            )}
          </p>
          <p className="font-display text-2xl font-extrabold tabular-nums">
            {tr(timeCopy.workedSoFar)} {fmtDur(minutesOf(mine, now))}
          </p>
        </div>
      </div>
      {onTablet && (
        <div className="flex flex-col items-stretch gap-2 md:items-end">
          {!confirm ? (
            <button type="button" onClick={() => setConfirm(true)} className={cn(btn, 'border border-border bg-background text-foreground hover:border-primary/40')}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {tr(timeCopy.clockOut)}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null)
                    const r = await clockOut()
                    if (r && !r.ok) setError(r.error)
                  })
                }
                className={cn(btn, 'bg-primary text-primary-foreground hover:opacity-90')}
              >
                {pending ? <Spinner className="h-4 w-4" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                {tr(timeCopy.clockOutConfirm)} {fmtTime(new Date(now).toISOString())}
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirm(false)} className={cn(btn, 'border border-border')}>
                {tr(timeCopy.cancel)}
              </button>
            </div>
          )}
          <p className="max-w-sm text-xs text-muted-foreground md:text-right">{tr(timeCopy.clockOutHint)}</p>
          {error && <p className="text-sm font-semibold text-destructive">{tr(timeErrors[error] ?? timeErrors.failed)}</p>}
        </div>
      )}
    </section>
  )
}

function EntryList({
  entries,
  now,
  fmtDay,
  fmtTime,
  fmtDur,
}: {
  entries: TimeEntry[]
  now: number
  fmtDay: (iso: string) => string
  fmtTime: (iso: string) => string
  fmtDur: (m: number) => string
}) {
  const { tr } = useLanguage()
  if (entries.length === 0) return <p className="mt-3 text-sm text-muted-foreground">{tr(timeCopy.none)}</p>
  return (
    <ul className="mt-2 divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="w-28 shrink-0 text-muted-foreground">{fmtDay(e.clockIn)}</span>
          <span className="flex-1 tabular-nums">
            {fmtTime(e.clockIn)} – {e.clockOut ? fmtTime(e.clockOut) : <b className="text-accent">{tr(timeCopy.stillIn)}</b>}
          </span>
          <span className="font-semibold tabular-nums">{forgotten(e, now) ? '—' : fmtDur(minutesOf(e, now))}</span>
        </li>
      ))}
    </ul>
  )
}

function AdminTime({
  entries,
  open,
  staff,
  now,
  fmtDay,
  fmtTime,
  fmtDur,
  statsOf,
}: {
  entries: TimeEntry[]
  open: TimeEntry[]
  staff: { id: string; name: string }[]
  now: number
  fmtDay: (iso: string) => string
  fmtTime: (iso: string) => string
  fmtDur: (m: number) => string
  statsOf: (e: TimeEntry, now: number) => ReturnType<typeof entryStats>
}) {
  const { tr } = useLanguage()
  const [editing, setEditing] = useState<string | null>(null)

  const summary = useMemo(() => {
    const m = new Map<string, { name: string; minutes: number; days: Set<string>; flagged: number; late: number; ot: number }>()
    for (const e of entries) {
      const s = m.get(e.staffId) ?? { name: e.name, minutes: 0, days: new Set<string>(), flagged: 0, late: 0, ot: 0 }
      if (forgotten(e, now)) s.flagged++
      else {
        const st = statsOf(e, now)
        s.minutes += st.paidMinutes
        if (st.lateMinutes > 0) s.late++
        s.ot += st.otMinutes
      }
      s.days.add(toLocal(e.clockIn).slice(0, 10))
      m.set(e.staffId, s)
    }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes)
  }, [entries, now, statsOf])

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{tr(timeCopy.inNow)}</h2>
        {open.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{tr(timeCopy.nobodyIn)}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {open.map((e) => {
              const lost = forgotten(e, now)
              return (
                <li
                  key={e.id}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm',
                    lost ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border bg-secondary',
                  )}
                >
                  {lost ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-loading" />}
                  <b>{e.name}</b>
                  <span className="tabular-nums">
                    {fmtDay(e.clockIn)} {fmtTime(e.clockIn)} · {lost ? tr(timeCopy.forgot) : fmtDur(minutesOf(e, now))}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{tr(timeCopy.summary)}</h2>
        {summary.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{tr(timeCopy.none)}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {summary.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="font-semibold">{s.name}</span>
                <span className="flex items-center gap-3 tabular-nums">
                  {s.flagged > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      {s.flagged}
                    </span>
                  )}
                  {s.late > 0 && (
                    <span className="text-xs font-semibold text-amber-700">
                      {tr(timeCopy.late)} {s.late}×
                    </span>
                  )}
                  {s.ot > 0 && (
                    <span className="text-xs font-semibold text-accent">
                      OT {fmtDur(s.ot)}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {s.days.size} {tr(timeCopy.days)}
                  </span>
                  <b>{fmtDur(s.minutes)}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{tr(timeCopy.entries)}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">{tr(timeCopy.colDate)}</th>
                <th className="py-2 pr-3">{tr(timeCopy.colName)}</th>
                <th className="py-2 pr-3">{tr(timeCopy.colShift)}</th>
                <th className="py-2 pr-3">{tr(timeCopy.colIn)}</th>
                <th className="py-2 pr-3">{tr(timeCopy.colOut)}</th>
                <th className="py-2 pr-3">{tr(timeCopy.colHours)}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-muted-foreground">
                    {tr(timeCopy.none)}
                  </td>
                </tr>
              )}
              {entries.map((e) =>
                editing === e.id ? (
                  <tr key={e.id}>
                    <td colSpan={7} className="py-3">
                      <EntryForm entry={e} staff={staff} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr key={e.id} className={cn(forgotten(e, now) && 'bg-destructive/5')}>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground">{fmtDay(e.clockIn)}</td>
                    <td className="py-2.5 pr-3 font-semibold">
                      {e.name}
                      {(e.edited || e.inMethod !== 'card') && (
                        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {e.inMethod === 'admin' ? tr(timeCopy.byAdmin) : e.edited ? tr(timeCopy.edited) : tr(timeCopy.byPassword)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{(() => { const st = statsOf(e, now); return st.shiftName === 'off' ? tr(timeCopy.dayOff) : st.shiftName ?? '—' })()}</td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {fmtTime(e.clockIn)}
                      {statsOf(e, now).lateMinutes > 0 && <span className="ml-1.5 text-xs font-semibold text-amber-700">+{statsOf(e, now).lateMinutes}</span>}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {e.clockOut ? fmtTime(e.clockOut) : forgotten(e, now) ? <b className="text-destructive">{tr(timeCopy.forgot)}</b> : <b className="text-accent">{tr(timeCopy.stillIn)}</b>}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold tabular-nums">
                      {forgotten(e, now) ? '—' : fmtDur(statsOf(e, now).paidMinutes)}
                      {statsOf(e, now).otMinutes > 0 && <span className="ml-1.5 text-xs font-semibold text-accent">OT {fmtDur(statsOf(e, now).otMinutes)}</span>}
                      {statsOf(e, now).earlyMinutes > 0 && <span className="ml-1.5 text-xs font-semibold text-amber-700">{tr(timeCopy.early)} {statsOf(e, now).earlyMinutes}</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      <button type="button" onClick={() => setEditing(e.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        {tr(timeCopy.edit)}
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {tr(timeCopy.add)}
        </h2>
        <div className="mt-3">
          <EntryForm entry={null} staff={staff} onDone={() => {}} />
        </div>
      </section>
    </>
  )
}

function EntryForm({ entry, staff, onDone }: { entry: TimeEntry | null; staff: { id: string; name: string }[]; onDone: () => void }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [staffId, setStaffId] = useState(entry?.staffId ?? '')
  const [inLocal, setIn] = useState(entry ? toLocal(entry.clockIn) : '')
  const [outLocal, setOut] = useState(entry?.clockOut ? toLocal(entry.clockOut) : '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const idp = entry ? `e-${entry.id}` : 'new'

  const submit = () =>
    start(async () => {
      setError(null)
      const r = entry ? await editEntry(entry.id, inLocal, outLocal, reason) : await addEntry(staffId, inLocal, outLocal, reason)
      if (!r.ok) {
        setError(r.error)
        return
      }
      if (!entry) {
        setStaffId('')
        setIn('')
        setOut('')
        setReason('')
      }
      onDone()
      router.refresh()
    })

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault()
        submit()
      }}
      className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1.6fr_auto] md:items-end"
    >
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`${idp}-staff`}>
        {tr(timeCopy.colName)}
        {entry ? (
          <span id={`${idp}-staff`} className="py-2 text-sm text-foreground">
            {entry.name}
          </span>
        ) : (
          <select id={`${idp}-staff`} required value={staffId} onChange={(e) => setStaffId(e.target.value)} className={inputClass}>
            <option value="">{tr(timeCopy.pickStaff)}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`${idp}-in`}>
        {tr(timeCopy.colIn)}
        <input id={`${idp}-in`} type="datetime-local" required value={inLocal} onChange={(e) => setIn(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`${idp}-out`}>
        {tr(timeCopy.colOut)}
        <input id={`${idp}-out`} type="datetime-local" required={!entry} value={outLocal} onChange={(e) => setOut(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`${idp}-reason`}>
        {tr(timeCopy.reason)}
        <input id={`${idp}-reason`} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr(timeCopy.reasonPlaceholder)} className={inputClass} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={cn(btn, 'bg-primary text-primary-foreground hover:opacity-90')}>
          {pending && <Spinner className="h-4 w-4" />}
          {entry ? tr(timeCopy.save) : tr(timeCopy.addButton)}
        </button>
        {entry && (
          <button type="button" onClick={onDone} className={cn(btn, 'border border-border')}>
            {tr(timeCopy.cancel)}
          </button>
        )}
      </div>
      {error && <p className="text-sm font-semibold text-destructive md:col-span-5">{tr(timeErrors[error] ?? timeErrors.failed)}</p>}
    </form>
  )
}


function MySchedule({
  weekStart,
  today,
  assignments,
  tmap,
  fmtDay,
}: {
  weekStart: string
  today: string
  assignments: ShiftAssignment[]
  tmap: Map<string, ShiftTemplate>
  fmtDay: (iso: string) => string
}) {
  const { tr } = useLanguage()
  const byDate = new Map(assignments.map((a) => [a.date, a]))
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{tr(timeCopy.mySchedule)}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => {
          const a = byDate.get(d)
          const t = a?.templateId ? tmap.get(a.templateId) : undefined
          return (
            <li key={d} className={cn('rounded-xl border px-3 py-2.5', d === today ? 'border-primary' : 'border-border')}>
              <p className="text-xs text-muted-foreground">{fmtDay(`${d}T12:00:00+07:00`)}</p>
              <p className="mt-0.5 text-sm font-semibold">{t ? t.name : a?.dayOff ? tr(timeCopy.dayOff) : '—'}</p>
              {t && <p className="text-xs tabular-nums text-muted-foreground">{t.start}–{t.end}</p>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
