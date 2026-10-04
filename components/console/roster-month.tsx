'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Briefcase, Check, ChevronLeft, ChevronRight, Copy, Palmtree, Printer, Thermometer, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { shiftErrors, timeCopy } from '@/lib/console/copy'
import { fill } from '@/lib/check-in/copy'
import { groupAssignments, paidMinutes, shiftLengthMinutes, type ShiftAssignment, type ShiftTemplate } from '@/lib/console/shift-math'
import { copyMonthPattern, setCells, setDayShifts, type BulkAction } from '@/app/console/time/shift-actions'
import { TIME_PATH } from '@/lib/auth/roles'
import { RangePlanner } from '@/components/console/range-planner'
import type { LeaveKind } from '@/lib/leave'
import { cn } from '@/lib/utils'

export type LeaveMark = { staffId: string; start: string; end: string; kind: LeaveKind }

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const addMonths = (monthStart: string, n: number) => {
  const d = new Date(`${monthStart}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
const LEAVE_ICON = { vacation: Palmtree, sick: Thermometer, personal: Briefcase } as const
const btn = 'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50'

// Back Office › Time › Roster, a whole month: one row per person, one small
// cell per day with the shift's code on its colour. Tap a cell to change it.
// Bottom row: how many are working each day (flagged under the minimum);
// right: each person's days and paid hours for the month.
export function RosterMonth({
  monthStart,
  today,
  staff,
  templates,
  assignments,
  approved,
  pending,
  holidays,
  minStaff,
}: {
  monthStart: string // YYYY-MM-01
  today: string
  staff: { id: string; name: string }[]
  templates: ShiftTemplate[]
  assignments: ShiftAssignment[]
  approved: LeaveMark[]
  pending: LeaveMark[]
  holidays: { day: string; name: string }[]
  minStaff: number
}) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [busy, start] = useTransition()
  const [busyCell, setBusyCell] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ staffId: string; name: string; date: string; x: number; y: number } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const locale = lang === 'th' ? 'th-TH' : 'en-GB'
  useEffect(() => {
    if (!menu) return
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('keydown', close)
    window.addEventListener('scroll', () => setMenu(null), { once: true, capture: true })
    return () => window.removeEventListener('keydown', close)
  }, [menu])
  const next = addMonths(monthStart, 1)
  const days = useMemo(() => {
    const out: string[] = []
    for (let d = monthStart; d < next; d = addDays(d, 1)) out.push(d)
    return out
  }, [monthStart, next])
  const tmap = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates])
  const amap = useMemo(() => groupAssignments(assignments), [assignments])
  // Changes made in the day menu show at once, before the page refreshes
  // (several shifts can be ticked one after another).
  const [local, setLocal] = useState<Map<string, { off: boolean; shifts: string[] }>>(new Map())
  useEffect(() => setLocal(new Map()), [assignments])
  const dayOf = (staffId: string, d: string): { off: boolean; shifts: ShiftTemplate[] } => {
    const key = `${staffId}|${d}`
    const l = local.get(key)
    const ids = l ? l.shifts : (amap.get(key) ?? []).filter((a) => a.templateId).map((a) => a.templateId as string)
    const off = l ? l.off : (amap.get(key) ?? []).some((a) => a.dayOff)
    const shifts = ids
      .map((id) => tmap.get(id))
      .filter((t): t is ShiftTemplate => Boolean(t))
      .sort((x, y) => x.start.localeCompare(y.start))
    return { off, shifts }
  }
  const holidayOf = useMemo(() => new Map(holidays.map((h) => [h.day, h.name])), [holidays])
  const leaveOn = (list: LeaveMark[], staffId: string, d: string) => list.find((l) => l.staffId === staffId && l.start <= d && l.end >= d)
  const active = templates.filter((t) => t.active)

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${monthStart}T00:00:00Z`))
  const wd = (d: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)).replace('.', '')
  const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())
  const thisMonth = today.slice(0, 7) === monthStart.slice(0, 7)

  // Per person: days with a shift and paid hours (every shift counts);
  // per day: people working, and how many on each shift.
  const totals = staff.map((p) => {
    let n = 0
    let mins = 0
    for (const d of days) {
      if (leaveOn(approved, p.id, d)) continue
      const { shifts } = dayOf(p.id, d)
      if (shifts.length) n += 1
      for (const t of shifts) mins += paidMinutes(t)
    }
    return { n, hours: Math.round((mins / 60) * 10) / 10 }
  })
  const onShift = (d: string, templateId?: string) =>
    staff.filter((p) => {
      if (leaveOn(approved, p.id, d)) return false
      const { shifts } = dayOf(p.id, d)
      return templateId ? shifts.some((t) => t.id === templateId) : shifts.length > 0
    }).length
  const working = days.map((d) => onShift(d))
  const usedShifts = active.filter((t) => days.some((d) => onShift(d, t.id) > 0))

  // Save one day as a whole: a set of shifts, a day off, or nothing.
  const save = (staffId: string, date: string, value: { off: boolean; shifts: string[] }, close: boolean) => {
    const key = `${staffId}|${date}`
    setLocal((m) => new Map(m).set(key, value))
    if (close) setMenu(null)
    start(async () => {
      setMsg(null)
      setBusyCell(key)
      const r = await setDayShifts(staffId, date, value.off ? { off: true } : { shifts: value.shifts })
      setBusyCell(null)
      if (!r.ok) {
        setMsg({ ok: false, text: tr(shiftErrors[r.error] ?? shiftErrors.failed) })
        setLocal((m) => {
          const n = new Map(m)
          n.delete(key)
          return n
        })
      }
      router.refresh()
    })
  }
  // Tick / untick one shift in the open menu (stays open for a second one).
  const toggle = (templateId: string) => {
    if (!menu) return
    const cur = dayOf(menu.staffId, menu.date).shifts.map((t) => t.id)
    const next = cur.includes(templateId) ? cur.filter((id) => id !== templateId) : [...cur, templateId]
    if (next.length > 3) {
      setMsg({ ok: false, text: tr(shiftErrors.too_many_shifts) })
      return
    }
    save(menu.staffId, menu.date, { off: false, shifts: next }, false)
  }

  // ---- Selecting many cells (v0.26.1) ----------------------------------
  // Mouse: drag a rectangle, Shift-click a range from the last cell,
  // Cmd/Ctrl-click one more. Touch: press and hold a cell, then tap others.
  // Click a name for the whole month, a date for everyone that day.
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [touchSelect, setTouchSelect] = useState(false)
  const [addMode, setAddMode] = useState(false) // add to the day's shifts instead of replacing
  const [bulkShifts, setBulkShifts] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const [barPos, setBarPos] = useState<{ left: number; top: number } | null>(null)
  const drag = useRef<{ start: string; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const staffIndex = useMemo(() => new Map(staff.map((p, i) => [p.id, i])), [staff])
  const dayIndex = useMemo(() => new Map(days.map((d, i) => [d, i])), [days])
  const split = (k: string) => {
    const i = k.indexOf('|')
    return [k.slice(0, i), k.slice(i + 1)] as const
  }
  const rect = (a: string, b: string) => {
    const [sa, da] = split(a)
    const [sb, db] = split(b)
    const r0 = Math.min(staffIndex.get(sa) ?? 0, staffIndex.get(sb) ?? 0)
    const r1 = Math.max(staffIndex.get(sa) ?? 0, staffIndex.get(sb) ?? 0)
    const c0 = Math.min(dayIndex.get(da) ?? 0, dayIndex.get(db) ?? 0)
    const c1 = Math.max(dayIndex.get(da) ?? 0, dayIndex.get(db) ?? 0)
    const out = new Set<string>()
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.add(`${staff[r].id}|${days[c]}`)
    return out
  }
  const clearSel = () => {
    setSel(new Set())
    setAnchor(null)
    setTouchSelect(false)
    setBulkShifts([])
  }
  const toggleSel = (k: string) =>
    setSel((cur) => {
      const n = new Set(cur)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  useEffect(() => {
    // A drag that ends on another cell fires no click on the first one, so
    // the "ignore the next click" flag is dropped right after release.
    const up = () => {
      if (drag.current?.moved) setTimeout(() => (suppressClick.current = false), 0)
      drag.current = null
      setDragging(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && clearSel()
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key)
    }
  }, [])

  const onCellPointerDown = (e: React.PointerEvent<HTMLButtonElement>, k: string) => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
      if (e.shiftKey && anchor) {
        setSel((cur) => new Set([...cur, ...rect(anchor, k)]))
        suppressClick.current = true
      } else if (e.metaKey || e.ctrlKey) {
        toggleSel(k)
        setAnchor(k)
        suppressClick.current = true
      } else {
        drag.current = { start: k, moved: false }
      }
      return
    }
    // Touch / pen: press and hold to start selecting.
    const { clientX: x, clientY: y } = e
    press.current = {
      x,
      y,
      timer: setTimeout(() => {
        press.current = null
        suppressClick.current = true
        setTouchSelect(true)
        setSel((cur) => new Set(cur).add(k))
        setAnchor(k)
        navigator.vibrate?.(30)
      }, 450),
    }
  }
  const onCellPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) {
      clearTimeout(press.current.timer)
      press.current = null
    }
  }
  const onCellPointerEnd = () => {
    if (press.current) {
      clearTimeout(press.current.timer)
      press.current = null
    } else if (suppressClick.current) {
      setTimeout(() => (suppressClick.current = false), 350)
    }
  }
  const onCellPointerEnter = (e: React.PointerEvent<HTMLButtonElement>, k: string) => {
    const d = drag.current
    if (!d || e.pointerType !== 'mouse' || (e.buttons & 1) === 0) return
    if (k !== d.start) d.moved = true
    if (d.moved) {
      setDragging(true)
      suppressClick.current = true
      setSel(rect(d.start, k))
      setAnchor(d.start)
      setMenu(null)
    }
  }
  const onCellClick = (e: React.MouseEvent<HTMLButtonElement>, staffId: string, name: string, d: string) => {
    const k = `${staffId}|${d}`
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (touchSelect) {
      toggleSel(k)
      setAnchor(k)
      return
    }
    if (sel.size) clearSel()
    setAnchor(k)
    openMenu(e, staffId, name, d)
  }
  const selectRow = (staffId: string) => {
    setMenu(null)
    setSel(new Set(days.map((d) => `${staffId}|${d}`)))
    setAnchor(`${staffId}|${days[0]}`)
  }
  const selectColumn = (d: string) => {
    setMenu(null)
    setSel(new Set(staff.map((p) => `${p.id}|${d}`)))
    setAnchor(`${staff[0]?.id}|${d}`)
  }
  const applyBulk = (action: BulkAction) => {
    const cells = [...sel].map((k) => {
      const [staffId, date] = split(k)
      return { staffId, date }
    })
    start(async () => {
      setMsg(null)
      setBusyCell('bulk')
      const r = await setCells(cells, action)
      setBusyCell(null)
      if (r.ok) {
        setMsg({ ok: true, text: fill(tr(timeCopy.bulkDone), { n: r.count ?? 0 }) })
        clearSel()
      } else setMsg({ ok: false, text: tr(shiftErrors[r.error] ?? shiftErrors.failed) })
      router.refresh()
    })
  }

  // The bar sits right under the chosen cells (above them when there's no
  // room below); for scattered picks, by the last one clicked. It follows
  // the cells when the page or the grid scrolls, and hides while dragging.
  useLayoutEffect(() => {
    if (!sel.size || dragging) {
      setBarPos(null)
      return
    }
    const place = () => {
      const rects = [...sel]
        .map((k) => document.querySelector<HTMLElement>(`[data-cell="${CSS.escape(k)}"]`)?.getBoundingClientRect())
        .filter((r): r is DOMRect => Boolean(r))
      if (!rects.length) return setBarPos(null)
      let box = {
        left: Math.min(...rects.map((r) => r.left)),
        right: Math.max(...rects.map((r) => r.right)),
        top: Math.min(...rects.map((r) => r.top)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
      }
      // Not one rectangle (Cmd-click here and there): stay by the last cell.
      const rows = new Set([...sel].map((k) => split(k)[0])).size
      const cols = new Set([...sel].map((k) => split(k)[1])).size
      if (rows * cols !== sel.size && anchor) {
        const a = document.querySelector<HTMLElement>(`[data-cell="${CSS.escape(anchor)}"]`)?.getBoundingClientRect()
        if (a) box = { left: a.left, right: a.right, top: a.top, bottom: a.bottom }
      }
      const bar = barRef.current
      const w = bar?.offsetWidth ?? 420
      const h = bar?.offsetHeight ?? 56
      const center = (box.left + box.right) / 2
      const left = Math.min(Math.max(8, center - w / 2), window.innerWidth - w - 8)
      const below = box.bottom + 8
      const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, box.top - 8 - h)
      setBarPos({ left, top })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, anchor, dragging, bulkShifts.length, addMode])

  const toggleBulkShift = (id: string) =>
    setBulkShifts((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]))

  // Ticked shifts whose hours run into each other (allowed, but flagged).
  const overlapping = (list: ShiftTemplate[]) => {
    const span = (t: ShiftTemplate) => {
      const [h, m] = t.start.split(':').map(Number)
      const s0 = h * 60 + m
      return [s0, s0 + shiftLengthMinutes(t)] as const
    }
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [a0, a1] = span(list[i])
        const [b0, b1] = span(list[j])
        if (a0 < b1 && b0 < a1) return true
      }
    return false
  }

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, staffId: string, name: string, date: string) => {
    const r = e.currentTarget.getBoundingClientRect()
    const width = 240
    const x = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8)
    const y = r.bottom + 6 + 260 > window.innerHeight ? Math.max(8, r.top - 266) : r.bottom + 6
    setMenu({ staffId, name, date, x, y })
  }

  if (active.length === 0) {
    return <p className="rounded-2xl border border-border bg-secondary p-5 text-sm text-muted-foreground">{tr(timeCopy.rosterNeedShifts)}</p>
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5 print:border-0 print:p-0">
      {/* Month bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`${TIME_PATH}?view=roster&month=${addMonths(monthStart, -1).slice(0, 7)}`}
            aria-label={tr(timeCopy.prevMonth)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-primary/40 print:hidden"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <h2 className="min-w-[9rem] text-center font-display text-lg font-extrabold">{monthLabel}</h2>
          <Link
            href={`${TIME_PATH}?view=roster&month=${next.slice(0, 7)}`}
            aria-label={tr(timeCopy.nextMonth)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-primary/40 print:hidden"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {!thisMonth && (
            <Link href={`${TIME_PATH}?view=roster`} className="ml-1 text-sm font-semibold text-primary hover:underline print:hidden">
              {tr(timeCopy.thisMonth)}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            disabled={busy}
            title={tr(timeCopy.copyPatternHint)}
            onClick={() =>
              start(async () => {
                setMsg(null)
                const r = await copyMonthPattern(monthStart)
                setMsg(
                  r.ok
                    ? { ok: true, text: fill(tr(timeCopy.copyPatternDone), { n: r.count ?? 0 }) }
                    : { ok: false, text: tr(shiftErrors[r.error] ?? shiftErrors.failed) },
                )
                router.refresh()
              })
            }
            className={cn(btn, 'border border-border hover:border-primary/40')}
          >
            {busy && !busyCell ? <Spinner className="h-4 w-4" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {tr(timeCopy.copyPattern)}
          </button>
          <button type="button" onClick={() => window.print()} className={cn(btn, 'border border-border hover:border-primary/40')}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            {tr(timeCopy.print)}
          </button>
        </div>
      </div>

      <div className="print:hidden">
        <RangePlanner staff={staff} templates={active} today={today} monthView />
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {active.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-bold text-white print-color" style={{ backgroundColor: t.color }}>
              {t.shortCode}
            </span>
            {t.name} {t.start}–{t.end}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border">–</span>
          {tr(timeCopy.dayOff)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Palmtree className="h-4 w-4" aria-hidden="true" />
          {tr(timeCopy.onLeave)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground print:hidden">
          <span className="h-5 w-5 rounded border-2 border-dashed border-amber-500" />
          {tr(timeCopy.leaveWaiting)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground print:hidden">{tr(timeCopy.monthHint)}</p>
      {msg && <p className={cn('mt-2 text-sm font-semibold print:hidden', msg.ok ? 'text-accent' : 'text-destructive')}>{msg.text}</p>}

      {/* The grid */}
      <div className="mt-3 overflow-x-auto print:overflow-visible">
        <table className="select-none border-separate border-spacing-0 text-center text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[7.5rem] bg-card py-1 pr-2 text-left font-semibold text-muted-foreground">{tr(timeCopy.colName)}</th>
              {days.map((d) => {
                const hol = holidayOf.get(d)
                return (
                  <th
                    key={d}
                    title={hol}
                    className={cn(
                      'w-8 min-w-8 px-0 py-1 font-semibold',
                      (isWeekend(d) || hol) && 'bg-secondary',
                      hol && 'text-primary',
                      d === today ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <button type="button" onClick={() => selectColumn(d)} title={tr(timeCopy.selectDay)} className="w-full rounded hover:bg-background/70">
                      <span className={cn('block text-[13px] tabular-nums', d === today && 'mx-auto w-6 rounded-full bg-primary text-primary-foreground print-color')}>
                        {Number(d.slice(8))}
                      </span>
                      <span className="block text-[10px] font-normal">{wd(d)}</span>
                    </button>
                  </th>
                )
              })}
              <th className="min-w-[3.25rem] pl-2 text-right font-semibold leading-tight text-muted-foreground">
                {tr(timeCopy.colWorkDays)}
                <span className="block font-normal">{tr(timeCopy.colMonthHours)}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((p, row) => (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 max-w-[9rem] border-t border-border bg-card py-1 pr-2 text-left text-sm font-semibold">
                  <button type="button" onClick={() => selectRow(p.id)} title={tr(timeCopy.selectPerson)} className="block w-full truncate text-left hover:text-primary">
                    {p.name}
                  </button>
                </td>
                {days.map((d) => {
                  const key = `${p.id}|${d}`
                  const { off, shifts } = dayOf(p.id, d)
                  const t = shifts[0]
                  const planned = off || shifts.length > 0
                  const leave = leaveOn(approved, p.id, d)
                  const waiting = !leave && leaveOn(pending, p.id, d)
                  const LeaveIcon = leave ? LEAVE_ICON[leave.kind] : null
                  return (
                    <td key={d} className={cn('border-t border-border p-[2px]', (isWeekend(d) || holidayOf.has(d)) && 'bg-secondary')}>
                      <button
                        type="button"
                        data-cell={key}
                        onClick={(e) => onCellClick(e, p.id, p.name, d)}
                        onPointerDown={(e) => onCellPointerDown(e, key)}
                        onPointerEnter={(e) => onCellPointerEnter(e, key)}
                        onPointerMove={onCellPointerMove}
                        onPointerUp={onCellPointerEnd}
                        onPointerCancel={onCellPointerEnd}
                        onContextMenu={(e) => touchSelect && e.preventDefault()}
                        disabled={busyCell === key}
                        aria-label={`${p.name} ${d}`}
                        title={
                          shifts.length ? shifts.map((x) => `${x.name} ${x.start}–${x.end}`).join('\n') : leave ? tr(timeCopy.onLeave) : off ? tr(timeCopy.dayOff) : undefined
                        }
                        className={cn(
                          'flex h-7 w-7 items-center justify-center overflow-hidden rounded text-[11px] font-bold transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          t && !leave ? 'text-white print-color' : 'text-muted-foreground',
                          !planned && !leave && 'border border-dashed border-border/70',
                          waiting && !sel.has(key) && 'ring-2 ring-amber-500 ring-offset-1',
                          // A ring, not an outline: the clicked cell has focus (outline: none).
                          sel.has(key) && 'ring-[3px] ring-primary ring-offset-1',
                        )}
                        style={t && !leave && shifts.length === 1 ? { backgroundColor: t.color } : undefined}
                      >
                        {busyCell === key ? (
                          <Spinner className="h-3 w-3" />
                        ) : LeaveIcon ? (
                          <LeaveIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        ) : shifts.length > 1 ? (
                          // Several shifts: the cell is split, one colour each.
                          shifts.map((x) => (
                            <span key={x.id} className="flex h-full flex-1 items-center justify-center text-[9px] leading-none" style={{ backgroundColor: x.color }}>
                              {x.shortCode}
                            </span>
                          ))
                        ) : t ? (
                          t.shortCode
                        ) : off ? (
                          '–'
                        ) : (
                          ''
                        )}
                      </button>
                    </td>
                  )
                })}
                <td className="border-t border-border pl-2 text-right leading-tight tabular-nums">
                  <span className="block text-sm font-bold">{totals[row].n}</span>
                  <span className="block text-[11px] text-muted-foreground">{totals[row].hours}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {usedShifts.length > 1 &&
              usedShifts.map((t, i) => (
                <tr key={t.id}>
                  <td className={cn('sticky left-0 z-10 bg-card py-1 pr-2 text-left text-xs', i === 0 && 'border-t-2 border-border')}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[10px] font-bold text-white print-color" style={{ backgroundColor: t.color }}>
                        {t.shortCode}
                      </span>
                      <span className="truncate text-muted-foreground">{t.name}</span>
                    </span>
                  </td>
                  {days.map((d) => (
                    <td key={d} className={cn('py-1 text-[12px] tabular-nums text-muted-foreground', i === 0 && 'border-t-2 border-border')}>
                      {onShift(d, t.id) || ''}
                    </td>
                  ))}
                  <td className={cn(i === 0 && 'border-t-2 border-border')} />
                </tr>
              ))}
            <tr>
              <td className="sticky left-0 z-10 border-t-2 border-border bg-card py-1.5 pr-2 text-left text-xs font-bold text-muted-foreground">
                {tr(timeCopy.rowWorking)}
                {minStaff > 0 && <span className="block font-normal">≥ {minStaff}</span>}
              </td>
              {working.map((n, i) => {
                const low = minStaff > 0 && n < minStaff
                return (
                  <td
                    key={days[i]}
                    title={low ? fill(tr(timeCopy.belowMin), { n: minStaff }) : undefined}
                    className={cn(
                      'border-t-2 border-border py-1.5 text-[13px] font-bold tabular-nums',
                      low ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300' : 'text-foreground',
                    )}
                  >
                    {n}
                  </td>
                )
              })}
              <td className="border-t-2 border-border" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Many cells chosen: one bar, next to them, to set them all */}
      {sel.size > 0 && !dragging && (
        <div
          ref={barRef}
          className="fixed z-40 flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-2 rounded-2xl border border-border bg-popover px-3 py-2 text-sm shadow-xl print:hidden"
          style={barPos ? { left: barPos.left, top: barPos.top } : { left: -9999, top: -9999 }}
        >
          <span className="font-semibold">{fill(tr(timeCopy.bulkSelected), { n: sel.size })}</span>
          <span className="h-5 w-px bg-border" aria-hidden="true" />
          {/* Tick one or more shifts, then save. */}
          {active.map((t) => {
            const on = bulkShifts.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleBulkShift(t.id)}
                title={`${t.name} ${t.start}–${t.end}`}
                className={cn(
                  'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold text-white transition-opacity',
                  on ? 'ring-2 ring-foreground ring-offset-2' : 'opacity-45 hover:opacity-80',
                )}
                style={{ backgroundColor: t.color }}
              >
                {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {t.shortCode}
              </button>
            )
          })}
          <div className="inline-flex rounded-full bg-secondary p-0.5 text-xs font-semibold">
            {([false, true] as const).map((m) => (
              <button
                key={String(m)}
                type="button"
                onClick={() => setAddMode(m)}
                aria-pressed={addMode === m}
                className={cn('rounded-full px-2.5 py-1', addMode === m ? 'bg-background shadow-sm' : 'text-muted-foreground')}
              >
                {tr(m ? timeCopy.bulkAddMode : timeCopy.planModeReplace)}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || bulkShifts.length === 0}
            onClick={() => applyBulk(addMode ? { addShifts: bulkShifts } : { shifts: bulkShifts })}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40"
          >
            {busy && busyCell === 'bulk' && <Spinner className="h-3.5 w-3.5" />}
            {tr(timeCopy.save)}
          </button>
          <span className="h-5 w-px bg-border" aria-hidden="true" />
          <button type="button" disabled={busy} onClick={() => applyBulk({ off: true })} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
            {tr(timeCopy.dayOff)}
          </button>
          <button type="button" disabled={busy} onClick={() => applyBulk({ clear: true })} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground disabled:opacity-50">
            {tr(timeCopy.bulkClear)}
          </button>
          <button type="button" onClick={clearSel} aria-label={tr(timeCopy.bulkCancel)} className="rounded-full p-1 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          {overlapping(active.filter((t) => bulkShifts.includes(t.id))) && (
            <p className="w-full text-xs font-semibold text-amber-700 dark:text-amber-300">{tr(timeCopy.shiftsOverlap)}</p>
          )}
        </div>
      )}

      {/* Pick a shift for one day */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden="true" />
          <div
            role="dialog"
            className="fixed z-50 w-60 overflow-hidden rounded-xl border border-border bg-popover text-sm shadow-xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="truncate text-xs font-semibold text-muted-foreground">
                {menu.name} ·{' '}
                {new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${menu.date}T00:00:00Z`))}
              </span>
              <button type="button" onClick={() => setMenu(null)} aria-label="close" className="text-muted-foreground">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {leaveOn(pending, menu.staffId, menu.date) && (
              <p className="bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">{tr(timeCopy.leaveWaiting)}</p>
            )}
            <p className="px-3 pt-2 text-[11px] text-muted-foreground">{tr(timeCopy.menuMultiHint)}</p>
            {active.map((t) => {
              const on = dayOf(menu.staffId, menu.date).shifts.some((x) => x.id === t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => toggle(t.id)}
                  className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-secondary', on && 'bg-secondary')}
                >
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-[11px] font-bold text-white" style={{ backgroundColor: t.color }}>
                    {t.shortCode}
                  </span>
                  <span className="font-semibold">{t.name}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {t.start}–{t.end}
                  </span>
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                    {on && <Check className="h-3 w-3" aria-hidden="true" />}
                  </span>
                </button>
              )
            })}
            {overlapping(dayOf(menu.staffId, menu.date).shifts) && (
              <p className="bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">{tr(timeCopy.shiftsOverlap)}</p>
            )}
            <button
              type="button"
              onClick={() => save(menu.staffId, menu.date, { off: true, shifts: [] }, true)}
              className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2 text-left hover:bg-secondary"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground">–</span>
              {tr(timeCopy.dayOff)}
            </button>
            <button
              type="button"
              onClick={() => save(menu.staffId, menu.date, { off: false, shifts: [] }, true)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-muted-foreground hover:bg-secondary"
            >
              <span className="inline-flex h-6 w-6 rounded border border-dashed border-border" />
              {tr(timeCopy.clearDay)}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
