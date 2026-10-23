'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { formatMemberDate, formatMemberNo } from '@/lib/format-date'
import { BOOKINGS_PATH, MEMBERS_PATH } from '@/lib/auth/roles'
import {
  addDays,
  bkCopy as c,
  gridStart,
  shiftMonth,
  bkErrors,
  bkkHm,
  timeRange,
  reasonText,
  type EmptyReason,
  isLate,
  statusLabel,
  typeName,
  who,
  type Booking,
  type BookingCategory,
  type BookingTemplate,
  type DayLoad,
  type BookingStatus,
  type BookingType,
  type NoShowRules,
  type NoShowStatus,
  type Slot,
} from '@/lib/booking'
import type { BookingStats } from '@/lib/console/booking'
import {
  bookingDetail,
  findMembers,
  moveBooking,
  pardonMember,
  setBookingStatus,
  staffBook,
  staffDays,
  staffSlots,
  type MemberPick,
} from '@/app/console/bookings/actions'
import { BookingSetup } from '@/components/console/booking-setup'
import { MonthPicker } from '@/components/booking/month-picker'
import { cn } from '@/lib/utils'

export type BookingsTab = 'month' | 'day' | 'list' | 'stats' | 'setup'

const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'
const input = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary'

export const statusClass: Record<BookingStatus, string> = {
  booked: 'bg-primary/10 text-primary',
  arrived: 'bg-accent/15 text-accent',
  cancelled: 'bg-muted text-muted-foreground',
  no_show: 'bg-destructive/10 text-destructive',
}

