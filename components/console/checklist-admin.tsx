'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Download, Flag, ScanLine } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { formatMemberDate } from '@/lib/format-date'
import { CHECKLIST_PATH, MY_CHECKLIST_PATH } from '@/lib/auth/roles'
import { checklistCopy as c, hhmm, slotsOn, slotState, withLivePoints, type Answer, type CheckPoint, type CheckRound, type CheckScan, type SlotState } from '@/lib/checklist'
import { ChecklistSetup } from '@/components/console/checklist-setup'
import { cn } from '@/lib/utils'

export type ChecklistTab = 'board' | 'log' | 'setup'

type L = { th: string; en: string }
const t = {
  intro: { th: 'จุดตรวจติด QR · พนักงานสแกนด้วยมือถือตัวเอง · ทุกการสแกนเก็บเป็นประวัติ แก้ไม่ได้', en: 'QR stickers at each point · staff scan with their own phone · every scan is kept and can’t be edited' },
  board: { th: 'วันนี้', en: 'Today' },
  log: { th: 'ประวัติ', en: 'Log' },
  setup: { th: 'ตั้งค่าจุดและรอบ', en: 'Points & rounds' },
  issues: { th: 'แจ้งปัญหา', en: 'Problems reported' },
  noRounds: { th: 'ยังไม่มีรอบตรวจ — ไปที่ “ตั้งค่าจุดและรอบ” เพื่อเริ่ม', en: 'No rounds yet — start in “Points & rounds”' },
  noSlots: { th: 'วันนี้ไม่มีรอบที่ต้องทำ', en: 'No rounds on this day' },
  pick: { th: 'แตะช่วงเวลาเพื่อดูรายละเอียด', en: 'Tap a time to see who checked what' },
  notScanned: { th: 'ยังไม่สแกน', en: 'Not scanned' },
  from: { th: 'ตั้งแต่', en: 'From' },
  to: { th: 'ถึง', en: 'To' },
  allPoints: { th: 'ทุกจุด', en: 'All points' },
  allStaff: { th: 'ทุกคน', en: 'Everyone' },
  show: { th: 'ดู', en: 'Show' },
  csv: { th: 'ดาวน์โหลด CSV', en: 'Download CSV' },
  colTime: { th: 'เวลา', en: 'Time' },
  colPoint: { th: 'จุด', en: 'Point' },
  colStaff: { th: 'พนักงาน', en: 'Staff' },
  colResult: { th: 'ผลตรวจ', en: 'Result' },
  colNote: { th: 'หมายเหตุ', en: 'Note' },
  noScans: { th: 'ไม่มีการสแกนในช่วงนี้', en: 'No scans in this period' },
  limited: { th: 'แสดง 1,000 รายการล่าสุด — ดาวน์โหลด CSV เพื่อดูทั้งหมด', en: 'Showing the latest 1,000 — download the CSV for all' },
  ticks: { th: 'ติ๊ก {a}/{b}', en: '{a}/{b} ticked' },
  anytime: { th: 'ทำเมื่อต้องการ — ตรวจล่าสุด', en: 'Any time — last checked' },
  pointsN: { th: '{n} จุด', en: '{n} points' },
  scanPhone: { th: 'สแกนจุด (มือถือ)', en: 'Scan a point (phone)' },
} satisfies Record<string, L>

const tone: Record<SlotState['status'], string> = {
  done: 'bg-accent text-white',
  open: 'bg-primary/10 text-primary ring-1 ring-primary/40',
  upcoming: 'bg-secondary text-muted-foreground',
  partial: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  missed: 'bg-destructive/15 text-destructive',
}
const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'

const flagText = (f: string, tr: (l: L) => string) => tr((c as Record<string, L>)[`flag_${f}`] ?? { th: f, en: f })

export function resultSummary(results: Answer[], tr: (l: L) => string): string {
  const checks = results.filter((r) => typeof r.value === 'boolean')
  const parts: string[] = []
  if (checks.length) parts.push(tr(t.ticks).replace('{a}', String(checks.filter((r) => r.value === true).length)).replace('{b}', String(checks.length)))
  for (const r of results) if (typeof r.value === 'number' || (typeof r.value === 'string' && r.value)) parts.push(`${r.label} ${r.value}`)
  return parts.join(' · ')
}

