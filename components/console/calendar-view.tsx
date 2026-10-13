'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Trash2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { CALENDAR_PATH } from '@/lib/auth/roles'
import {
  addDays,
  calCopy as c,
  calErrors,
  hm,
  KINDS,
  kindCopy,
  REPEATS,
  repeatCopy,
  VISIBILITY,
  visibilityCopy,
  type CalExtra,
  type CalItem,
  type CalKind,
  type Occurrence,
} from '@/lib/calendar'
import { deleteItem, saveItem, type CalInput } from '@/app/console/calendar/actions'
import { cn } from '@/lib/utils'

// Team › Calendar (§31, v0.32). See app/console/calendar/page.tsx.

const KIND_STYLE: Record<CalKind, string> = {
  event: 'bg-primary/10 text-primary',
  campaign: 'bg-amber-500/15 text-amber-900 dark:text-amber-200',
  note: 'bg-sky-500/15 text-sky-900 dark:text-sky-200',
  closed: 'bg-foreground text-background',
}
export const DOT: Record<CalKind, string> = { event: 'bg-primary', campaign: 'bg-amber-500', note: 'bg-sky-500', closed: 'bg-foreground' }
type Layer = 'items' | 'holidays' | 'promos' | 'leave' | 'shifts'
const card = 'rounded-2xl border border-border bg-card'

