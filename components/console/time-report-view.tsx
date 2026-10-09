'use client'

import { Fragment, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { formatMemberDate } from '@/lib/format-date'
import { REPORTS_PATH, TEAM_PATH } from '@/lib/auth/roles'
import { leaveCopy, LEAVE_KINDS, type LeaveKind } from '@/lib/leave'
import type { PayTab, TimePeriod, TimePreset } from '@/lib/console/time-period'
import { leaveTotal, needsCheck, type DayRow, type PersonTime, type TimeReport } from '@/lib/console/time-report-calc'
import { cn } from '@/lib/utils'

type L = { th: string; en: string }
const t = {
  sales: { th: 'การขาย', en: 'Sales' },
  time: { th: 'ลงเวลา', en: 'Time' },
  title: { th: 'รายงานการลงเวลา', en: 'Time report' },
  monthly: { th: 'รายเดือน', en: 'Monthly' },
  daily: { th: 'รายวัน', en: 'Daily' },
  none: { th: 'ยังไม่ระบุ', en: 'Not set' },
  cycle: { th: 'รอบนี้', en: 'This period' },
  last_cycle: { th: 'รอบที่แล้ว', en: 'Last period' },
  month: { th: 'เดือนนี้', en: 'This month' },
  last_month: { th: 'เดือนก่อน', en: 'Last month' },
  fromTo: { th: 'ถึง', en: 'to' },
  show: { th: 'ดู', en: 'Show' },
  failed: { th: 'โหลดรายงานไม่สำเร็จ ลองใหม่อีกครั้ง', en: 'Couldn’t load the report — try again' },
  notSetUp: { th: 'ยังแยกรายวัน/รายเดือนไม่ได้ — รัน supabase/schema.sql (§28) ก่อน · ระหว่างนี้ทุกคนอยู่ใน “ยังไม่ระบุ”', en: 'Daily / monthly isn’t set up — run supabase/schema.sql (§28) · meanwhile everyone is under “Not set”' },
  unset: { th: '{n} คนยังไม่ได้ระบุว่าเป็นรายวันหรือรายเดือน', en: '{n} people have no pay type yet' },
  setThem: { th: 'ตั้งที่หน้าทีมงาน', en: 'Set on the Team page' },
  nobody: { th: 'ไม่มีพนักงานในกลุ่มนี้', en: 'Nobody in this group' },
  howMonthly: { th: 'รายเดือน: ดูวันขาดและวันลาเพื่อหักจากเงินเดือน · ลาที่อนุมัติแล้วไม่นับเป็นขาด', en: 'Monthly: absences and leave to deduct · approved leave is not an absence' },
  howDaily: { th: 'รายวัน: นับวันที่มาทำงาน (มาไม่เต็มกะนับ 1 วัน ดูชั่วโมงจริงประกอบ)', en: 'Daily: days worked (part of a day counts as one — see the hours beside it)' },
  // columns
  colName: { th: 'ชื่อ', en: 'Name' },
  colPlanned: { th: 'วันมีกะ', en: 'Rostered' },
  colCame: { th: 'มา', en: 'Came' },
  colDays: { th: 'วันทำงาน', en: 'Days worked' },
  colAbsent: { th: 'ขาด', en: 'Absent' },
  colLeave: { th: 'ลา', en: 'Leave' },
  colLate: { th: 'สาย', en: 'Late' },
  colEarly: { th: 'ออกก่อน', en: 'Left early' },
  colOt: { th: 'OT', en: 'OT' },
  colHours: { th: 'ชม. จริง / ตามกะ', en: 'Hours / planned' },
  colHoursOnly: { th: 'ชม. รวม', en: 'Hours' },
  colHoliday: { th: 'ทำวันนักขัตฯ', en: 'Public holiday' },
  colCheck: { th: 'ต้องตรวจ', en: 'Check' },
  days: { th: '{n} วัน', en: '{n} d' },
  shifts: { th: '{n} กะ', en: '{n} shifts' },
  times: { th: '{n} ครั้ง', en: '{n}×' },
  lv_vacation: { th: 'พักร้อน', en: 'Vacation' },
  lv_sick: { th: 'ป่วย', en: 'Sick' },
  lv_personal: { th: 'กิจ', en: 'Personal' },
  // day detail
  dDate: { th: 'วันที่', en: 'Date' },
  dShift: { th: 'กะ', en: 'Shift' },
  dInOut: { th: 'เข้า – ออก', en: 'In – out' },
  dHours: { th: 'ชม.', en: 'Hours' },
  dNote: { th: 'หมายเหตุ', en: 'Note' },
  s_worked: { th: 'มา', en: 'Worked' },
  s_partial: { th: 'มาไม่ครบกะ', en: 'Missed a shift' },
  s_absent: { th: 'ขาด', en: 'Absent' },
  s_leave: { th: 'ลา', en: 'Leave' },
  s_off: { th: 'วันหยุด', en: 'Day off' },
  s_upcoming: { th: 'ยังไม่ถึง', en: 'Upcoming' },
  forgot: { th: 'ลืมลงเวลาออก', en: 'Forgot to clock out' },
  adminOut: { th: 'แอดมินลงออก', en: 'Clocked out by admin' },
  edited: { th: 'แก้ไขเวลา', en: 'Time edited' },
  stillIn: { th: 'ยังอยู่', en: 'Still in' },
  noDays: { th: 'ไม่มีกะหรือการลงเวลาในช่วงนี้', en: 'No shifts or clock entries in this period' },
  checkHint: { th: 'ลืมลงเวลาออก / แอดมินลงออกให้ / แก้ไขเวลา — แตะชื่อเพื่อดูรายวัน', en: 'Forgot to clock out / clocked out by admin / edited — tap a name for the days' },
  // export
  export: { th: 'Export CSV', en: 'Export CSV' },
  exSummary: { th: 'สรุปรายคน ({p})', en: 'Per person ({p})' },
  exDaily: { th: 'รายวันทุกคน', en: 'Day by day, everyone' },
} satisfies Record<string, L>

const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'
const th = 'px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap'
const td = 'px-3 py-2.5 align-top'
const num = 'px-3 py-2.5 text-right tabular-nums align-top whitespace-nowrap'

export const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`

// Sales | Time switch at the top of Reports.
export function ReportTabs({ active }: { active: 'sales' | 'time' }) {
  const { tr } = useLanguage()
  return (
    <div className="inline-flex self-start rounded-full bg-secondary p-1 text-sm font-semibold" role="tablist">
      {(['sales', 'time'] as const).map((k) => (
        <a
          key={k}
          role="tab"
          aria-selected={active === k}
          href={k === 'sales' ? REPORTS_PATH : `${REPORTS_PATH}?r=time`}
          className={cn('rounded-full px-4 py-1.5', active === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {tr(t[k])}
        </a>
      ))}
    </div>
  )
}

export function TimeReportView({ period, report, paySetUp }: { period: TimePeriod; report: TimeReport | null; paySetUp: boolean }) {
  const { tr, lang } = useLanguage()
  const date = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d
  const span = (a: string, b: string) => (a === b ? date(a) : `${date(a)} – ${date(b)}`)
  const base = `${REPORTS_PATH}?r=time&pay=${period.pay}`
  const qs = `pay=${period.pay}&from=${period.from}&to=${period.to}`

  const people = report?.people ?? []
  const groups: Record<PayTab, PersonTime[]> = {
    monthly: people.filter((p) => p.payType === 'monthly'),
    daily: people.filter((p) => p.payType === 'daily'),
    none: people.filter((p) => !p.payType),
  }
  const tabs: PayTab[] = groups.none.length || period.pay === 'none' ? ['monthly', 'daily', 'none'] : ['monthly', 'daily']
  const shown = groups[period.pay]
  const presets = ['cycle', 'last_cycle', 'month', 'last_month'] as const satisfies readonly TimePreset[]
  const presetHint: Partial<Record<TimePreset, string>> =
    period.pay === 'none' ? {} : { cycle: span(period.cycle.from, period.cycle.to), last_cycle: span(period.lastCycle.from, period.lastCycle.to) }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
      <ReportTabs active="time" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold md:text-3xl">{tr(t.title)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{span(period.from, period.to)}</p>
        </div>
        <ExportMenu qs={qs} payLabel={tr(t[period.pay])} />
      </div>

      {/* Pay type */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-secondary p-1 text-sm font-semibold" role="tablist">
          {tabs.map((k) => (
            <a
              key={k}
              role="tab"
              aria-selected={period.pay === k}
              href={`${REPORTS_PATH}?r=time&pay=${k}&p=${period.preset === 'custom' ? 'cycle' : period.preset}`}
              className={cn('rounded-full px-4 py-1.5', period.pay === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {tr(t[k])} <span className="text-muted-foreground">{groups[k].length}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Period */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) =>
          p.endsWith('cycle') && period.pay === 'none' ? null : (
            <a
              key={p}
              href={`${base}&p=${p}`}
              title={presetHint[p]}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-semibold',
                period.preset === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary',
              )}
            >
              {tr(t[p])}
              {presetHint[p] && <span className={cn('ml-1.5 text-xs font-normal', period.preset === p ? 'opacity-80' : 'text-muted-foreground')}>{presetHint[p]}</span>}
            </a>
          ),
        )}
        <form action={REPORTS_PATH} className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="r" value="time" />
          <input type="hidden" name="pay" value={period.pay} />
          <input type="date" name="from" defaultValue={period.from} className="h-9 rounded-full border border-border bg-background px-3" />
          <span className="text-muted-foreground">{tr(t.fromTo)}</span>
          <input type="date" name="to" defaultValue={period.to} className="h-9 rounded-full border border-border bg-background px-3" />
          <button type="submit" className="h-9 rounded-full border border-border px-4 font-semibold hover:bg-secondary">
            {tr(t.show)}
          </button>
        </form>
      </div>

      {!paySetUp && <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(t.notSetUp)}</p>}
      {paySetUp && groups.none.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {tr(t.unset).replace('{n}', String(groups.none.length))}
          <a href={TEAM_PATH} className="underline">
            {tr(t.setThem)}
          </a>
        </p>
      )}

      {!report ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr(t.failed)}
        </p>
      ) : (
        <section className={card}>
          <p className="mb-3 text-xs text-muted-foreground">{tr(period.pay === 'daily' ? t.howDaily : t.howMonthly)}</p>
          {shown.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{tr(t.nobody)}</p>
          ) : (
            <PeopleTable people={shown} daily={period.pay === 'daily'} date={date} />
          )}
          <p className="mt-3 text-xs text-muted-foreground">{tr(t.checkHint)}</p>
        </section>
      )}
    </div>
  )
}

function PeopleTable({ people, daily, date }: { people: PersonTime[]; daily: boolean; date: (d: string) => string }) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState<string | null>(null)
  const dash = <span className="text-muted-foreground">—</span>
  const n = (v: number, unit?: L) => (v ? (unit ? tr(unit).replace('{n}', String(v)) : String(v)) : dash)
  const cols = daily ? 9 : 11

  return (
    <div className="-mx-3 overflow-x-auto">
      <table className="w-full min-w-[56rem] text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>{tr(t.colName)}</th>
            {daily ? (
              <>
                <th className={cn(th, 'text-right')}>{tr(t.colDays)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colHoursOnly)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colOt)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colLate)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colHoliday)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colAbsent)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colLeave)}</th>
              </>
            ) : (
              <>
                <th className={cn(th, 'text-right')}>{tr(t.colPlanned)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colCame)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colAbsent)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colLeave)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colLate)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colEarly)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colOt)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colHours)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colHoliday)}</th>
              </>
            )}
            <th className={cn(th, 'text-right')}>{tr(t.colCheck)}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {people.map((p) => {
            const isOpen = open === p.id
            const leave = leaveTotal(p)
            const leaveCell = leave ? (
              <span title={LEAVE_KINDS.filter((k) => p.leave[k]).map((k) => `${tr(leaveCopy[k])} ${p.leave[k]}`).join(' · ')}>
                {tr(t.days).replace('{n}', String(leave))}
                <span className="block text-[11px] text-muted-foreground">
                  {LEAVE_KINDS.filter((k) => p.leave[k])
                    .map((k) => `${tr(t[`lv_${k}` as `lv_${LeaveKind}`])} ${p.leave[k]}`)
                    .join(' · ')}
                </span>
              </span>
            ) : (
              dash
            )
            const absentCell =
              p.absentDays || p.missedShifts ? (
                <span className="font-semibold text-destructive">
                  {p.absentDays ? tr(t.days).replace('{n}', String(p.absentDays)) : ''}
                  {p.missedShifts > p.absentDays && (
                    <span className="block text-[11px] font-normal">{tr(t.shifts).replace('{n}', String(p.missedShifts))}</span>
                  )}
                </span>
              ) : (
                dash
              )
            const lateCell = p.lateCount ? (
              <span className="text-amber-700 dark:text-amber-400">
                {tr(t.times).replace('{n}', String(p.lateCount))}
                <span className="block text-[11px]">{hm(p.lateMinutes)}</span>
              </span>
            ) : (
              dash
            )
            const holidayCell = p.holidayDays ? (
              <span>
                {tr(t.days).replace('{n}', String(p.holidayDays))}
                <span className="block text-[11px] text-muted-foreground">{hm(p.holidayMinutes)}</span>
              </span>
            ) : (
              dash
            )
            const check = needsCheck(p)
            return (
              <Fragment key={p.id}>
                <tr className={cn('cursor-pointer hover:bg-secondary/50', isOpen && 'bg-secondary/50')} onClick={() => setOpen(isOpen ? null : p.id)}>
                  <td className={cn(td, 'font-semibold')}>
                    <span className="inline-flex items-center gap-1.5">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                      {p.name}
                    </span>
                    {p.memberNo && <span className="block pl-[1.375rem] font-mono text-[11px] font-normal text-muted-foreground">{p.memberNo}</span>}
                  </td>
                  {daily ? (
                    <>
                      <td className={cn(num, 'text-base font-bold')}>{p.daysWorked}</td>
                      <td className={cn(num, 'font-semibold')}>{hm(p.workedMinutes)}</td>
                      <td className={num}>{p.otMinutes ? hm(p.otMinutes) : dash}</td>
                      <td className={num}>{lateCell}</td>
                      <td className={num}>{holidayCell}</td>
                      <td className={num}>{absentCell}</td>
                      <td className={num}>{leaveCell}</td>
                    </>
                  ) : (
                    <>
                      <td className={num}>{n(p.scheduledDays)}</td>
                      <td className={num}>{n(p.daysWorked)}</td>
                      <td className={cn(num, 'text-base')}>{absentCell}</td>
                      <td className={num}>{leaveCell}</td>
                      <td className={num}>{lateCell}</td>
                      <td className={num}>
                        {p.earlyCount ? (
                          <span className="text-amber-700 dark:text-amber-400">
                            {tr(t.times).replace('{n}', String(p.earlyCount))}
                            <span className="block text-[11px]">{hm(p.earlyMinutes)}</span>
                          </span>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className={num}>{p.otMinutes ? hm(p.otMinutes) : dash}</td>
                      <td className={num}>
                        <span className="font-semibold">{hm(p.workedMinutes)}</span>
                        <span className="text-muted-foreground"> / {hm(p.scheduledMinutes)}</span>
                      </td>
                      <td className={num}>{holidayCell}</td>
                    </>
                  )}
                  <td className={num}>
                    {check ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        {check}
                      </span>
                    ) : (
                      dash
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={cols} className="bg-secondary/30 px-3 pb-4 pt-1">
                      <DayTable days={p.days} date={date} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const time = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const weekday = (d: string, lang: 'th' | 'en') =>
  new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', weekday: 'short' }).format(new Date(`${d}T12:00:00+07:00`))

const statusTone: Record<DayRow['status'], string> = {
  worked: 'bg-accent/15 text-accent',
  partial: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  absent: 'bg-destructive/10 text-destructive',
  leave: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
  off: 'bg-secondary text-muted-foreground',
  upcoming: 'bg-secondary text-muted-foreground',
  none: '',
}

function DayTable({ days, date }: { days: DayRow[]; date: (d: string) => string }) {
  const { tr, lang } = useLanguage()
  const rows = days.filter((d) => d.status !== 'none' || d.holiday)
  if (rows.length === 0) return <p className="py-3 text-sm text-muted-foreground">{tr(t.noDays)}</p>
  const tag = (text: string, tone: string) => <span className={cn('mr-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}>{text}</span>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className={th}>{tr(t.dDate)}</th>
          <th className={th}>{tr(t.dShift)}</th>
          <th className={th}>{tr(t.dInOut)}</th>
          <th className={cn(th, 'text-right')}>{tr(t.dHours)}</th>
          <th className={cn(th, 'text-right')}>{tr(t.colLate)}</th>
          <th className={cn(th, 'text-right')}>{tr(t.colEarly)}</th>
          <th className={cn(th, 'text-right')}>{tr(t.colOt)}</th>
          <th className={th}>{tr(t.dNote)}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {rows.map((d) => (
          <tr key={d.date} className={cn((d.status === 'off' || d.status === 'upcoming' || d.status === 'none') && 'text-muted-foreground')}>
            <td className={cn(td, 'whitespace-nowrap')}>
              <span className="inline-block w-8 text-xs text-muted-foreground">{weekday(d.date, lang)}</span>
              {date(d.date)}
            </td>
            <td className={td}>{d.shifts.join(' + ') || '—'}</td>
            <td className={cn(td, 'tabular-nums whitespace-nowrap')}>
              {d.entries.length === 0
                ? '—'
                : d.entries.map((e, i) => (
                    <span key={i} className="block">
                      {time(e.clockIn)} – {e.clockOut ? time(e.clockOut) : e.forgotten ? <b className="text-destructive">?</b> : <b className="text-accent">{tr(t.stillIn)}</b>}
                    </span>
                  ))}
            </td>
            <td className={num}>{d.entries.length ? hm(d.workedMinutes) : '—'}</td>
            <td className={num}>{d.lateMinutes ? <span className="text-amber-700 dark:text-amber-400">{d.lateMinutes}′</span> : '—'}</td>
            <td className={num}>{d.earlyMinutes ? <span className="text-amber-700 dark:text-amber-400">{d.earlyMinutes}′</span> : '—'}</td>
            <td className={num}>{d.otMinutes ? hm(d.otMinutes) : '—'}</td>
            <td className={td}>
              {d.status !== 'none' && tag(d.status === 'leave' && d.leave ? tr(leaveCopy[d.leave]) : tr(t[`s_${d.status}`]), statusTone[d.status])}
              {d.status === 'partial' && d.missedShifts > 0 && tag(tr(t.shifts).replace('{n}', String(d.missedShifts)), statusTone.absent)}
              {d.holiday && tag(d.holiday, 'bg-primary/10 text-primary')}
              {d.entries.some((e) => e.forgotten) && tag(tr(t.forgot), statusTone.absent)}
              {d.entries.some((e) => e.adminOut) && tag(tr(t.adminOut), statusTone.partial)}
              {d.entries.some((e) => e.edited && !e.adminOut) && tag(tr(t.edited), statusTone.partial)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ExportMenu({ qs, payLabel }: { qs: string; payLabel: string }) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState(false)
  const items = [
    ['summary', tr(t.exSummary).replace('{p}', payLabel)],
    ['daily', tr(t.exDaily)],
  ] as const
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:bg-secondary"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {tr(t.export)}
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {items.map(([type, label]) => (
            <a key={type} href={`${REPORTS_PATH}/time-export?type=${type}&${qs}`} onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-secondary">
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
