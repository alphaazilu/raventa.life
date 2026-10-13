'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, CalendarPlus, CheckCircle2, ChevronLeft, Clock } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { BackLink } from '@/components/account/account-view'
import { formatMemberDate } from '@/lib/format-date'
import { MonthPicker } from '@/components/booking/month-picker'
import { addDays, bkCopy as c, bkErrors, bkkHm, reasonText, timeRange, type EmptyReason, statusLabel, typeName, weekdayOf, WEEKDAYS, type Booking, type BookingKind, type Slot } from '@/lib/booking'
import { memberBook, memberCancel, memberDays, memberSlots } from '@/app/account/booking-actions'
import { cn } from '@/lib/utils'

// My account › Bookings (§34, v0.35).

export type PublicType = {
  id: string
  kind: BookingKind
  categoryId: string | null
  wholeDay: boolean
  pickArrival: boolean
  capacity: number
  nameTh: string
  nameEn: string
  description: string | null
  durationMin: number
  advanceDays: number
  cancelHours: number
  maxParty: number
  resources: { id: string; label: string }[]
}

const card = 'rounded-2xl border border-border bg-card p-4'

export type PublicCategory = { id: string; nameTh: string; nameEn: string; description: string | null; imageUrl: string | null }

export function MemberBooking({
  setUp,
  types,
  categories = [],
  upcoming,
  past,
  cancelHours,
  today,
  blockedUntil,
  warn,
  startType,
  // Injected only by design previews.
  api = { memberSlots, memberBook, memberCancel, memberDays },
}: {
  setUp: boolean
  types: PublicType[]
  categories?: PublicCategory[]
  upcoming: Booking[]
  past: Booking[]
  cancelHours: Record<string, number>
  today: string
  blockedUntil: string | null
  warn: { score: number; block: number; days: number } | null
  startType: string | null
  api?: { memberSlots: typeof memberSlots; memberBook: typeof memberBook; memberCancel: typeof memberCancel; memberDays?: typeof memberDays }
}) {
  const { tr, lang } = useLanguage()
  const [booking, setBooking] = useState<boolean>(Boolean(startType && types.some((t) => t.id === startType)))
  const [done, setDone] = useState(false)
  const date = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d

  if (done)
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto mt-8 h-14 w-14 text-accent" aria-hidden="true" />
        <h1 className="mt-4 font-display text-2xl font-extrabold">{tr(c.booked)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tr(c.bookedSub)}</p>
        <button type="button" onClick={() => setDone(false)} className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground">
          {tr(c.myBookings)}
        </button>
      </div>
    )

  if (booking)
    return (
      <BookFlow
        types={types}
        categories={categories}
        today={today}
        startType={startType}
        api={api}
        onBack={() => setBooking(false)}
        onDone={() => {
          setBooking(false)
          setDone(true)
        }}
      />
    )

  return (
    <>
      <BackLink href="/account" />
      <h1 className="mt-4 font-display text-3xl font-extrabold">{tr(c.myBookings)}</h1>

      {!setUp || types.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tr(bkErrors.not_bookable)}</p>
      ) : blockedUntil ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {tr(bkErrors.blocked)} · {tr(c.blockedUntil).replace('{d}', date(blockedUntil))}
        </p>
      ) : (
        <>
          {warn && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-500/15 p-3 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {lang === 'en'
                ? `You’ve missed ${warn.score} bookings lately — at ${warn.block}, online booking pauses for ${warn.days} days. Please cancel in the app if you can’t come.`
                : `ช่วงนี้ไม่มาตามนัด ${warn.score} ครั้ง — ถ้าถึง ${warn.block} ครั้งจะงดจองผ่านแอป ${warn.days} วัน · ถ้ามาไม่ได้ กดยกเลิกในแอปได้เลย`}
            </p>
          )}
          <button type="button" onClick={() => setBooking(true)} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground">
            <CalendarPlus className="h-5 w-5" aria-hidden="true" />
            {tr(c.bookNow)}
          </button>
        </>
      )}

      <h2 className="mt-8 text-base font-semibold">{tr(c.upcoming)}</h2>
      {upcoming.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{tr(c.noBookings)}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {upcoming.map((b) => (
            <li key={b.id}>
              <UpcomingCard b={b} cancelHours={cancelHours[b.typeId] ?? 0} date={date} cancel={api.memberCancel} />
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mt-8 text-base font-semibold">{tr(c.past)}</h2>
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-4">
            {past.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{tr(b.typeName)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {date(b.day)} · {b.wholeDay ? timeRange(b, tr(c.allDay)) : bkkHm(b.start)}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{b.movedTo ? tr(c.moved) : tr(statusLabel[b.status])}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function UpcomingCard({ b, cancelHours, date, cancel }: { b: Booking; cancelHours: number; date: (d: string) => string; cancel: typeof memberCancel }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [ask, setAsk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  useEffect(() => setNow(Date.now()), [])
  const until = Date.parse(b.start) - cancelHours * 3_600_000
  const late = now > until
  const untilIso = new Date(until).toISOString()
  const untilDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(until))
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-display text-lg font-bold">{tr(b.typeName)}</span>
          <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            {date(b.day)} · {timeRange(b, tr(c.allDay))}
          </span>
          <span className="block text-xs text-muted-foreground">
            {b.resourceLabel ? `${b.resourceLabel} · ` : ''}
            {b.party > 1 ? `${tr(c.people).replace('{n}', String(b.party))} · ` : ''}
            {tr(c.payAtShop)}
          </span>
        </span>
      </div>
      {!ask ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{!late && now > 0 && tr(c.cancelUntil).replace('{t}', `${date(untilDay)} ${bkkHm(untilIso)}`)}</span>
          <button type="button" onClick={() => setAsk(true)} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive">
            {tr(c.cancel)}
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-secondary p-3">
          {late && <p className="mb-2 text-xs font-semibold text-amber-800 dark:text-amber-300">{tr(c.cancelLate)}</p>}
          {error && <p className="mb-2 text-xs font-semibold text-destructive">{tr(bkErrors[error] ?? bkErrors.failed)}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await cancel(b.id)
                  if (r.ok) router.refresh()
                  else setError(r.error)
                })
              }
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-destructive text-sm font-bold text-white disabled:opacity-40"
            >
              {pending && <Spinner className="h-4 w-4" />}
              {tr(c.confirmCancel)}
            </button>
            <button type="button" onClick={() => setAsk(false)} className="h-10 flex-1 rounded-full border border-border text-sm font-semibold">
              {tr(c.keep)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BookFlow({
  types,
  categories,
  today,
  startType,
  api,
  onBack,
  onDone,
}: {
  types: PublicType[]
  categories: PublicCategory[]
  today: string
  startType: string | null
  api: { memberSlots: typeof memberSlots; memberBook: typeof memberBook; memberDays?: typeof memberDays }
  onBack: () => void
  onDone: () => void
}) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [type, setType] = useState<PublicType | null>(types.find((t) => t.id === startType) ?? (types.length === 1 ? types[0] : null))
  const [day, setDay] = useState(today)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [closed, setClosed] = useState(false)
  const [reason, setReason] = useState<EmptyReason | null>(null)
  const [loading, setLoading] = useState(false)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [resourceId, setResourceId] = useState<string | null>(null)
  const [party, setParty] = useState(1)
  const [note, setNote] = useState('')
  const [arrive, setArrive] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Places left per day: full days look faded; open on the first free day.
  const [free, setFree] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    if (!type || !api.memberDays) return
    let alive = true
    setFree(null)
    void api.memberDays(type.id).then((r) => {
      if (!alive || !r.ok) return
      setFree(r.data)
      const first = Object.keys(r.data).sort().find((d) => r.data[d] > 0)
      setDay((cur) => ((r.data[cur] ?? 0) > 0 || !first ? cur : first))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type?.id])
  const nextFree = free ? Object.keys(free).sort().find((d) => d > day && free[d] > 0) : undefined

  useEffect(() => {
    if (!type) return
    let alive = true
    setLoading(true)
    setSlot(null)
    setResourceId(null)
    setArrive(null)
    setError(null)
    void api.memberSlots(type.id, day).then((r) => {
      if (!alive) return
      setLoading(false)
      if (r.ok) {
        setSlots(r.data.slots)
        setClosed(r.data.closed)
        setReason(r.data.reason ?? null)
        // A whole-day booking has one choice: pick it.
        if (type.wholeDay && r.data.slots[0] && r.data.slots[0].left > 0) setSlot(r.data.slots[0])
      } else {
        setSlots([])
        setError(r.error)
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type?.id, day])

  const back = (
    <button type="button" onClick={type && types.length > 1 && !startType ? () => setType(null) : onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {tr(type && types.length > 1 && !startType ? c.pickWhat : c.myBookings)}
    </button>
  )

  if (!type)
    return (
      <>
        {back}
        <h1 className="mt-4 font-display text-3xl font-extrabold">{tr(c.pickWhat)}</h1>
        {[
          ...categories.map((cat) => ({ cat, list: types.filter((t) => t.categoryId === cat.id) })),
          { cat: null, list: types.filter((t) => !t.categoryId || !categories.some((x) => x.id === t.categoryId)) },
        ]
          .filter((g) => g.list.length > 0)
          .map((g) => (
            <section key={g.cat?.id ?? 'none'} className="mt-6">
              {g.cat ? (
                <div className="mb-2">
                  {g.cat.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.cat.imageUrl} alt="" className="mb-2 aspect-[5/2] w-full rounded-2xl object-cover" />
                  )}
                  <h2 className="font-display text-xl font-extrabold">{lang === 'en' && g.cat.nameEn ? g.cat.nameEn : g.cat.nameTh}</h2>
                  {g.cat.description && <p className="text-sm text-muted-foreground">{g.cat.description}</p>}
                </div>
              ) : (
                categories.length > 0 && <h2 className="mb-2 font-display text-xl font-extrabold">{tr(c.other)}</h2>
              )}
              <ul className="flex flex-col gap-2">
                {g.list.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setType(t)} className={cn(card, 'w-full text-left hover:border-primary/40')}>
                      <span className="block font-display text-lg font-bold">{typeName(t, lang)}</span>
                      <span className="block text-xs text-muted-foreground">{(t.wholeDay ? tr(c.allDay) : tr(c.min).replace('{n}', String(t.durationMin)))}</span>
                      {t.description && <span className="mt-1 block text-sm text-muted-foreground">{t.description}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </>
    )

  const freeRes = slot ? slot.resources.filter((r) => r.left >= party) : []

  return (
    <>
      {back}
      <h1 className="mt-4 font-display text-2xl font-extrabold">{typeName(type, lang)}</h1>
      <p className="text-sm text-muted-foreground">
        {(type.wholeDay ? tr(c.allDay) : tr(c.min).replace('{n}', String(type.durationMin)))} · {tr(c.payAtShop)}
      </p>

      <p className="mt-5 text-sm font-semibold">{tr(c.pickDay)}</p>
      <div className="mt-2">
        <MonthPicker value={day} onChange={setDay} free={free} min={today} max={addDays(today, type.advanceDays)} capacity={type.capacity} wholeDay={type.wholeDay} />
      </div>

      <p className="mt-5 text-sm font-semibold">{tr(type.wholeDay ? c.allDay : c.pickTime)}</p>
      {loading ? (
        <Spinner className="mt-3 h-5 w-5 text-primary" />
      ) : closed || !slots || slots.length === 0 || slots.every((s) => s.left < party) ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {reason ? reasonText(reason, tr) : tr(free && !Object.values(free).some((n) => n > 0) ? c.noFreeDays : c.noSlots)}
          </p>
          {nextFree && (
            <button type="button" onClick={() => setDay(nextFree)} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
              {tr(c.nextFree)} →
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-4 gap-2">
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
                  'rounded-xl border py-2.5 text-center text-sm font-bold tabular-nums',
                  slot?.start === s.start ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
                  full && 'line-through opacity-35',
                  !s.time && 'col-span-4',
                )}
              >
                {s.time || `${tr(c.allDay)} · ${full ? tr(c.full) : tr(c.left).replace('{n}', String(s.left))}`}
              </button>
            )
          })}
        </div>
      )}

      {slot && type.resources.length > 0 && (
        <label className="mt-5 block">
          <span className="mb-1 block text-sm font-semibold">{tr(c.whoServes)}</span>
          <select value={resourceId ?? ''} onChange={(e) => setResourceId(e.target.value || null)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
            <option value="">{tr(c.anyone)}</option>
            {freeRes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {type.maxParty > 1 && (
        <label className="mt-5 block">
          <span className="mb-1 block text-sm font-semibold">{tr(c.party)}</span>
          <select value={party} onChange={(e) => setParty(Number(e.target.value))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
            {Array.from({ length: type.maxParty }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}


      {slot?.arrivals && (
        <div className="mt-5">
          <span className="mb-1 block text-sm font-semibold">{tr(c.arriveAt)}</span>
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

      {slot && (
        <>
          <label className="mt-5 block">
            <span className="mb-1 block text-sm font-semibold">{tr(c.note)}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
          <div className="mt-5 rounded-2xl bg-secondary p-4 text-sm">
            <p className="font-semibold">{tr(c.confirmTitle)}</p>
            <p className="mt-1">
              {typeName(type, lang)} · {formatMemberDate(`${day}T12:00:00+07:00`, lang, true)} · {slot.time || tr(c.allDay)}
              {arrive ? ` · ~${arrive}` : ''}
              {resourceId ? ` · ${type.resources.find((r) => r.id === resourceId)?.label}` : ''}
              {party > 1 ? ` · ${tr(c.people).replace('{n}', String(party))}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tr(c.cancelUntil).replace('{t}', lang === 'en' ? `${type.cancelHours} h before` : `${type.cancelHours} ชม. ก่อนเวลา`)}
            </p>
          </div>
        </>
      )}

      {error && <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{tr(bkErrors[error] ?? bkErrors.failed)}</p>}
      <button
        type="button"
        disabled={!slot || pending || Boolean(slot.arrivals && !arrive)}
        onClick={() =>
          start(async () => {
            if (!slot) return
            setError(null)
            const r = await api.memberBook({ typeId: type.id, start: slot.start, resourceId, party, note, arriveTime: arrive })
            if (r.ok) {
              router.refresh()
              onDone()
            } else {
              setError(r.error)
              if (r.error === 'slot_full') void api.memberSlots(type.id, day).then((x) => x.ok && setSlots(x.data.slots))
            }
          })
        }
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground disabled:opacity-40"
      >
        {pending && <Spinner className="h-5 w-5" />}
        {tr(c.book)}
      </button>
    </>
  )
}