export function CalendarView({
  setUp,
  admin,
  meId,
  today,
  month,
  range,
  listView,
  occurrences,
  extras,
  staff,
}: {
  setUp: boolean
  admin: boolean
  meId: string
  today: string
  month: string
  range: { from: string; to: string }
  listView: boolean
  occurrences: Occurrence[]
  extras: CalExtra[]
  staff: { id: string; name: string }[]
}) {
  const { tr, lang } = useLanguage()
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ items: true, holidays: true, promos: true, leave: true, shifts: false })
  const [day, setDay] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ item: CalItem | null; date: string } | null>(null)

  const loc = lang === 'en' ? 'en-GB' : 'th-TH'
  const monthLabel = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
  const shiftMonth = (n: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    return d.toISOString().slice(0, 7)
  }
  const href = (m: string, list = listView) => `${CALENDAR_PATH}?month=${m}${list ? '&view=list' : ''}`
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(range.from, i)), [range.from])
  const weekdays = useMemo(
    () => days.slice(0, 7).map((d) => new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))),
    [days, loc],
  )

  // Everything on one day, in display order.
  const onDay = (d: string) => {
    const occ = layers.items ? occurrences.filter((o) => o.start <= d && o.end >= d) : []
    const hol = layers.holidays ? extras.filter((e): e is Extract<CalExtra, { type: 'holiday' }> => e.type === 'holiday' && e.day === d) : []
    const promos = layers.promos ? extras.filter((e): e is Extract<CalExtra, { type: 'promo' }> => e.type === 'promo' && e.start <= d && e.end >= d) : []
    const leave = layers.leave ? extras.filter((e): e is Extract<CalExtra, { type: 'leave' }> => e.type === 'leave' && e.start <= d && e.end >= d) : []
    const shifts = layers.shifts ? extras.find((e): e is Extract<CalExtra, { type: 'shifts' }> => e.type === 'shifts' && e.day === d) : undefined
    return { occ, hol, promos, leave, shifts }
  }
  const span = (a: string, b: string) => `${Number(a.slice(8))}/${Number(a.slice(5, 7))} – ${Number(b.slice(8))}/${Number(b.slice(5, 7))}`
  const canEdit = (i: CalItem) => admin || i.createdBy === meId
  const open = (o: Occurrence) => setEditing({ item: o.item, date: o.start })
  const layerList: Layer[] = admin ? ['items', 'holidays', 'promos', 'leave', 'shifts'] : ['items', 'holidays', 'promos']
  const layerLabel: Record<Layer, { th: string; en: string }> = { items: c.layerItems, holidays: c.layerHolidays, promos: c.layerPromos, leave: c.layerLeave, shifts: c.layerShifts }

  const listDays = days.filter((d) => d.slice(0, 7) === month)
  // The list shows a multi-day item once: on its first day (or the 1st of the month).
  const firstHere = (start: string, d: string) => start === d || (d === listDays[0] && start < d)
  const onListDay = (d: string) => {
    const x = onDay(d)
    return {
      ...x,
      occ: x.occ.filter((o) => firstHere(o.start, d)),
      promos: x.promos.filter((p) => firstHere(p.start, d)),
      leave: x.leave.filter((l) => firstHere(l.start, d)),
    }
  }
  const List_ = (
    <div className={cn(card, 'divide-y divide-border')}>
      {listDays.every((d) => {
        const x = onListDay(d)
        return !x.occ.length && !x.hol.length && !x.promos.length && !x.leave.length
      }) ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{tr(c.nothingRange)}</p>
      ) : (
        listDays.map((d) => {
          const x = onListDay(d)
          if (!x.occ.length && !x.hol.length && !x.promos.length && !x.leave.length) return null
          return (
            <div key={d} className="flex gap-3 p-3 md:gap-4 md:p-4">
              <DateBadge d={d} today={today} loc={loc} />
              <div className="min-w-0 flex-1 space-y-1.5">
                {x.hol.map((h) => (
                  <p key={h.name} className="text-sm font-semibold text-destructive">
                    {h.name}
                  </p>
                ))}
                {x.occ.map((o) => (
                  <button key={o.item.id + o.start} type="button" onClick={() => open(o)} className="block w-full text-left">
                    <ItemLine o={o} />
                  </button>
                ))}
                {x.promos.map((p) => (
                  <p key={p.name} className="text-sm">
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">{tr(c.promo)}</span> {p.name}
                    {p.end !== p.start && <span className="text-xs text-muted-foreground"> · {span(p.start, p.end)}</span>}
                  </p>
                ))}
                {x.leave.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {tr(c.leave)}: {x.leave.map((l) => (l.end !== l.start ? `${l.name} (${span(l.start, l.end)})` : l.name)).join(', ')}
                  </p>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-display text-2xl font-extrabold">{tr(c.title)}</h1>
        <div className="flex items-center gap-1">
          <Link href={href(shiftMonth(-1))} aria-label="previous month" className="rounded-full border border-border p-2 hover:bg-secondary">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <span className="min-w-[9.5rem] text-center font-semibold">{monthLabel}</span>
          <Link href={href(shiftMonth(1))} aria-label="next month" className="rounded-full border border-border p-2 hover:bg-secondary">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {month !== today.slice(0, 7) && (
            <Link href={href(today.slice(0, 7))} className="ml-1 rounded-full border border-border px-3 py-1.5 text-sm font-semibold hover:bg-secondary">
              {tr(c.today)}
            </Link>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden rounded-full bg-secondary p-1 text-sm font-semibold md:inline-flex">
            <Link href={href(month, false)} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1', !listView ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> {tr(c.month)}
            </Link>
            <Link href={href(month, true)} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1', listView ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
              <List className="h-4 w-4" aria-hidden="true" /> {tr(c.list)}
            </Link>
          </div>
          {setUp && (
            <button
              type="button"
              onClick={() => setEditing({ item: null, date: day ?? (today.slice(0, 7) === month ? today : `${month}-01`) })}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> {tr(admin ? c.add : c.addNote)}
            </button>
          )}
        </div>
      </div>

      {!setUp ? (
        <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">{tr(c.layers)}</span>
            {layerList.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={layers[l]}
                onClick={() => setLayers({ ...layers, [l]: !layers[l] })}
                className={cn('rounded-full border px-3 py-1 font-semibold', layers[l] ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')}
              >
                {tr(layerLabel[l])}
              </button>
            ))}
            <span className="ml-2 hidden flex-wrap items-center gap-3 text-xs text-muted-foreground lg:flex">
              {KINDS.map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <span className={cn('h-2 w-2 rounded-full', DOT[k])} /> {tr(kindCopy[k])}
                </span>
              ))}
            </span>
          </div>

          {listView ? (
            List_
          ) : (
            <>
              {/* phones: the list; from md up: the month grid + the chosen day */}
              <div className="md:hidden">{List_}</div>
              <div className="hidden gap-4 md:grid xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className={cn(card, 'overflow-hidden')}>
                  <div className="grid grid-cols-7 border-b border-border bg-secondary/50 text-center text-xs font-semibold text-muted-foreground">
                    {weekdays.map((w) => (
                      <div key={w} className="py-2">
                        {w}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {days.map((d) => {
                      const x = onDay(d)
                      const chips = [
                        ...x.occ.map((o) => ({ key: o.item.id + o.start, label: (hm(o.item.startTime) ? `${hm(o.item.startTime)} ` : '') + o.item.title, cls: KIND_STYLE[o.item.kind], o })),
                        ...x.promos.map((p) => ({ key: 'p' + p.name, label: p.name, cls: 'bg-accent/15 text-accent', o: null })),
                        ...x.leave.map((l) => ({ key: 'l' + l.name, label: `${tr(c.leave)} · ${l.name}`, cls: 'bg-secondary text-secondary-foreground', o: null })),
                      ]
                      const inMonth = d.slice(0, 7) === month
                      return (
                        <div
                          key={d}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDay(d)}
                          onKeyDown={(e) => e.key === 'Enter' && setDay(d)}
                          className={cn(
                            'min-h-[7.5rem] cursor-pointer border-r border-b border-border p-1.5 text-left last:border-r-0 [&:nth-child(7n)]:border-r-0',
                            !inMonth && 'bg-secondary/30 text-muted-foreground',
                            day === d && 'ring-2 ring-primary ring-inset',
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className={cn('flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold', d === today && 'bg-primary text-primary-foreground')}>
                              {Number(d.slice(8))}
                            </span>
                            {x.shifts && <span className="truncate text-[10px] text-muted-foreground">{tr(c.onShift).replace('{n}', String(x.shifts.count))}</span>}
                          </div>
                          {x.hol.map((h) => (
                            <p key={h.name} className="mt-0.5 truncate text-[11px] font-semibold text-destructive" title={h.name}>
                              {h.name}
                            </p>
                          ))}
                          <div className="mt-1 space-y-0.5">
                            {chips.slice(0, 3).map((ch) => (
                              <button
                                key={ch.key}
                                type="button"
                                title={ch.label}
                                onClick={(e) => {
                                  if (!ch.o) return
                                  e.stopPropagation()
                                  open(ch.o)
                                }}
                                className={cn('block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold', ch.cls)}
                              >
                                {ch.label}
                              </button>
                            ))}
                            {chips.length > 3 && <p className="px-1 text-[11px] text-muted-foreground">{tr(c.more).replace('{n}', String(chips.length - 3))}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <DayPanel
                  day={day ?? today}
                  data={onDay(day ?? today)}
                  today={today}
                  loc={loc}
                  onOpen={open}
                  onAdd={(d) => setEditing({ item: null, date: d })}
                  addLabel={tr(admin ? c.add : c.addNote)}
                />
              </div>
            </>
          )}
        </>
      )}

      {editing && (
        <Editor
          item={editing.item}
          date={editing.date}
          admin={admin}
          readOnly={editing.item ? !canEdit(editing.item) : false}
          staff={staff}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function DateBadge({ d, today, loc }: { d: string; today: string; loc: string }) {
  const date = new Date(`${d}T00:00:00Z`)
  return (
    <div className={cn('flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5', d === today ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
      <span className="text-[11px] font-semibold">{new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(date)}</span>
      <span className="text-lg leading-tight font-extrabold">{date.getUTCDate()}</span>
    </div>
  )
}

function ItemLine({ o }: { o: Occurrence }) {
  const { tr, lang } = useLanguage()
  const i = o.item
  const title = lang === 'en' && i.titleEn ? i.titleEn : i.title
  return (
    <span className="flex items-start gap-2 text-sm">
      <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', KIND_STYLE[i.kind])}>{tr(kindCopy[i.kind])}</span>
      <span className="min-w-0">
        <span className="font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">
          {hm(i.startTime) ? `${hm(i.startTime)}${hm(i.endTime) ? `–${hm(i.endTime)}` : ''}` : tr(c.allDay)}
          {o.start !== o.end && ` · ${o.start.slice(8)}/${o.start.slice(5, 7)} – ${o.end.slice(8)}/${o.end.slice(5, 7)}`}
          {i.place && ` · ${i.place}`} · {tr(visibilityCopy[i.visibility])}
        </span>
      </span>
    </span>
  )
}

function DayPanel({
  day,
  data,
  today,
  loc,
  onOpen,
  onAdd,
  addLabel,
}: {
  day: string
  data: {
    occ: Occurrence[]
    hol: { name: string }[]
    promos: { name: string }[]
    leave: { name: string }[]
    shifts?: { count: number }
  }
  today: string
  loc: string
  onOpen: (o: Occurrence) => void
  onAdd: (d: string) => void
  addLabel: string
}) {
  const { tr } = useLanguage()
  const label = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
  const empty = !data.occ.length && !data.hol.length && !data.promos.length && !data.leave.length
  return (
    <aside className={cn(card, 'h-fit p-4 xl:sticky xl:top-[81px]')}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold">
          {label}
          {day === today && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{tr(c.today)}</span>}
        </h2>
        <button type="button" onClick={() => onAdd(day)} aria-label={addLabel} title={addLabel} className="rounded-full border border-border p-1.5 hover:bg-secondary">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 space-y-2.5">
        {data.hol.map((h) => (
          <p key={h.name} className="text-sm font-semibold text-destructive">
            {tr(c.holiday)} · {h.name}
          </p>
        ))}
        {data.occ.map((o) => (
          <button key={o.item.id + o.start} type="button" onClick={() => onOpen(o)} className="block w-full rounded-xl p-1 text-left hover:bg-secondary/60">
            <ItemLine o={o} />
          </button>
        ))}
        {data.promos.map((p) => (
          <p key={p.name} className="text-sm">
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">{tr(c.promo)}</span> {p.name}
          </p>
        ))}
        {data.leave.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {tr(c.leave)}: {data.leave.map((l) => l.name).join(', ')}
          </p>
        )}
        {data.shifts && <p className="text-sm text-muted-foreground">{tr(c.onShift).replace('{n}', String(data.shifts.count))}</p>}
        {empty && <p className="text-sm text-muted-foreground">{tr(c.nothing)}</p>}
      </div>
    </aside>
  )
}

const input = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm'

function Editor({
  item,
  date,
  admin,
  readOnly,
  staff,
  onClose,
}: {
  item: CalItem | null
  date: string
  admin: boolean
  readOnly: boolean
  staff: { id: string; name: string }[]
  onClose: () => void
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [askDel, setAskDel] = useState(false)
  const [f, setF] = useState<CalInput>(() => ({
    id: item?.id,
    kind: item?.kind ?? (admin ? 'event' : 'note'),
    title: item?.title ?? '',
    titleEn: item?.titleEn ?? '',
    body: item?.body ?? '',
    bodyEn: item?.bodyEn ?? '',
    internalNote: item?.internalNote ?? '',
    place: item?.place ?? '',
    startsOn: item?.startsOn ?? date,
    endsOn: item?.endsOn ?? date,
    startTime: item?.startTime ?? null,
    endTime: item?.endTime ?? null,
    visibility: item?.visibility ?? 'team',
    staffIds: item?.staffIds ?? [],
    repeat: item?.repeat ?? 'none',
    repeatUntil: item?.repeatUntil ?? null,
  }))
  const allDay = !f.startTime
  const outside = f.visibility === 'members' || f.visibility === 'public'
  const set = (p: Partial<CalInput>) => setF((x) => ({ ...x, ...p }))
  const run = (task: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      const r = await task()
      if (r.ok) {
        onClose()
        router.refresh()
      } else setError(r.error ?? 'failed')
    })

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr(item ? c.editItem : c.newItem)}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-bold">{tr(item ? c.editItem : c.newItem)}</h2>
          <button type="button" onClick={onClose} aria-label={tr(c.cancel)} className="rounded-full p-1.5 hover:bg-secondary">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <fieldset disabled={readOnly || pending} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
          {admin && (
            <div>
              <p className="mb-1.5 font-semibold">{tr(c.kind)}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set({ kind: k })}
                    className={cn('rounded-xl border px-2 py-2 text-xs font-semibold', f.kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border')}
                  >
                    {tr(kindCopy[k])}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block font-semibold">{tr(c.fTitle)}</span>
            <input className={input} value={f.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} />
          </label>
          {admin && (
            <label className="block">
              <span className="mb-1 block text-muted-foreground">{tr(c.fTitleEn)}</span>
              <input className={input} value={f.titleEn ?? ''} maxLength={100} onChange={(e) => set({ titleEn: e.target.value })} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block font-semibold">{tr(c.fStart)}</span>
              <input type="date" className={input} value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value, endsOn: f.endsOn < e.target.value ? e.target.value : f.endsOn })} />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">{tr(c.fEnd)}</span>
              <input type="date" className={input} value={f.endsOn} min={f.startsOn} onChange={(e) => set({ endsOn: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex h-10 items-center gap-2 font-semibold">
              <input type="checkbox" checked={allDay} onChange={(e) => set(e.target.checked ? { startTime: null, endTime: null } : { startTime: '10:00', endTime: '11:00' })} />
              {tr(c.fAllDay)}
            </label>
            {!allDay && (
              <>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">{tr(c.fFrom)}</span>
                  <input type="time" className={cn(input, 'w-32')} value={f.startTime ?? ''} onChange={(e) => set({ startTime: e.target.value || null })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">{tr(c.fTo)}</span>
                  <input type="time" className={cn(input, 'w-32')} value={f.endTime ?? ''} onChange={(e) => set({ endTime: e.target.value || null })} />
                </label>
              </>
            )}
          </div>
          <label className="block">
            <span className="mb-1 block font-semibold">{tr(c.fPlace)}</span>
            <input className={input} value={f.place ?? ''} maxLength={120} onChange={(e) => set({ place: e.target.value })} />
          </label>
          {admin && (
            <div>
              <p className="mb-1.5 font-semibold">{tr(c.fWho)}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {VISIBILITY.map((v) => (
                  <label key={v} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2', f.visibility === v ? 'border-primary bg-primary/5' : 'border-border')}>
                    <input type="radio" name="vis" checked={f.visibility === v} onChange={() => set({ visibility: v })} />
                    {tr(visibilityCopy[v])}
                  </label>
                ))}
              </div>
              {f.visibility === 'staff' && (
                <div className="mt-2 rounded-xl border border-border p-2">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{tr(c.fStaff)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {staff.map((s) => {
                      const on = (f.staffIds ?? []).includes(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => set({ staffIds: on ? (f.staffIds ?? []).filter((x) => x !== s.id) : [...(f.staffIds ?? []), s.id] })}
                          className={cn('rounded-full border px-3 py-1 text-xs font-semibold', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}
                        >
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {outside && <p className="mt-1.5 text-xs text-muted-foreground">{tr(c.outsideHint)}</p>}
            </div>
          )}
          <label className="block">
            <span className="mb-1 block font-semibold">{tr(c.fBody)}</span>
            <textarea rows={3} className="w-full rounded-xl border border-border bg-background px-3 py-2" value={f.body ?? ''} maxLength={1000} onChange={(e) => set({ body: e.target.value })} />
          </label>
          {admin && outside && (
            <label className="block">
              <span className="mb-1 block text-muted-foreground">{tr(c.fBodyEn)}</span>
              <textarea rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2" value={f.bodyEn ?? ''} maxLength={1000} onChange={(e) => set({ bodyEn: e.target.value })} />
            </label>
          )}
          {admin && outside && (
            <label className="block">
              <span className="mb-1 block font-semibold">{tr(c.fInternal)}</span>
              <textarea rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2" value={f.internalNote ?? ''} maxLength={1000} onChange={(e) => set({ internalNote: e.target.value })} />
            </label>
          )}
          {admin && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block font-semibold">{tr(c.fRepeat)}</span>
                <select className={input} value={f.repeat} onChange={(e) => set({ repeat: e.target.value as CalInput['repeat'] })}>
                  {REPEATS.map((r) => (
                    <option key={r} value={r}>
                      {tr(repeatCopy[r])}
                    </option>
                  ))}
                </select>
              </label>
              {f.repeat !== 'none' && (
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">{tr(c.fUntil)}</span>
                  <input type="date" className={input} value={f.repeatUntil ?? ''} min={f.startsOn} onChange={(e) => set({ repeatUntil: e.target.value || null })} />
                </label>
              )}
            </div>
          )}
          {item?.createdByName && (
            <p className="text-xs text-muted-foreground">
              {tr(c.by)} {item.createdByName}
            </p>
          )}
        </fieldset>
        {!readOnly && (
          <div className="space-y-2 border-t border-border px-4 py-3">
            {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{tr(calErrors[error] ?? calErrors.failed)}</p>}
            {askDel ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-sm font-semibold">{tr(c.delConfirm)}</span>
                <button type="button" onClick={() => setAskDel(false)} className="h-10 rounded-full border border-border px-4 text-sm font-semibold">
                  {tr(c.cancel)}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteItem(item!.id))}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-destructive px-4 text-sm font-bold text-white"
                >
                  {pending && <Spinner className="h-4 w-4" />}
                  {tr(c.yesDel)}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {item && (
                  <button type="button" onClick={() => setAskDel(true)} aria-label={tr(c.del)} title={tr(c.del)} className="rounded-full border border-border p-2.5 text-destructive hover:bg-destructive/5">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <button type="button" onClick={onClose} className="ml-auto h-10 rounded-full border border-border px-4 text-sm font-semibold">
                  {tr(c.cancel)}
                </button>
                <button
                  type="button"
                  disabled={pending || !f.title.trim()}
                  onClick={() => run(() => saveItem(f))}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-40"
                >
                  {pending && <Spinner className="h-4 w-4" />}
                  {tr(c.save)}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
