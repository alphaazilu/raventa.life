'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CalendarOff, Paperclip, Plus, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { cancelLeave, requestLeave } from '@/app/account/leave-actions'
import { daysInclusive, isoAdd, LEAVE_KINDS, leaveCopy, leaveErrors, SICK_BACKDATE_DAYS, type LeaveKind, type LeaveRequest } from '@/lib/leave'
import type { MyShiftDay, MyShifts as Data } from '@/lib/my-shifts'
import { cn } from '@/lib/utils'

type L = { th: string; en: string }
const t = {
  heading: { th: 'กะของฉัน', en: 'My shifts' },
  today: { th: 'วันนี้', en: 'Today' },
  noShiftToday: { th: 'วันนี้ไม่มีกะ', en: 'No shift today' },
  dayOffToday: { th: 'วันนี้หยุด', en: 'Day off today' },
  next: { th: 'กะถัดไป: {d} {s}', en: 'Next shift: {d} {s}' },
  with: { th: 'เข้ากะด้วย: {n}', en: 'Working with: {n}' },
  thisWeek: { th: 'สัปดาห์นี้', en: 'This week' },
  nextWeek: { th: 'สัปดาห์หน้า', en: 'Next week' },
  off: { th: 'หยุด', en: 'Off' },
  notPlanned: { th: 'ยังไม่จัด', en: 'Not planned' },
  ask: { th: 'ขอหยุด', en: 'Ask for leave' },
  myRequests: { th: 'คำขอหยุดของฉัน', en: 'My leave requests' },
  cancel: { th: 'ยกเลิกคำขอ', en: 'Withdraw' },
  days: { th: '{n} วัน', en: '{n} days' },
  left: { th: '{k} เหลือ {n}/{q} วัน', en: '{k}: {n} of {q} days left' },
  // form
  formTitle: { th: 'ขอหยุด', en: 'Ask for leave' },
  kind: { th: 'ประเภท', en: 'Kind' },
  from: { th: 'ตั้งแต่', en: 'From' },
  to: { th: 'ถึง', en: 'To' },
  reason: { th: 'เหตุผล (ไม่บังคับ)', en: 'Reason (optional)' },
  doc: { th: 'แนบใบรับรองแพทย์ (ถ้ามี)', en: 'Doctor’s note (if any)' },
  notice: { th: 'ต้องขอล่วงหน้าอย่างน้อย {n} วัน · ลาป่วยแจ้งได้ทุกเมื่อ (ย้อนหลังได้ {b} วัน)', en: 'Ask at least {n} days ahead · sick leave any time (up to {b} days back)' },
  send: { th: 'ส่งคำขอ ({n} วัน)', en: 'Send ({n} days)' },
  sent: { th: 'ส่งคำขอแล้ว — รอแอดมินอนุมัติ', en: 'Sent — waiting for an admin' },
  fullDays: { th: 'ขอเป็นวันเต็ม', en: 'Full days' },
  noteFrom: { th: 'หมายเหตุจากแอดมิน: {n}', en: 'Admin’s note: {n}' },
} satisfies Record<string, L>


const STATUS_CLS: Record<LeaveRequest['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  approved: 'bg-accent/15 text-accent',
  rejected: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-secondary text-muted-foreground',
}

