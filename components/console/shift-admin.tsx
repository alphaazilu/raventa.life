'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Copy, Plus } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { shiftErrors, timeCopy } from '@/lib/console/copy'
import { shiftLengthMinutes, type ShiftAssignment, type ShiftTemplate, type TimeSettings } from '@/lib/console/shift-math'
import { copyPreviousWeek, saveTemplate, saveTimeSettings, setAssignment } from '@/app/console/time/shift-actions'
import { cn } from '@/lib/utils'

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
  const value = new Map(assignments.map((a) => [`${a.staffId}|${a.date}`, a.dayOff ? 'off' : (a.templateId ?? '')]))
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
                          onChange={(e) => change(p.id, d, e.target.value)}
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
                          {v && v !== 'off' && !active.some((t) => t.id === v) && <option value={v}>{templates.find((t) => t.id === v)?.name ?? '?'}</option>}
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

// Shift templates + the late / OT rules.
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
      <RulesForm settings={settings} />
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
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const idp = t ? `t-${t.id}` : 't-new'
  const dirty = !t || name !== t.name || startT !== t.start || endT !== t.end || brk !== String(t.breakMinutes) || active !== t.active
  const len = /^\d\d:\d\d$/.test(startT) && /^\d\d:\d\d$/.test(endT) && startT !== endT ? shiftLengthMinutes({ start: startT, end: endT }) : null
  const paid = len !== null ? Math.max(0, len - (Number(brk) || 0)) : null

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError(null)
          setSaved(false)
          const r = await saveTemplate({ id: t?.id, name, start: startT, end: endT, breakMinutes: Number(brk), active })
          if (!r.ok) {
            setError(r.error)
            return
          }
          if (!t) {
            setName('')
            setStart('')
            setEnd('')
            setBrk('60')
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

function RulesForm({ settings }: { settings: TimeSettings }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [grace, setGrace] = useState(String(settings.lateGraceMinutes))
  const [ot, setOt] = useState(String(settings.otMinMinutes))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{tr(timeCopy.rules)}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            setError(null)
            setSaved(false)
            const r = await saveTimeSettings(Number(grace), Number(ot))
            if (!r.ok) setError(r.error)
            else setSaved(true)
            router.refresh()
          })
        }}
        className="mt-3 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor="rule-grace">
          {tr(timeCopy.ruleGrace)}
          <input id="rule-grace" type="number" min={0} max={120} value={grace} onChange={(e) => setGrace(e.target.value)} className={inputClass} />
          <span className="font-normal">{tr(timeCopy.ruleGraceHint)}</span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground" htmlFor="rule-ot">
          {tr(timeCopy.ruleOt)}
          <input id="rule-ot" type="number" min={0} max={240} value={ot} onChange={(e) => setOt(e.target.value)} className={inputClass} />
          <span className="font-normal">{tr(timeCopy.ruleOtHint)}</span>
        </label>
        <button type="submit" disabled={pending} className={cn(btn, 'bg-primary text-primary-foreground hover:opacity-90')}>
          {pending && <Spinner className="h-4 w-4" />}
          {tr(timeCopy.save)}
        </button>
        {(saved || error) && (
          <p className="text-sm md:col-span-3">
            {saved && <span className="font-semibold text-accent">✓ {tr(timeCopy.saved)}</span>}
            {error && <span className="font-semibold text-destructive">{tr(shiftErrors[error] ?? shiftErrors.failed)}</span>}
          </p>
        )}
      </form>
    </section>
  )
}