function useNow(): number {
  const [now, setNow] = useState(0)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function BookingsView({
  tab,
  admin,
  setUp,
  types,
  categories = [],
  templates = [],
  bookings,
  day,
  today,
  month = `${today.slice(0, 7)}-01`,
  load = null,
  range,
  rules,
  stats,
  staff,
  products,
}: {
  tab: BookingsTab
  admin: boolean
  setUp: boolean
  types: BookingType[]
  categories?: BookingCategory[]
  templates?: BookingTemplate[]
  bookings: Booking[]
  day: string
  today: string
  month?: string
  load?: Record<string, DayLoad> | null
  range: { from: string; to: string }
  rules: NoShowRules
  stats: BookingStats | null
  staff: { id: string; name: string }[]
  products: { id: string; name: string; active: boolean }[]
}) {
  const { tr, lang } = useLanguage()
  const [open, setOpen] = useState<Booking | null>(null)
  const [form, setForm] = useState<{ move?: Booking; day?: string; typeId?: string } | null>(null)
  const date = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d
  const tabs: { key: BookingsTab; label: { th: string; en: string } }[] = [
    { key: 'month', label: c.tabMonth },
    { key: 'day', label: c.tabDay },
    { key: 'list', label: c.tabList },
    ...(admin ? ([{ key: 'stats', label: c.tabStats }, { key: 'setup', label: c.tabSetup }] as const) : []),
  ]
  const activeTypes = types.filter((t) => t.active)

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-display text-2xl font-extrabold md:text-3xl">{tr(c.title)}</h1>
        <div className="inline-flex max-w-full overflow-x-auto whitespace-nowrap rounded-full bg-secondary p-1 text-sm font-semibold" role="tablist">
          {tabs.map((t) => (
            <Link
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              href={t.key === 'month' ? BOOKINGS_PATH : `${BOOKINGS_PATH}?tab=${t.key}`}
              className={cn('shrink-0 rounded-full px-3.5 py-1.5', tab === t.key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {tr(t.label)}
            </Link>
          ))}
        </div>
        {setUp && activeTypes.length > 0 && (tab === 'month' || tab === 'day' || tab === 'list') && (
          <button
            type="button"
            onClick={() => setForm({})}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {tr(c.newBooking)}
          </button>
        )}
      </div>

      {!setUp ? (
        <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>
      ) : tab === 'setup' ? (
        <BookingSetup types={types} categories={categories} templates={templates} rules={rules} staff={staff} products={products} />
      ) : types.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">{tr(c.noTypes)}</p>
      ) : tab === 'stats' ? (
        <Stats stats={stats} range={range} rules={rules} />
      ) : tab === 'month' ? (
        <MonthView types={types} load={load} month={month} today={today} date={date} onBook={(d, typeId) => setForm({ day: d, typeId })} />
      ) : tab === 'list' ? (
        <ListView bookings={bookings} range={range} date={date} rules={rules} onOpen={setOpen} />
      ) : (
        <DayView types={types} bookings={bookings} day={day} today={today} date={date} rules={rules} onOpen={setOpen} />
      )}

      {open && (
        <BookingPanel
          b={open}
          admin={admin}
          rules={rules}
          onClose={() => setOpen(null)}
          onMove={() => {
            setForm({ move: open })
            setOpen(null)
          }}
        />
      )}
      {form && <BookForm types={activeTypes} day={form.day ?? (tab === 'day' ? day : today)} typeId={form.typeId} move={form.move} onClose={() => setForm(null)} windowDays={rules.windowDays} />}
    </div>
  )
}

// ---------------- Month (v0.35.8) ----------------

const MWD = [
  { th: 'จ', en: 'Mon' },
  { th: 'อ', en: 'Tue' },
  { th: 'พ', en: 'Wed' },
  { th: 'พฤ', en: 'Thu' },
  { th: 'ศ', en: 'Fri' },
  { th: 'ส', en: 'Sat' },
  { th: 'อา', en: 'Sun' },
]

type Level = 'free' | 'busy' | 'packed' | 'full'
const levelOf = (used: number, cap: number): Level | null =>
  cap <= 0 ? null : used >= cap ? 'full' : used / cap > 0.8 ? 'packed' : used / cap >= 0.5 ? 'busy' : 'free'
const levelBar: Record<Level, string> = { free: 'bg-accent', busy: 'bg-amber-500', packed: 'bg-destructive', full: 'bg-foreground' }
const levelText: Record<Level, string> = { free: 'text-accent', busy: 'text-amber-600', packed: 'text-destructive', full: 'text-foreground' }
const levelCopy: Record<Level, { th: string; en: string }> = { free: c.loadFree, busy: c.loadBusy, packed: c.loadPacked, full: c.loadFull }

function MonthView({
  types,
  load,
  month,
  today,
  date,
  onBook,
}: {
  types: BookingType[]
  load: Record<string, DayLoad> | null
  month: string
  today: string
  date: (d: string) => string
  onBook: (day: string, typeId?: string) => void
}) {
  const { tr, lang } = useLanguage()
  const [only, setOnly] = useState<string>('')
  const [picked, setPicked] = useState<string | null>(null)
  const start = gridStart(month)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const weeks = days[35].slice(0, 7) === month.slice(0, 7) ? 6 : 5
  const title = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}T00:00:00Z`))
  const href = (m: string) => (m.slice(0, 7) === today.slice(0, 7) ? BOOKINGS_PATH : `${BOOKINGS_PATH}?m=${m.slice(0, 7)}`)
  const shownTypes = types.filter((t) => t.active)
  const sum = (d: string) => {
    const l = load?.[d]
    if (!l) return { people: 0, used: 0, cap: 0 }
    if (only) return l.byType[only] ?? { people: 0, used: 0, cap: 0 }
    return Object.values(l.byType).reduce((a, x) => ({ people: a.people + x.people, used: a.used + x.used, cap: a.cap + x.cap }), { people: 0, used: 0, cap: 0 })
  }
  const pickedLoad = picked ? load?.[picked] : null

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(shiftMonth(month, -1))} aria-label={tr(c.prevMonth)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-secondary">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <span className="min-w-[9rem] text-center font-display text-lg font-bold">{title}</span>
        <Link href={href(shiftMonth(month, 1))} aria-label={tr(c.nextMonth)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-secondary">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
        {month.slice(0, 7) !== today.slice(0, 7) && (
          <Link href={BOOKINGS_PATH} className="h-10 rounded-full border border-border px-4 text-sm font-semibold leading-10 hover:bg-secondary">
            {tr(c.thisMonth)}
          </Link>
        )}
      </div>
      {shownTypes.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 text-sm font-semibold">
          {[{ id: '', label: tr(c.allTypes) }, ...shownTypes.map((t) => ({ id: t.id, label: typeName(t, lang) }))].map((x) => (
            <button
              key={x.id || 'all'}
              type="button"
              onClick={() => setOnly(x.id)}
              aria-pressed={only === x.id}
              className={cn('shrink-0 rounded-full border px-3.5 py-1.5', only === x.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary')}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
      {load === null ? (
        <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.monthFailed)}</p>
      ) : (
        <div className={cn(card, 'p-2 md:p-3')}>
          <div className="grid grid-cols-7 gap-1 text-center md:gap-1.5">
            {MWD.map((w, i) => (
              <span key={i} className="pb-1 text-[11px] font-semibold text-muted-foreground md:text-xs">
                {tr(w)}
              </span>
            ))}
            {days.slice(0, weeks * 7).map((d) => {
              const inMonth = d.slice(0, 7) === month.slice(0, 7)
              const x = sum(d)
              const lv = levelOf(x.used, x.cap)
              const pct = x.cap ? Math.min(100, Math.round((x.used / x.cap) * 100)) : 0
              const closed = !lv && x.people === 0
              // "All": one item can be full while the day as a whole isn't.
              const someFull = !only && lv !== 'full' && Object.values(load?.[d]?.byType ?? {}).some((y) => y.cap > 0 && y.used >= y.cap)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPicked(d === picked ? null : d)}
                  aria-pressed={d === picked}
                  title={lv ? `${tr(levelCopy[lv])} · ${tr(c.pctFull).replace('{p}', String(pct))}` : tr(c.notOpen)}
                  className={cn(
                    'flex min-h-[3.75rem] flex-col items-stretch rounded-xl border p-1 text-left transition-colors md:min-h-[5.5rem] md:p-2',
                    d === picked ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-secondary',
                    d === today && d !== picked && 'border-primary/50',
                    !inMonth && 'opacity-40',
                    closed && 'bg-muted/40',
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className={cn('text-xs font-bold tabular-nums md:text-sm', d === today && 'text-primary', closed && 'text-muted-foreground/60')}>{Number(d.slice(8))}</span>
                    {someFull && <span className="h-2 w-2 rounded-full bg-foreground" title={tr(c.someFull)} aria-label={tr(c.someFull)} />}
                  </span>
                  <span className="mt-auto flex flex-col gap-1">
                    {x.people > 0 && (
                      <span className={cn('text-center font-display text-base font-extrabold tabular-nums leading-none md:text-left md:text-xl', lv ? levelText[lv] : 'text-foreground')}>
                        {x.people}
                        <span className="ml-0.5 hidden text-xs font-semibold text-muted-foreground md:inline">{lang === 'en' ? '' : 'คน'}</span>
                      </span>
                    )}
                    {lv ? (
                      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                        <span className={cn('block h-full rounded-full', levelBar[lv])} style={{ width: `${Math.max(pct, 6)}%` }} />
                      </span>
                    ) : (
                      <span className="hidden text-[10px] font-semibold text-muted-foreground/70 md:block">{tr(c.notOpen)}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs font-semibold text-muted-foreground">
            {(['free', 'busy', 'packed', 'full'] as Level[]).map((l) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2 w-4 rounded-full', levelBar[l])} aria-hidden="true" />
                {tr(levelCopy[l])}
                <span className="font-normal">{l === 'free' ? '<50%' : l === 'busy' ? '50–80%' : l === 'packed' ? '>80%' : '100%'}</span>
              </span>
            ))}
            {!only && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-foreground" aria-hidden="true" />
                {tr(c.someFull)}
              </span>
            )}
          </div>
        </div>
      )}
      {picked && (
        <section className={card}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-display text-base font-bold">{date(picked)}</h2>
            <Link href={`${BOOKINGS_PATH}?tab=day&d=${picked}`} className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold hover:bg-secondary">
              {tr(c.openDay)}
            </Link>
            {picked >= today && (
              <button
                type="button"
                onClick={() => onBook(picked, only || undefined)}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {tr(c.bookOn)}
              </button>
            )}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {shownTypes
              .filter((t) => !only || t.id === only)
              .map((t) => {
                const x = pickedLoad?.byType[t.id]
                const lv = x ? levelOf(x.used, x.cap) : null
                const pct = x && x.cap ? Math.min(100, Math.round((x.used / x.cap) * 100)) : 0
                return (
                  <li key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                    <span className="truncate font-semibold">{typeName(t, lang)}</span>
                    <span className={cn('text-right font-semibold tabular-nums', lv ? levelText[lv] : 'text-muted-foreground')}>
                      {!x || (!lv && !x.people) ? tr(c.notOpen) : `${tr(c.people).replace('{n}', String(x.people))}${lv ? ` · ${tr(c.pctFull).replace('{p}', String(pct))}` : ''}`}
                    </span>
                    {lv && (
                      <span className="col-span-2 block h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                        <span className={cn('block h-full rounded-full', levelBar[lv])} style={{ width: `${Math.max(pct, 3)}%` }} />
                      </span>
                    )}
                  </li>
                )
              })}
          </ul>
        </section>
      )}
    </>
  )
}

// ---------------- Day ----------------

function DayView({
  types,
  bookings,
  day,
  today,
  date,
  rules,
  onOpen,
}: {
  types: BookingType[]
  bookings: Booking[]
  day: string
  today: string
  date: (d: string) => string
  rules: NoShowRules
  onOpen: (b: Booking) => void
}) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const go = (d: string) => router.push(d === today ? `${BOOKINGS_PATH}?tab=day` : `${BOOKINGS_PATH}?tab=day&d=${d}`)
  const live = bookings.filter((b) => b.status !== 'cancelled')
  const gone = bookings.filter((b) => b.status === 'cancelled')
  const shown = types.filter((t) => t.active || live.some((b) => b.typeId === t.id))
  const total = live.reduce((n, b) => n + b.party, 0)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => go(addDays(day, -1))} aria-label={tr(c.prev)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-secondary">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <input type="date" value={day} onChange={(e) => e.target.value && go(e.target.value)} className="h-10 rounded-full border border-border bg-background px-3 text-sm" />
        <button type="button" onClick={() => go(addDays(day, 1))} aria-label={tr(c.next)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-secondary">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        {day !== today && (
          <button type="button" onClick={() => go(today)} className="h-10 rounded-full border border-border px-4 text-sm font-semibold hover:bg-secondary">
            {tr(c.today)}
          </button>
        )}
        <p className="ml-1 text-sm text-muted-foreground">
          <b className="text-foreground">{date(day)}</b> · {live.length} {tr(c.tabList)} · {tr(c.people).replace('{n}', String(total))}
        </p>
      </div>

      {live.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tr(c.nothing)}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {shown.map((t) => {
          const mine = live.filter((b) => b.typeId === t.id).sort((a, b) => (a.arriveTime ?? '99').localeCompare(b.arriveTime ?? '99') || a.start.localeCompare(b.start))
          if (!mine.length) return null
          const lanes = t.resources.length
            ? [...t.resources.filter((r) => r.active || mine.some((b) => b.resourceId === r.id)).map((r) => ({ id: r.id as string | null, label: r.label })), ...(mine.some((b) => !b.resourceId) ? [{ id: null, label: '—' }] : [])]
            : [{ id: null, label: '' }]
          return (
            <section key={t.id} className={cn(card, 'min-w-0')}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <h2 className="font-display text-lg font-bold">{typeName(t, lang)}</h2>
                <span className="text-xs text-muted-foreground">
                  {t.wholeDay
                    ? `${tr(c.allDay)} · ${mine.reduce((n, b) => n + b.party, 0)}/${t.capacity}`
                    : `${tr(c.min).replace('{n}', String(t.durationMin))} · ${tr(c.placesPer).replace('{n}', String(t.capacity))}`}
                </span>
              </div>
              <div className="mt-2 divide-y divide-border">
                {lanes.map((lane) => {
                  const list = mine.filter((b) => (t.resources.length ? b.resourceId === lane.id : true))
                  if (!list.length && !lane.label) return null
                  return (
                    <div key={lane.id ?? 'pool'} className="py-2">
                      {lane.label && <p className="mb-1 text-xs font-semibold text-muted-foreground">{lane.label}</p>}
                      {list.length === 0 ? (
                        <p className="text-xs text-muted-foreground">—</p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {list.map((b) => (
                            <li key={b.id}>
                              <BookingChip b={b} rules={rules} onOpen={onOpen} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {gone.length > 0 && (
        <details className="rounded-2xl border border-border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-muted-foreground">
            {tr(statusLabel.cancelled)} {gone.length}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {gone.map((b) => (
              <li key={b.id}>
                <BookingChip b={b} rules={rules} onOpen={onOpen} withType />
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function BookingChip({ b, rules, onOpen, withType = false }: { b: Booking; rules: NoShowRules; onOpen: (b: Booking) => void; withType?: boolean }) {
  const { tr } = useLanguage()
  const now = useNow()
  const late = now > 0 && isLate(b, rules.lateMin, now)
  return (
    <button
      type="button"
      onClick={() => onOpen(b)}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40',
        late ? 'border-amber-500/60 bg-amber-500/10' : 'border-border bg-background',
        (b.status === 'cancelled' || b.status === 'no_show') && 'opacity-70',
      )}
    >
      <span className="w-[5.5rem] shrink-0 font-semibold tabular-nums">
        {b.wholeDay ? (
          b.arriveTime ? (
            <>
              ~{b.arriveTime}
              <span className="block text-[10px] font-normal text-muted-foreground">{tr(c.allDay)}</span>
            </>
          ) : (
            tr(c.allDay)
          )
        ) : (
          <>
            {bkkHm(b.start)}
            <span className="text-xs font-normal text-muted-foreground">–{bkkHm(b.end)}</span>
          </>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {who(b)}
          {b.party > 1 && <span className="font-normal text-muted-foreground"> · {tr(c.people).replace('{n}', String(b.party))}</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {withType ? `${tr(b.typeName)} · ` : ''}
          {b.memberNo ? formatMemberNo(b.memberNo) : b.memberId ? tr(c.member) : tr(c.guest)}
          {b.note ? ` · ${b.note}` : ''}
        </span>
      </span>
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', late ? 'bg-amber-500 text-white' : statusClass[b.status])}>
        {late ? tr(c.late) : b.movedTo ? tr(c.moved) : tr(statusLabel[b.status])}
      </span>
    </button>
  )
}

// ---------------- List ----------------

function ListView({
  bookings,
  range,
  date,
  rules,
  onOpen,
}: {
  bookings: Booking[]
  range: { from: string; to: string }
  date: (d: string) => string
  rules: NoShowRules
  onOpen: (b: Booking) => void
}) {
  const { tr } = useLanguage()
  const [hideCancelled, setHide] = useState(true)
  const shown = bookings.filter((b) => !hideCancelled || b.status !== 'cancelled')
  const days = [...new Set(shown.map((b) => b.day))]
  return (
    <>
      <form action={BOOKINGS_PATH} className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="tab" value="list" />
        <input type="date" name="from" defaultValue={range.from} className="h-10 rounded-full border border-border bg-background px-3" />
        <span className="text-muted-foreground">{tr(c.to)}</span>
        <input type="date" name="to" defaultValue={range.to} className="h-10 rounded-full border border-border bg-background px-3" />
        <button type="submit" className="h-10 rounded-full border border-border px-4 font-semibold hover:bg-secondary">
          {tr(c.show)}
        </button>
        <label className="ml-2 inline-flex items-center gap-2 font-semibold text-muted-foreground">
          <input type="checkbox" checked={hideCancelled} onChange={(e) => setHide(e.target.checked)} className="h-4 w-4" />
          {tr(statusLabel.cancelled)} ✕
        </label>
      </form>
      {days.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tr(c.nothingRange)}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((d) => (
            <section key={d} className={card}>
              <Link href={`${BOOKINGS_PATH}?tab=day&d=${d}`} className="font-display text-base font-bold hover:underline">
                {date(d)}
              </Link>
              <ul className="mt-2 flex flex-col gap-1.5">
                {shown
                  .filter((b) => b.day === d)
                  .map((b) => (
                    <li key={b.id}>
                      <BookingChip b={b} rules={rules} onOpen={onOpen} withType />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------- One booking ----------------

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { tr } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={tr(c.close)} className="rounded-full p-1.5 hover:bg-secondary">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}

export function NoShowNote({ s, rules }: { s: NoShowStatus | null; rules: NoShowRules }) {
  const { tr, lang } = useLanguage()
  if (!s || s.score <= 0) return null
  const text = tr(s.level === 'ok' ? c.history : c.warnNoShow)
    .replace('{s}', String(s.score))
    .replace('{d}', String(rules.windowDays))
  return (
    <p className={cn('flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold', s.level === 'ok' ? 'bg-secondary text-muted-foreground' : 'bg-amber-500/15 text-amber-900 dark:text-amber-200')}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {text}
        {s.blockedUntil && ` · ${tr(c.blockedUntil).replace('{d}', formatMemberDate(`${s.blockedUntil}T12:00:00+07:00`, lang, true) ?? s.blockedUntil)}`}
      </span>
    </p>
  )
}

function BookingPanel({ b, admin, rules, onClose, onMove }: { b: Booking; admin: boolean; rules: NoShowRules; onClose: () => void; onMove: () => void }) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [noShow, setNoShow] = useState<NoShowStatus | null>(null)
  const now = useNow()
  useEffect(() => {
    if (b.memberId) void bookingDetail(b.id).then((r) => r.ok && setNoShow(r.data.noShow))
  }, [b.id, b.memberId])
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (r.ok) {
        router.refresh()
        onClose()
      } else setError((r as { error: string }).error)
    })
  const late = now > 0 && isLate(b, rules.lateMin, now)
  const started = now > 0 && now >= Date.parse(b.start)
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 flex-1 font-semibold">{v}</span>
    </div>
  )
  const btn = 'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold disabled:opacity-40'

  return (
    <Panel title={tr(b.typeName)} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', late ? 'bg-amber-500 text-white' : statusClass[b.status])}>
          {late ? tr(c.late) : b.movedTo ? tr(c.moved) : tr(statusLabel[b.status])}
        </span>
        {b.lateCancel && <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300">{tr(c.lateCancel)}</span>}
        {b.noShowAuto && <span className="text-xs text-muted-foreground">{tr(c.autoNoShow)}</span>}
      </div>
      <div className="mt-3 divide-y divide-border">
        {row(tr(c.when), `${formatMemberDate(`${b.day}T12:00:00+07:00`, lang, true) ?? b.day} · ${timeRange(b, tr(c.allDay))}`)}
        {b.resourceLabel && row(tr(c.whoServes), b.resourceLabel)}
        {row(
          b.memberId ? tr(c.member) : tr(c.guest),
          b.memberId ? (
            <Link href={`${MEMBERS_PATH}/${b.memberId}`} className="underline">
              {who(b)} {b.memberNo && <span className="font-normal text-muted-foreground">{formatMemberNo(b.memberNo)}</span>}
            </Link>
          ) : (
            <>
              {who(b)} {b.guestPhone && <a href={`tel:${b.guestPhone}`} className="font-normal underline">{b.guestPhone}</a>}
            </>
          ),
        )}
        {b.party > 1 && row(tr(c.party), tr(c.people).replace('{n}', String(b.party)))}
        {b.note && row(tr(c.note), b.note)}
        {row('', <span className="text-xs font-normal text-muted-foreground">{b.source === 'member' ? tr(c.byMember) : tr(c.bookedBy).replace('{n}', b.createdByName ?? '—')}</span>)}
      </div>
      {noShow && (
        <div className="mt-3 flex flex-col gap-2">
          <NoShowNote s={noShow} rules={rules} />
          {admin && noShow.score > 0 && (
            <button type="button" disabled={pending} onClick={() => act(() => pardonMember(b.memberId as string))} className="self-start text-xs font-semibold text-primary underline">
              {tr(c.pardon)}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{tr(bkErrors[error] ?? bkErrors.failed)}</p>}

      {!b.movedTo && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          {b.status === 'booked' && (
            <>
              <button type="button" disabled={pending} onClick={() => act(() => setBookingStatus(b.id, 'arrived'))} className={cn(btn, 'bg-accent text-white')}>
                {tr(c.markArrived)}
              </button>
              <button type="button" disabled={pending || !started} onClick={() => act(() => setBookingStatus(b.id, 'no_show'))} className={cn(btn, 'border border-destructive/40 text-destructive')}>
                {tr(c.markNoShow)}
              </button>
              <button type="button" disabled={pending} onClick={onMove} className={cn(btn, 'border border-border')}>
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                {tr(c.move)}
              </button>
              <button type="button" disabled={pending} onClick={() => act(() => setBookingStatus(b.id, 'cancelled'))} className={cn(btn, 'border border-border text-muted-foreground')}>
                {tr(c.cancel)}
              </button>
            </>
          )}
          {b.status !== 'booked' && (
            <button type="button" disabled={pending} onClick={() => act(() => setBookingStatus(b.id, 'booked'))} className={cn(btn, 'col-span-2 border border-border')}>
              {tr(c.undo)}
            </button>
          )}
        </div>
      )}
      {pending && <Spinner className="mx-auto mt-4 h-5 w-5 text-primary" />}
    </Panel>
  )
}

// ---------------- New booking / move ----------------

function BookForm({
  types,
  day: startDay,
  typeId: startType,
  move,
  onClose,
  windowDays = 60,
  // Injected only by design previews.
  api = { staffSlots, staffBook, moveBooking, findMembers, staffDays },
}: {
  types: BookingType[]
  day: string
  typeId?: string
  move?: Booking
  onClose: () => void
  windowDays?: number
  api?: { staffSlots: typeof staffSlots; staffBook: typeof staffBook; moveBooking: typeof moveBooking; findMembers: typeof findMembers; staffDays?: typeof staffDays }
}) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [typeId, setTypeId] = useState(move?.typeId ?? (types.some((t) => t.id === startType) ? startType! : types[0]?.id ?? ''))
  const [day, setDay] = useState(move?.day ?? startDay)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [closed, setClosed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [resourceId, setResourceId] = useState<string | null>(null)
  const [party, setParty] = useState(move?.party ?? 1)
  const [mode, setMode] = useState<'member' | 'guest'>('member')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<MemberPick[] | null>(null)
  const [member, setMember] = useState<MemberPick | null>(null)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [note, setNote] = useState('')
  const [arrive, setArrive] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const type = types.find((t) => t.id === typeId) ?? null

  useEffect(() => {
    if (!typeId || !day) return
    let alive = true
    setLoading(true)
    setSlot(null)
    setResourceId(null)
    setArrive(null)
    void api.staffSlots(typeId, day, move?.id).then((r) => {
      if (!alive) return
      setLoading(false)
      if (r.ok) {
        setSlots(r.data.slots)
        setClosed(r.data.closed)
        setReason(r.data.reason ?? null)
        const t = types.find((x) => x.id === typeId)
        if (t?.wholeDay && r.data.slots[0] && r.data.slots[0].left > 0) setSlot(r.data.slots[0])
      } else setError(r.error)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, day])

  const freeRes = useMemo(() => (slot ? slot.resources.filter((r) => r.left >= party) : []), [slot, party])
  // Places left per day for the month on screen.
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  const [reason, setReason] = useState<EmptyReason | null>(null)
  const [shownMonth, setShownMonth] = useState(`${day.slice(0, 7)}-01`)
  const [free, setFree] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    if (!typeId) return
    let alive = true
    void api.staffDays?.(typeId, gridStart(shownMonth), 42).then((r) => alive && r.ok && setFree(r.data))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, shownMonth])

  // "Next free day" when this one has nothing.
  const [seeking, setSeeking] = useState(false)
  const findNext = () => {
    setSeeking(true)
    void staffDays(typeId, addDays(day, 1), 30).then((r) => {
      setSeeking(false)
      const d = r.ok ? Object.keys(r.data).sort().find((k) => r.data[k] >= party) : undefined
      if (d) setDay(d)
      else setError('no_free')
    })
  }
  const canBook = Boolean(type && slot && slot.left >= party && (move || (mode === 'member' ? member : guestName.trim())))

  const search = () =>
    start(async () => {
      const r = await api.findMembers(q)
      if (r.ok) setHits(r.data)
      else setError(r.error)
    })

  const submit = () =>
    start(async () => {
      if (!type || !slot) return
      setError(null)
      const r = move
        ? await api.moveBooking(move.id, slot.start, resourceId)
        : await api.staffBook({
            typeId: type.id,
            start: slot.start,
            resourceId,
            party,
            memberId: mode === 'member' ? (member?.id ?? null) : null,
            guestName,
            guestPhone,
            note,
            arriveTime: arrive,
          })
      if (r.ok) {
        router.refresh()
        onClose()
      } else {
        setError(r.error)
        if (r.error === 'slot_full') void api.staffSlots(typeId, day, move?.id).then((x) => x.ok && setSlots(x.data.slots))
      }
    })

  const label = 'mb-1 block text-xs font-semibold text-muted-foreground'

  return (
    <Panel title={tr(move ? c.move : c.newBooking)} onClose={onClose}>
      {move && (
        <p className="mb-4 rounded-xl bg-secondary px-3 py-2 text-sm">
          <b>{who(move)}</b> · {move.wholeDay ? `${move.day} ${tr(c.allDay)}` : bkkHm(move.start)} → ?
        </p>
      )}
      {!move && (
        <>
          <span className={label}>{tr(c.what)}</span>
          <div className="mb-4 flex flex-wrap gap-2">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTypeId(t.id)
                  setParty(1)
                }}
                className={cn('rounded-full border px-3.5 py-1.5 text-sm font-semibold', typeId === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary')}
              >
                {typeName(t, lang)}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mb-4">
        <span className={label}>{tr(c.when)}</span>
        {type && (
          <MonthPicker
            value={day}
            onChange={setDay}
            free={free}
            min={todayStr}
            max={addDays(todayStr, 365)}
            capacity={type.capacity}
            wholeDay={type.wholeDay}
            onMonth={(m) => setShownMonth(m)}
            showCounts
          />
        )}
      </div>

      <span className={label}>{tr(c.time)}</span>
      {loading ? (
        <Spinner className="my-3 h-5 w-5 text-primary" />
      ) : closed || !slots || slots.length === 0 || slots.every((s) => s.left < party) ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{reason ? reasonText(reason, tr) : tr(closed ? c.closedDay : c.noSlots)}</p>
          <button type="button" disabled={seeking} onClick={findNext} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40">
            {seeking && <Spinner className="h-3 w-3" />}
            {tr(c.nextFree)} →
          </button>
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((s) => {
            const full = s.left < party
            return (
              <button
                key={s.start}
                type="button"
                disabled={full}
                onClick={() => {
                  setSlot(s)
                  setResourceId(null)
                }}
                className={cn(
                  'rounded-xl border px-2 py-2 text-center text-sm font-semibold tabular-nums',
                  slot?.start === s.start ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/40',
                  full && 'opacity-35',
                  !s.time && 'col-span-full',
                )}
              >
                {s.time || tr(c.allDay)}
                <span className="block text-[11px] font-normal opacity-80">{full ? tr(c.full) : tr(c.left).replace('{n}', String(s.left))}</span>
              </button>
            )
          })}
        </div>
      )}


      {slot?.arrivals && (
        <div className="mb-4">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{tr(c.arriveAt)}</span>
          <div className="grid grid-cols-4 gap-2">
            {slot.arrivals.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setArrive(a)}
                className={cn('rounded-xl border py-2 text-center text-sm font-bold tabular-nums', arrive === a ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {type && type.resources.some((r) => r.active) && slot && (
        <label className="mb-4 block">
          <span className={label}>{tr(c.whoServes)}</span>
          <select value={resourceId ?? ''} onChange={(e) => setResourceId(e.target.value || null)} className={input}>
            <option value="">{tr(c.anyone)}</option>
            {freeRes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {!move && type && type.maxParty > 1 && (
        <label className="mb-4 block">
          <span className={label}>{tr(c.party)}</span>
          <select value={party} onChange={(e) => setParty(Number(e.target.value))} className={input}>
            {Array.from({ length: type.maxParty }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}

      {!move && (
        <>
          <div className="mb-2 inline-flex rounded-full bg-secondary p-1 text-sm font-semibold">
            {(['member', 'guest'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-full px-3.5 py-1.5', mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                {tr(m === 'member' ? c.member : c.guest)}
              </button>
            ))}
          </div>
          {mode === 'member' ? (
            member ? (
              <div className="mb-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/40 px-3 py-2 text-sm">
                  <span>
                    <b>{member.name}</b> <span className="text-muted-foreground">{formatMemberNo(member.memberNo)}</span>
                  </span>
                  <button type="button" onClick={() => setMember(null)} aria-label={tr(c.close)} className="text-muted-foreground">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {member.noShow && member.noShow.level !== 'ok' && (
                  <p className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                    {tr(c.warnNoShow).replace('{s}', String(member.noShow.score)).replace('{d}', String(windowDays))}
                  </p>
                )}
              </div>
            ) : (
              <div className="mb-4">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    search()
                  }}
                >
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(c.findMember)} className={input} />
                  <button type="submit" disabled={q.trim().length < 2} aria-label={tr(c.show)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">
                    <Search className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
                {hits && (
                  <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                    {hits.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">—</li>}
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button type="button" onClick={() => setMember(h)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary">
                          <span>
                            <b>{h.name}</b> <span className="text-muted-foreground">{formatMemberNo(h.memberNo)}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">{h.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          ) : (
            <div className="mb-4 grid grid-cols-2 gap-2">
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={tr(c.guestName)} maxLength={80} className={input} />
              <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder={tr(c.guestPhone)} inputMode="tel" maxLength={20} className={input} />
            </div>
          )}
          <label className="mb-4 block">
            <span className={label}>{tr(c.note)}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={input} />
          </label>
        </>
      )}

      {error && <p className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{tr(bkErrors[error] ?? bkErrors.failed)}</p>}
      <button type="button" disabled={!canBook || pending} onClick={submit} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground disabled:opacity-40">
        {pending && <Spinner className="h-5 w-5" />}
        {tr(move ? c.saveMove : c.book)}
      </button>
    </Panel>
  )
}

// ---------------- Stats ----------------

function Stats({ stats, range, rules }: { stats: BookingStats | null; range: { from: string; to: string }; rules: NoShowRules }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—')
  const due = stats ? stats.arrived + stats.noShow : 0
  return (
    <>
      <form action={BOOKINGS_PATH} className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="tab" value="stats" />
        <input type="date" name="from" defaultValue={range.from} className="h-10 rounded-full border border-border bg-background px-3" />
        <span className="text-muted-foreground">{tr(c.to)}</span>
        <input type="date" name="to" defaultValue={range.to} className="h-10 rounded-full border border-border bg-background px-3" />
        <button type="submit" className="h-10 rounded-full border border-border px-4 font-semibold hover:bg-secondary">
          {tr(c.show)}
        </button>
      </form>
      {!stats ? (
        <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{tr(bkErrors.failed)}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(
              [
                [c.stTotal, String(stats.total)],
                [c.stArrived, String(stats.arrived)],
                [c.stNoShow, String(stats.noShow)],
                [c.stRate, pct(stats.noShow, due)],
                [c.stSelf, pct(stats.self, stats.total)],
              ] as [{ th: string; en: string }, string][]
            ).map(([k, v], i) => (
              <div key={i} className={card}>
                <p className="text-xs text-muted-foreground">{tr(k)}</p>
                <p className="mt-1 font-display text-2xl font-extrabold">{v}</p>
              </div>
            ))}
          </div>
          <section className={card}>
            <h2 className="mb-2 font-display text-lg font-bold">{tr(c.stByType)}</h2>
            <div className="-mx-3 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-semibold">{tr(c.what)}</th>
                    <th className="px-3 py-2 text-right font-semibold">{tr(c.stTotal)}</th>
                    <th className="px-3 py-2 text-right font-semibold">{tr(c.stArrived)}</th>
                    <th className="px-3 py-2 text-right font-semibold">{tr(c.stNoShow)}</th>
                    <th className="px-3 py-2 text-right font-semibold">{tr(c.stCancelled)}</th>
                    <th className="px-3 py-2 text-right font-semibold">{tr(c.stRate)}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byType.map((t, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="px-3 py-2 font-semibold">{tr(t.name)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.arrived}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.noShow}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.cancelled}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(t.noShow, t.arrived + t.noShow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {stats.top.length > 0 && (
            <section className={card}>
              <h2 className="mb-1 font-display text-lg font-bold">{tr(c.stTop)}</h2>
              <p className="mb-2 text-xs text-muted-foreground">
                {tr(c.ruleWarn)} {rules.warn} · {tr(c.ruleBlock)} {rules.block}
              </p>
              <ul className="divide-y divide-border">
                {stats.top.map((m) => (
                  <li key={m.memberId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`${MEMBERS_PATH}/${m.memberId}`} className="font-semibold underline">
                      {m.name} <span className="font-normal text-muted-foreground">{formatMemberNo(m.memberNo)}</span>
                    </Link>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{m.noShows}×</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => start(async () => void ((await pardonMember(m.memberId)).ok && router.refresh()))}
                        className="text-xs font-semibold text-primary underline"
                      >
                        {tr(c.pardon)}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  )
}