export function MyShifts({ data }: { data: Data }) {
  const { tr, lang } = useLanguage()
  const [form, setForm] = useState<string | null>(null) // start date when open
  const [sent, setSent] = useState(false)
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
    new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))

  const leaveOn = (d: string) =>
    data.leave.find((r) => (r.status === 'pending' || r.status === 'approved') && r.start <= d && r.end >= d)
  const todayRow = data.days.find((d) => d.date === data.today)
  const todayLeave = leaveOn(data.today)
  const quotas = LEAVE_KINDS.filter((k) => data.rules.kinds[k] && data.balance[k].quota > 0)
  const anyKind = LEAVE_KINDS.some((k) => data.rules.kinds[k])

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-card-foreground">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
          {tr(t.heading)}
        </h2>
        {anyKind && (
          <button
            type="button"
            onClick={() => {
              setSent(false)
              setForm(isoAdd(data.today, data.rules.noticeDays))
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {tr(t.ask)}
          </button>
        )}
      </div>

      {/* Today */}
      <div className="rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3">
        <p className="text-xs font-semibold text-muted-foreground">
          {tr(t.today)} · {fmt(data.today)}
        </p>
        {todayLeave ? (
          <p className="mt-1 font-display text-xl font-extrabold">
            {tr(leaveCopy[todayLeave.kind])}
            <StatusBadge status={todayLeave.status} className="ml-2 align-middle" />
          </p>
        ) : todayRow?.shift ? (
          todayRow.shifts.map((s) => (
            <p key={`${s.name}${s.start}`} className="mt-1 font-display text-xl font-extrabold">
              {s.name}
              <span className="ml-2 text-base font-semibold tabular-nums text-muted-foreground">
                {s.start}–{s.end}
              </span>
            </p>
          ))
        ) : (
          <>
            <p className="mt-1 font-display text-lg font-extrabold">{tr(todayRow?.dayOff ? t.dayOffToday : t.noShiftToday)}</p>
            {data.next?.shift && (
              <p className="text-sm text-muted-foreground">
                {tr(t.next).replace('{d}', fmt(data.next.date)).replace('{s}', data.next.shift.start)}
              </p>
            )}
          </>
        )}
        {todayRow?.shift && !todayLeave && data.todayWith.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">{tr(t.with).replace('{n}', data.todayWith.join(', '))}</p>
        )}
      </div>

      {sent && <p className="mt-2 text-sm font-semibold text-accent">{tr(t.sent)}</p>}
      {form && (
        <LeaveForm
          start={form}
          data={data}
          onClose={() => setForm(null)}
          onSent={() => {
            setForm(null)
            setSent(true)
          }}
        />
      )}

      {/* Two weeks */}
      {[0, 1].map((w) => (
        <div key={w} className="mt-3">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{tr(w === 0 ? t.thisWeek : t.nextWeek)}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {data.days.slice(w * 7, w * 7 + 7).map((d) => (
              <DayRow
                key={d.date}
                day={d}
                today={data.today}
                label={fmt(d.date)}
                leave={leaveOn(d.date)}
                onAsk={anyKind && d.date >= data.today ? () => setForm(d.date) : undefined}
              />
            ))}
          </ul>
        </div>
      ))}

      {quotas.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {quotas
            .map((k) =>
              tr(t.left)
                .replace('{k}', tr(leaveCopy[k]))
                .replace('{n}', String(Math.max(0, data.balance[k].quota - data.balance[k].used)))
                .replace('{q}', String(data.balance[k].quota)),
            )
            .join(' · ')}
        </p>
      )}

      {data.leave.length > 0 && <MyRequests list={data.leave} fmt={fmt} />}
    </section>
  )
}

function DayRow({
  day,
  today,
  label,
  leave,
  onAsk,
}: {
  day: MyShiftDay
  today: string
  label: string
  leave: LeaveRequest | undefined
  onAsk?: () => void
}) {
  const { tr } = useLanguage()
  const past = day.date < today
  const content = (
    <>
      <span className="flex h-8 w-1 shrink-0 flex-col gap-0.5" aria-hidden="true">
        {day.shifts.length ? (
          day.shifts.map((s) => <span key={s.start} className="w-1 flex-1 rounded-full" style={{ backgroundColor: s.hex }} />)
        ) : (
          <span className="w-1 flex-1" />
        )}
      </span>
      <span className={cn('w-24 shrink-0 text-sm', day.date === today && 'font-bold text-primary')}>{label}</span>
      <span className="min-w-0 flex-1 text-sm">
        {day.shifts.length ? (
          day.shifts.map((s) => (
            <span key={s.start} className="block">
              <span className="font-semibold">{s.name}</span>
              <span className="ml-2 tabular-nums text-muted-foreground">
                {s.start}–{s.end}
              </span>
            </span>
          ))
        ) : day.dayOff ? (
          <span className="text-muted-foreground">{tr(t.off)}</span>
        ) : (
          <span className="italic text-muted-foreground/70">{tr(t.notPlanned)}</span>
        )}
      </span>
      {leave && (
        <span className="shrink-0 text-right text-[11px] leading-tight">
          <span className="block font-semibold">{tr(leaveCopy[leave.kind])}</span>
          <StatusBadge status={leave.status} />
        </span>
      )}
    </>
  )
  const cls = cn('flex w-full items-center gap-3 px-3 py-2 text-left', past && 'opacity-50')
  return (
    <li>
      {onAsk && !leave ? (
        <button type="button" onClick={onAsk} className={cn(cls, 'hover:bg-secondary/50')}>
          {content}
        </button>
      ) : (
        <div className={cls}>{content}</div>
      )}
    </li>
  )
}