export function ChecklistAdmin({
  tab,
  today,
  date,
  range,
  setUp,
  points,
  rounds,
  scans,
  staff,
}: {
  tab: ChecklistTab
  today: string
  date: string
  range: { from: string; to: string; point: string; staff: string }
  setUp: boolean
  points: CheckPoint[]
  rounds: CheckRound[]
  scans: CheckScan[]
  staff: { id: string; name: string }[]
}) {
  const { tr } = useLanguage()
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold md:text-3xl">{tr(c.title)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{tr(t.intro)}</p>
          </div>
          <Link href={MY_CHECKLIST_PATH} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:bg-secondary">
            <ScanLine className="h-4 w-4" aria-hidden="true" />
            {tr(t.scanPhone)}
          </Link>
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="inline-flex min-w-max rounded-full bg-secondary p-1 text-sm font-semibold" role="tablist">
          {(['board', 'log', 'setup'] as const).map((k) => (
            <Link
              key={k}
              role="tab"
              aria-selected={tab === k}
              href={`${CHECKLIST_PATH}?tab=${k}`}
              className={cn('rounded-full px-4 py-2', tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {tr(t[k])}
            </Link>
          ))}
        </div>
      </div>
      {!setUp ? (
        <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>
      ) : tab === 'board' ? (
        <Board today={today} date={date} points={points} rounds={rounds} scans={scans} />
      ) : tab === 'log' ? (
        <Log range={range} points={points} scans={scans} staff={staff} />
      ) : (
        <ChecklistSetup points={points} rounds={rounds} />
      )}
    </div>
  )
}

function Board({ today, date, points, rounds, scans }: { today: string; date: string; points: CheckPoint[]; rounds: CheckRound[]; scans: CheckScan[] }) {
  const { tr, lang } = useLanguage()
  const [now] = useState(() => Date.now())
  const pmap = useMemo(() => new Map(points.map((p) => [p.id, p])), [points])
  const live = withLivePoints(
    rounds.filter((r) => r.active),
    points,
  )
  const rows = live.filter((r) => r.kind !== 'anytime').map((r) => ({ round: r, slots: slotsOn(r, date).map((s) => slotState(s, r, scans, now)) }))
  const anytime = live.filter((r) => r.kind === 'anytime')
  const [sel, setSel] = useState<{ round: string; start: number } | null>(() => {
    const first = rows.find((x) => x.slots.some((s) => s.status === 'open'))
    const s = first?.slots.find((x) => x.status === 'open')
    return first && s ? { round: first.round.id, start: s.start } : null
  })
  const issues = scans.filter((s) => s.issue)
  const shift = (n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const day = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d

  return (
    <>
      <div className="flex items-center gap-2">
        <Link href={`${CHECKLIST_PATH}?tab=board&date=${shift(-1)}`} className="rounded-full border border-border p-2 hover:bg-secondary" aria-label="previous day">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <span className="min-w-[9rem] text-center font-semibold">{date === today ? `${tr(t.board)} · ${day(date)}` : day(date)}</span>
        {date < today && (
          <Link href={`${CHECKLIST_PATH}?tab=board&date=${shift(1)}`} className="rounded-full border border-border p-2 hover:bg-secondary" aria-label="next day">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>

      {issues.length > 0 && (
        <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {tr(t.issues)} ({issues.length})
          </h2>
          <ul className="mt-2 divide-y divide-destructive/20 text-sm">
            {issues.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-x-3 py-2">
                <span className="tabular-nums text-muted-foreground">{hhmm(Date.parse(s.at))}</span>
                <b>{pmap.get(s.pointId)?.name ?? '—'}</b>
                <span>{s.note || '—'}</span>
                <span className="text-muted-foreground">· {s.staffName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rounds.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tr(t.noRounds)}</p>
      ) : rows.every((x) => x.slots.length === 0) && anytime.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tr(t.noSlots)}</p>
      ) : (
        <section className={card}>
          <p className="mb-3 text-xs text-muted-foreground">{tr(t.pick)}</p>
          <div className="space-y-3">
            {rows
              .filter((x) => x.slots.length)
              .map(({ round, slots }) => (
                <div key={round.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 md:flex-row md:items-start">
                  <div className="md:w-48 md:shrink-0">
                    <p className="font-semibold">{round.name}</p>
                    <p className="text-xs text-muted-foreground">{tr(t.pointsN).replace('{n}', String(round.pointIds.length))}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {slots.map((s) => {
                      const n = round.pointIds.filter((p) => s.done[p]).length
                      const active = sel?.round === round.id && sel.start === s.start
                      return (
                        <button
                          key={s.start}
                          type="button"
                          onClick={() => setSel(active ? null : { round: round.id, start: s.start })}
                          className={cn('rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold tabular-nums', tone[s.status], active && 'outline outline-2 outline-offset-2 outline-foreground')}
                        >
                          <span className="block">
                            {hhmm(s.start)}–{hhmm(s.end)}
                          </span>
                          <span className="block opacity-80">
                            {tr(c[s.status])} · {n}/{round.pointIds.length}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
          {sel &&
            (() => {
              const row = rows.find((x) => x.round.id === sel.round)
              const s = row?.slots.find((x) => x.start === sel.start)
              if (!row || !s) return null
              return <SlotDetail round={row.round} slot={s} pmap={pmap} />
            })()}
        </section>
      )}

      {anytime.map((r) => (
        <section key={r.id} className={card}>
          <h2 className="text-base font-bold">{r.name}</h2>
          <p className="text-xs text-muted-foreground">{tr(t.anytime)}</p>
          <ul className="mt-2 divide-y divide-border text-sm">
            {r.pointIds.map((id) => {
              const last = scans.find((s) => s.pointId === id)
              return (
                <li key={id} className="flex justify-between gap-3 py-2">
                  <span className="font-semibold">{pmap.get(id)?.name}</span>
                  <span className="text-muted-foreground">{last ? `${hhmm(Date.parse(last.at))} · ${last.staffName}` : '—'}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}

function SlotDetail({ round, slot, pmap }: { round: CheckRound; slot: SlotState; pmap: Map<string, CheckPoint> }) {
  const { tr } = useLanguage()
  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-3">
      <p className="text-sm font-bold">
        {round.name} · {hhmm(slot.start)}–{hhmm(slot.end)}
      </p>
      <ul className="mt-2 divide-y divide-border text-sm">
        {round.pointIds.map((id) => {
          const s = slot.done[id]
          return (
            <li key={id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
              <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', s ? 'bg-accent text-white' : 'border-2 border-border')}>
                {s && <Check className="h-3 w-3" aria-hidden="true" />}
              </span>
              <span className="min-w-[8rem] font-semibold">{pmap.get(id)?.name}</span>
              {s ? (
                <span className="flex-1 text-muted-foreground">
                  <span className="tabular-nums">{hhmm(Date.parse(s.at))}</span> · {s.staffName}
                  {resultSummary(s.results, tr) && <> · {resultSummary(s.results, tr)}</>}
                  {s.note && <> · “{s.note}”</>}
                  <Flags flags={s.flags} />
                </span>
              ) : (
                <span className="text-muted-foreground">{tr(t.notScanned)}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Flags({ flags }: { flags: string[] }) {
  const { tr } = useLanguage()
  if (!flags.length) return null
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {flags.map((f) => (
        <span
          key={f}
          className={cn(
            'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
            f === 'issue' ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
          )}
        >
          <Flag className="h-2.5 w-2.5" aria-hidden="true" />
          {flagText(f, tr)}
        </span>
      ))}
    </span>
  )
}

function Log({
  range,
  points,
  scans,
  staff,
}: {
  range: { from: string; to: string; point: string; staff: string }
  points: CheckPoint[]
  scans: CheckScan[]
  staff: { id: string; name: string }[]
}) {
  const { tr, lang } = useLanguage()
  const pmap = new Map(points.map((p) => [p.id, p]))
  const people = new Map(staff.map((s) => [s.id, s.name]))
  for (const s of scans) if (!people.has(s.staffId)) people.set(s.staffId, s.staffName)
  const qs = new URLSearchParams({ from: range.from, to: range.to, ...(range.point ? { point: range.point } : {}), ...(range.staff ? { staff: range.staff } : {}) })
  const sel = 'h-9 rounded-full border border-border bg-background px-3 text-sm'
  const when = (iso: string) => `${formatMemberDate(iso, lang, true) ?? ''} ${hhmm(Date.parse(iso))}`

  return (
    <section className={card}>
      <form action={CHECKLIST_PATH} className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="tab" value="log" />
        <span className="text-muted-foreground">{tr(t.from)}</span>
        <input type="date" name="from" defaultValue={range.from} className={sel} />
        <span className="text-muted-foreground">{tr(t.to)}</span>
        <input type="date" name="to" defaultValue={range.to} className={sel} />
        <select name="point" defaultValue={range.point} className={sel}>
          <option value="">{tr(t.allPoints)}</option>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="staff" defaultValue={range.staff} className={sel}>
          <option value="">{tr(t.allStaff)}</option>
          {[...people].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-full border border-border px-4 font-semibold hover:bg-secondary">
          {tr(t.show)}
        </button>
        <a href={`${CHECKLIST_PATH}/export?${qs}`} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 font-semibold hover:bg-secondary">
          <Download className="h-4 w-4" aria-hidden="true" />
          {tr(t.csv)}
        </a>
      </form>

      {scans.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{tr(t.noScans)}</p>
      ) : (
        <div className="-mx-3 mt-4 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-semibold">{tr(t.colTime)}</th>
                <th className="px-3 py-2 font-semibold">{tr(t.colPoint)}</th>
                <th className="px-3 py-2 font-semibold">{tr(t.colStaff)}</th>
                <th className="px-3 py-2 font-semibold">{tr(t.colResult)}</th>
                <th className="px-3 py-2 font-semibold">{tr(t.colNote)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {scans.map((s) => (
                <tr key={s.id} className={cn(s.issue && 'bg-destructive/5')}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{when(s.at)}</td>
                  <td className="px-3 py-2 font-semibold">{pmap.get(s.pointId)?.name ?? '—'}</td>
                  <td className="px-3 py-2">{s.staffName}</td>
                  <td className="px-3 py-2">
                    {resultSummary(s.results, tr) || '—'}
                    <Flags flags={s.flags} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {scans.length >= 1000 && <p className="mt-2 px-3 text-xs text-muted-foreground">{tr(t.limited)}</p>}
        </div>
      )}
    </section>
  )
}
