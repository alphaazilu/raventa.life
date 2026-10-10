'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SETTINGS_PATH } from '@/lib/auth/roles'
import { useState, useTransition } from 'react'
import { Copy, Plus } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { shiftErrors, timeCopy } from '@/lib/console/copy'
import { autoShortCode, groupAssignments, SHIFT_COLORS, shiftLengthMinutes, type ShiftAssignment, type ShiftTemplate, type TimeSettings } from '@/lib/console/shift-math'
import { copyPreviousWeek, saveTemplate, setAssignment } from '@/app/console/time/shift-actions'
import { cn } from '@/lib/utils'
import { RangePlanner } from '@/components/console/range-planner'

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary'
const btn =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50'

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// The week's roster: one row per person, one dropdown per day.
export function RosterGrid({
  weekStart,
  today,
  staff,
  templates,
  assignments,
  fmtDay,
}: {
  weekStart: string
  today: string
  staff: { id: string; name: string }[]
  templates: ShiftTemplate[]
  assignments: ShiftAssignment[]
  fmtDay: (iso: string) => string
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busyCell, setBusyCell] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  // A day with several shifts (v0.26) shows as one combined, read-only
  // choice ("multi:…"); picking anything else makes the day just that.
  const value = new Map<string, string>()
  for (const [k, list] of groupAssignments(assignments)) {
    const ids = list.filter((a) => a.templateId).map((a) => a.templateId as string)
    value.set(k, ids.length > 1 ? `multi:${ids.join(',')}` : ids[0] ?? (list.some((a) => a.dayOff) ? 'off' : ''))
  }
  const active = templates.filter((t) => t.active)

  const change = (staffId: string, date: string, v: string) =>
    start(async () => {
      setError(null)
      setBusyCell(`${staffId}|${date}`)
      const r = await setAssignment(staffId, date, v)
      setBusyCell(null)
      if (!r.ok) setError(r.error)
      router.refresh()
    })

  if (active.length === 0) {
    return <p className="rounded-2xl border border-border bg-secondary p-5 text-sm text-muted-foreground">{tr(timeCopy.rosterNeedShifts)}</p>
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{tr(timeCopy.viewRoster)}</h2>
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await copyPreviousWeek(weekStart)
              if (!r.ok) setError(r.error)
              router.refresh()
            })
          }
          className={cn(btn, 'border border-border hover:border-primary/40')}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {tr(timeCopy.copyLastWeek)}
        </button>
        </div>
      </div>
      <RangePlanner staff={staff} templates={active} today={today} />
      <p className="mt-1 text-xs text-muted-foreground">{tr(timeCopy.rosterHint)}</p>
      {error && <p className="mt-2 text-sm font-semibold text-destructive">{tr(shiftErrors[error] ?? shiftErrors.failed)}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold text-muted-foreground">
              <th className="py-2 pr-3">{tr(timeCopy.colName)}</th>
              {days.map((d) => (
                <th key={d} className={cn('px-1 py-2', d === today && 'text-primary')}>
                  {fmtDay(`${d}T12:00:00+07:00`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staff.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap py-2 pr-3 font-semibold">{p.name}</td>
                {days.map((d) => {
                  const key = `${p.id}|${d}`
                  const v = value.get(key) ?? ''
                  return (
                    <td key={d} className="px-1 py-2">
                      <div className="relative">
                        <select
                          id={`r-${p.id}-${d}`}
                          aria-label={`${p.name} ${d}`}
                          value={v}
                          disabled={busyCell === key}
                          onChange={(e) => !e.target.value.startsWith('multi:') && change(p.id, d, e.target.value)}
                          className={cn(
                            'w-full rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none focus:border-primary',
                            v === 'off' ? 'border-border bg-muted text-muted-foreground' : v ? 'border-accent/40 bg-secondary text-foreground' : 'border-dashed border-border bg-background text-muted-foreground',
                          )}
                        >
                          <option value="">—</option>
                          {active.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} {t.start}–{t.end}
                            </option>
                          ))}
                          {v.startsWith('multi:') && (
                            <option value={v}>
                              {v
                                .slice(6)
                                .split(',')
                                .map((id) => templates.find((t) => t.id === id)?.shortCode ?? '?')
                                .join(' + ')}
                            </option>
                          )}
                          {v && v !== 'off' && !v.startsWith('multi:') && !active.some((t) => t.id === v) && <option value={v}>{templates.find((t) => t.id === v)?.name ?? '?'}</option>}
                          <option value="off">{tr(timeCopy.dayOff)}</option>
                        </select>
                        {busyCell === key && <Spinner className="absolute right-6 top-2 h-3.5 w-3.5" />}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// Shift templates; the rules are edited in Settings › Work time & leave.
export function ShiftSettings({ templates, settings }: { templates: ShiftTemplate[]; settings: TimeSettings }) {
  const { tr } = useLanguage()
  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{tr(timeCopy.shiftTemplates)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{tr(timeCopy.shiftTemplatesHint)}</p>
        <div className="mt-3 flex flex-col divide-y divide-border">
          {templates.map((t) => (
            <TemplateRow key={t.id} t={t} />
          ))}
          <TemplateRow t={null} />
        </div>
      </section>
      {/* The late / OT / minimum-people rules live in Settings (v0.30). */}
      <Link
        href={`${SETTINGS_PATH}?tab=work`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm hover:border-primary/40"
      >
        <span>
          <span className="block font-semibold">{tr(timeCopy.rules)}</span>
          <span className="block text-xs text-muted-foreground">
            {tr(timeCopy.rulesNow)
              .replace('{g}', String(settings.lateGraceMinutes))
              .replace('{o}', String(settings.otMinMinutes))
              .replace('{m}', String(settings.minStaffPerDay))}
          </span>
        </span>
        <span className="shrink-0 font-semibold text-primary">{tr(timeCopy.rulesEdit)} →</span>
      </Link>
    </>
  )
}

function TemplateRow({ t }: { t: ShiftTemplate | null }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [name, setName] = useState(t?.name ?? '')
  const [startT, setStart] = useState(t?.start ?? '')
  const [endT, setEnd] = useState(t?.end ?? '')
  const [brk, setBrk] = useState(String(t?.breakMinutes ?? 60))
  const [active, setActive] = useState(t?.active ?? true)
  const [code, setCode] = useState(t?.shortCode ?? '')
  const [color, setColor] = useState(t?.color ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const idp = t ? `t-${t.id}` : 't-new'
  const dirty =
    !t ||
    name !== t.name ||
    startT !== t.start ||
    endT !== t.end ||
    brk !== String(t.breakMinutes) ||
    active !== t.active ||
    code !== t.shortCode ||
    color !== t.color
  const shownCode = code.trim() || (name ? autoShortCode(name) : '?')
  const len = /^\d\d:\d\d$/.test(startT) && /^\d\d:\d\d$/.test(endT) && startT !== endT ? shiftLengthMinutes({ start: startT, end: endT }) : null
  const paid = len !== null ? Math.max(0, len - (Number(brk) || 0)) : null

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError(null)
          setSaved(false)
          const r = await saveTemplate({ id: t?.id, name, start: startT, end: endT, breakMinutes: Number(brk), active, shortCode: code, color })
          if (!r.ok) {
            setError(r.error)
            return
          }
          if (!t) {
            setName('')
            setStart('')
            setEnd('')
            setBrk('60')
            setCode('')
            setColor('')
          } else setSaved(true)
          router.refresh()
        })
      }}
      className="grid gap-3 py-3 md:grid-cols-[1.4fr_1fr_1fr_0.9fr_auto_auto] md:items-end"
    >
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`${idp}-name`}>
        {t ? tr(timeCopy.shiftName) : tr(timeCopy.newShift)}
        <input id={`${idp}-name`} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(timeCopy.shiftNamePlaceholder)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`${idp}-start`}>
        {tr(timeCopy.shiftStart)}
        <input id={`${idp}-start`} type="time" required value={startT} onChange={(e) => setStart(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`${idp}-end`}>
        {tr(timeCopy.shiftEnd)}
        <input id={`${idp}-end`} type="time" required value={endT} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`${idp}-brk`}>
        {tr(timeCopy.shiftBreak)}
        <input id={`${idp}-brk`} type="number" min={0} max={240} step={5} value={brk} onChange={(e) => setBrk(e.target.value)} className={inputClass} />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm" htmlFor={`${idp}-active`}>
        <input id={`${idp}-active`} type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        {tr(timeCopy.shiftActive)}
      </label>
      <button type="submit" disabled={pending || !dirty} className={cn(btn, t ? 'border border-border hover:border-primary/40' : 'bg-primary text-primary-foreground hover:opacity-90')}>
        {pending ? <Spinner className="h-4 w-4" /> : !t && <Plus className="h-4 w-4" aria-hidden="true" />}
        {t ? tr(timeCopy.save) : tr(timeCopy.addShift)}
      </button>
      {/* Code and colour on the monthly roster (§26). */}
      <div className="flex flex-wrap items-center gap-3 md:col-span-6">
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground" htmlFor={`${idp}-code`}>
          {tr(timeCopy.shiftCode)}
          <input
            id={`${idp}-code`}
            maxLength={3}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={name ? autoShortCode(name) : ''}
            className={cn(inputClass, 'w-16 text-center')}
          />
        </label>
        <span className="text-xs font-semibold text-muted-foreground">{tr(timeCopy.shiftColor)}</span>
        <div className="flex flex-wrap gap-1.5">
          {SHIFT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn('h-7 w-7 rounded-md text-[11px] font-bold text-white ring-offset-2', color === c && 'ring-2 ring-foreground')}
              style={{ backgroundColor: c }}
            >
              {color === c ? shownCode : ''}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground md:col-span-6">
        {paid !== null && (
          <>
            {tr(timeCopy.shiftPaid)} {Math.floor(paid / 60)} {tr(timeCopy.hoursShort)} {String(paid % 60).padStart(2, '0')} {tr(timeCopy.minutesShort)}
            {endT < startT && ` · ${tr(timeCopy.overnight)}`}
          </>
        )}
        {saved && !dirty && <span className="ml-2 font-semibold text-accent">✓ {tr(timeCopy.saved)}</span>}
        {error && <span className="ml-2 font-semibold text-destructive">{tr(shiftErrors[error] ?? shiftErrors.failed)}</span>}
      </p>
    </form>
  )
}