function StatusBadge({ status, className }: { status: LeaveRequest['status']; className?: string }) {
  const { tr } = useLanguage()
  return <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_CLS[status], className)}>{tr(leaveCopy[status])}</span>
}

function MyRequests({ list, fmt }: { list: LeaveRequest[]; fmt: (d: string, o?: Intl.DateTimeFormatOptions) => string }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const range = (r: LeaveRequest) => (r.start === r.end ? fmt(r.start) : `${fmt(r.start)} – ${fmt(r.end)}`)
  return (
    <div className="mt-5">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{tr(t.myRequests)}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-sm">
        {list.map((r) => (
          <li key={r.id} className="px-4 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="font-semibold">{tr(leaveCopy[r.kind])}</span>
                <span className="ml-2 text-muted-foreground">
                  {range(r)} · {tr(t.days).replace('{n}', String(r.days))}
                </span>
              </span>
              <StatusBadge status={r.status} className="shrink-0" />
            </div>
            {r.reason && <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>}
            {r.decisionNote && <p className="mt-0.5 text-xs font-semibold">{tr(t.noteFrom).replace('{n}', r.decisionNote)}</p>}
            {r.status === 'pending' && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setBusy(r.id)
                    await cancelLeave(r.id)
                    setBusy(null)
                    router.refresh()
                  })
                }
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-destructive"
              >
                {busy === r.id && <Spinner className="h-3 w-3" />}
                {tr(t.cancel)}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Photos are shrunk on the phone before upload (a camera photo can be 5 MB+).
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
    return blob ? new File([blob], 'note.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

function LeaveForm({ start: initialStart, data, onClose, onSent }: { start: string; data: Data; onClose: () => void; onSent: () => void }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const kinds = LEAVE_KINDS.filter((k) => data.rules.kinds[k])
  const [kind, setKind] = useState<LeaveKind>(kinds[0])
  const [from, setFrom] = useState(initialStart)
  const [to, setTo] = useState(initialStart)
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const min = kind === 'sick' ? isoAdd(data.today, -SICK_BACKDATE_DAYS) : isoAdd(data.today, data.rules.noticeDays)
  const end = to < from ? from : to
  const n = from ? daysInclusive(from, end) : 0
  const input = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-base sm:text-sm'

  const submit = () =>
    start(async () => {
      setErr(null)
      const fd = new FormData()
      fd.set('kind', kind)
      fd.set('start', from)
      fd.set('end', end)
      fd.set('reason', reason)
      if (file) fd.set('doc', await shrinkImage(file))
      const r = await requestLeave(fd)
      if (!r.ok) {
        setErr(tr(leaveErrors[r.error] ?? leaveErrors.failed).replace('{n}', String(r.n ?? '')))
        return
      }
      onSent()
      router.refresh()
    })

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <CalendarOff className="h-4 w-4 text-primary" aria-hidden="true" />
          {tr(t.formTitle)}
        </h3>
        <button type="button" onClick={onClose} aria-label="close" className="text-muted-foreground">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-3 text-xs font-semibold text-muted-foreground">{tr(t.kind)}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-semibold',
              kind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
            )}
          >
            {tr(leaveCopy[k])}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-muted-foreground">
          {tr(t.from)}
          <input type="date" className={cn(input, 'mt-1')} min={min} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-muted-foreground">
          {tr(t.to)}
          <input type="date" className={cn(input, 'mt-1')} min={from || min} value={end} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {tr(t.fullDays)} · {tr(t.notice).replace('{n}', String(data.rules.noticeDays)).replace('{b}', String(SICK_BACKDATE_DAYS))}
      </p>

      <label className="mt-3 block text-xs font-semibold text-muted-foreground">
        {tr(t.reason)}
        <textarea
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-base sm:text-sm"
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>

      {kind === 'sick' && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
          <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">{file ? file.name : tr(t.doc)}</span>
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}

      {err && <p className="mt-2 text-sm font-semibold text-destructive">{err}</p>}
      <button
        type="button"
        disabled={pending || !from || n < 1}
        onClick={submit}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {pending && <Spinner className="h-4 w-4" />}
        {tr(t.send).replace('{n}', String(n))}
      </button>
    </div>
  )
}
