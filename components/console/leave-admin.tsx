'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Paperclip, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { decideLeave, leaveDocLink } from '@/app/console/time/leave-actions'
import { leaveCopy, leaveErrors, type LeaveRequest } from '@/lib/leave'
import type { LeaveDayCheck } from '@/lib/leave-server'
import { cn } from '@/lib/utils'
import { TIME_PATH } from '@/lib/auth/roles'

type L = { th: string; en: string }
const t = {
  seeRoster: { th: 'ดูในตารางกะ', en: 'See the roster' },
  waiting: { th: 'รออนุมัติ', en: 'Waiting' },
  none: { th: 'ไม่มีคำขอที่รออยู่', en: 'Nothing waiting' },
  decided: { th: 'ตัดสินแล้ว (60 วันล่าสุด)', en: 'Decided (last 60 days)' },
  days: { th: '{n} วัน', en: '{n} days' },
  asked: { th: 'ขอเมื่อ {d}', en: 'Asked {d}' },
  approve: { th: 'อนุมัติ', en: 'Approve' },
  reject: { th: 'ไม่อนุมัติ', en: 'Decline' },
  note: { th: 'เหตุผล (พนักงานจะเห็น)', en: 'Reason (the staff member sees it)' },
  confirmReject: { th: 'ยืนยันไม่อนุมัติ', en: 'Decline' },
  doc: { th: 'ดูไฟล์แนบ', en: 'Attachment' },
  myShift: { th: 'กะเดิม', en: 'Was on' },
  noShift: { th: 'ไม่มีกะ', en: 'No shift' },
  working: { th: 'คนอื่นเข้างาน {n} คน', en: '{n} others working' },
  othersOff: { th: 'หยุดอยู่แล้ว: {n}', en: 'Already off: {n}' },
  approveNote: { th: 'อนุมัติแล้ววันในตารางกะจะเปลี่ยนเป็น “หยุด” ให้เอง', en: 'Approving marks these days “off” on the roster' },
  by: { th: 'โดย {n}', en: 'by {n}' },
} satisfies Record<string, L>

const STATUS_CLS: Record<LeaveRequest['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  approved: 'bg-accent/15 text-accent',
  rejected: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-secondary text-muted-foreground',
}

export function LeaveAdmin({
  pending,
  decided,
  checks,
}: {
  pending: LeaveRequest[]
  decided: LeaveRequest[]
  checks: Record<string, LeaveDayCheck[]>
}) {
  const { tr, lang } = useLanguage()
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${d}T00:00:00Z`),
    )
  const range = (r: LeaveRequest) => (r.start === r.end ? fmt(r.start) : `${fmt(r.start)} – ${fmt(r.end)}`)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">
          {tr(t.waiting)} ({pending.length})
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{tr(t.approveNote)}</p>
        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{tr(t.none)}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((r) => (
              <PendingCard key={r.id} r={r} days={checks[r.id] ?? []} range={range(r)} fmt={fmt} />
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">{tr(t.decided)}</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{r.staffName}</span>
                  <span className="ml-2 text-muted-foreground">
                    {tr(leaveCopy[r.kind])} · {range(r)} · {tr(t.days).replace('{n}', String(r.days))}
                  </span>
                  {r.decisionNote && <span className="block text-xs text-muted-foreground">{r.decisionNote}</span>}
                </span>
                <span className="text-xs">
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS_CLS[r.status])}>{tr(leaveCopy[r.status])}</span>
                  {r.decidedBy && <span className="ml-1 text-muted-foreground">{tr(t.by).replace('{n}', r.decidedBy)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function PendingCard({ r, days, range, fmt }: { r: LeaveRequest; days: LeaveDayCheck[]; range: string; fmt: (d: string) => string }) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const asked = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(r.createdAt))

  const decide = (approve: boolean) =>
    start(async () => {
      setErr(null)
      const res = await decideLeave(r.id, approve, approve ? undefined : note)
      if (!res.ok) setErr(tr(leaveErrors[res.error] ?? leaveErrors.failed))
      else router.refresh()
    })

  const openDoc = () =>
    start(async () => {
      const res = await leaveDocLink(r.id)
      if (res.ok) window.open(res.url, '_blank', 'noopener')
    })

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p>
          <span className="font-semibold">{r.staffName}</span>
          <span className="ml-2 text-sm font-semibold text-primary">{tr(leaveCopy[r.kind])}</span>
        </p>
        <p className="text-xs text-muted-foreground">{tr(t.asked).replace('{d}', asked)}</p>
      </div>
      <p className="mt-0.5 text-sm">
        {range} · {tr(t.days).replace('{n}', String(r.days))}
        <a href={`${TIME_PATH}?tab=roster&month=${r.start.slice(0, 7)}`} className="ml-2 text-xs font-semibold text-primary hover:underline">
          {tr(t.seeRoster)}
        </a>
      </p>
      {r.reason && <p className="mt-1 text-sm text-muted-foreground">“{r.reason}”</p>}
      {r.hasDoc && (
        <button type="button" onClick={openDoc} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          {tr(t.doc)}
        </button>
      )}

      {days.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-lg bg-secondary/40 text-xs">
          {days.map((d) => (
            <li key={d.date} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5">
              <span className="w-24 font-semibold">{fmt(d.date)}</span>
              <span className="text-muted-foreground">
                {tr(t.myShift)}: {d.myShift ?? tr(t.noShift)}
              </span>
              <span className={cn(d.working === 0 && d.myShift ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                {tr(t.working).replace('{n}', String(d.working))}
              </span>
              {d.othersOff.length > 0 && <span className="text-muted-foreground">{tr(t.othersOff).replace('{n}', d.othersOff.join(', '))}</span>}
            </li>
          ))}
        </ul>
      )}

      {err && <p className="mt-2 text-sm font-semibold text-destructive">{err}</p>}
      {rejecting ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder={tr(t.note)}
            className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-base sm:text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => decide(false)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-destructive px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && <Spinner className="h-4 w-4" />}
            {tr(t.confirmReject)}
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="h-10 rounded-full border border-border px-3 text-sm">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => decide(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {tr(t.approve)}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setRejecting(true)}
            className="h-10 rounded-full border border-border px-5 text-sm font-semibold hover:border-destructive/50 hover:text-destructive"
          >
            {tr(t.reject)}
          </button>
        </div>
      )}
    </li>
  )
}
