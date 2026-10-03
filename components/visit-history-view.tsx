'use client'

import { useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { formatMemberDate } from '@/lib/format-date'
import { bangkokTime } from '@/lib/check-in/day'
import { receiptLabel } from '@/lib/console/catalog'
import type { HistoryBill, HistoryVisit, VisitHistory } from '@/lib/visit-history'
import { cn } from '@/lib/utils'

const t = {
  heading: { th: 'ประวัติการใช้บริการ', en: 'Visit history' },
  visits: { th: 'มาทั้งหมด', en: 'Visits' },
  times: { th: 'ครั้ง', en: '' },
  paidFree: { th: 'จ่าย {p} · ฟรี {f}', en: '{p} paid · {f} free' },
  first: { th: 'ครั้งแรก', en: 'First' },
  last: { th: 'ล่าสุด', en: 'Latest' },
  perMonth: { th: 'เฉลี่ยต่อเดือน', en: 'Per month' },
  spend: { th: 'ใช้จ่ายรวม', en: 'Total spend' },
  stamps: { th: 'แสตมป์', en: 'Stamps' },
  stampsReward: { th: 'มีสิทธิ์ฟรี {n}', en: '{n} free pass ready' },
  none: { th: 'ยังไม่เคยเข้าใช้บริการ', en: 'No visits yet' },
  tabVisits: { th: 'การเข้าใช้', en: 'Visits' },
  tabBills: { th: 'บิล', en: 'Bills' },
  paid: { th: 'Day Pass', en: 'Day Pass' },
  free: { th: 'สิทธิ์ฟรี', en: 'Free pass' },
  pkg: { th: 'แพ็กเกจ', en: 'Package' },
  stillIn: { th: 'ยังอยู่ในร้าน', en: 'Still in' },
  cancelled: { th: 'ยกเลิก', en: 'Cancelled' },
  voided: { th: 'ยกเลิกบิล', en: 'Voided' },
  by: { th: 'โดย', en: 'by' },
  band: { th: 'สายรัด', en: 'Band' },
  discount: { th: 'ส่วนลด', en: 'Discount' },
  more: { th: 'ดูเพิ่ม', en: 'Show more' },
  noBills: { th: 'ยังไม่มีบิล', en: 'No bills yet' },
  hr: { th: 'ชม.', en: 'h' },
  min: { th: 'น.', en: 'm' },
  baht: { th: '฿', en: '฿' },
  cash: { th: 'เงินสด', en: 'Cash' },
  transfer: { th: 'โอน', en: 'Transfer' },
  card: { th: 'บัตร', en: 'Card' },
}

type Tr = (v: { th: string; en: string }) => string
const PAGE = 20

function payLabel(method: string | null, tr: Tr): string {
  return method === 'cash' || method === 'transfer' || method === 'card' ? tr(t[method]) : ''
}

function duration(inAt: string, outAt: string, tr: Tr): string {
  const mins = Math.max(0, Math.round((Date.parse(outAt) - Date.parse(inAt)) / 60_000))
  const h = Math.floor(mins / 60)
  return h ? `${h} ${tr(t.hr)} ${mins % 60} ${tr(t.min)}` : `${mins} ${tr(t.min)}`
}

// Admin: everything (summary with spend, visits with staff, bills).
// Member (/account/history): their own visits, no money or staff names.
export function VisitHistoryView({
  history,
  stamps,
  admin,
}: {
  history: VisitHistory
  stamps?: { stamps: number; rewardsAvailable: number } | null
  admin: boolean
}) {
  const { tr, lang } = useLanguage()
  const [tab, setTab] = useState<'visits' | 'bills'>('visits')
  const s = history.summary
  const date = (iso: string | null) => formatMemberDate(iso, lang, true) ?? '—'

  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: tr(t.visits), value: `${s.visits.toLocaleString()} ${tr(t.times)}`.trim(), sub: tr(t.paidFree).replace('{p}', String(s.paid)).replace('{f}', String(s.reward)) },
    { label: tr(t.last), value: date(s.last), sub: `${tr(t.first)} ${date(s.first)}` },
    { label: tr(t.perMonth), value: `${s.perMonth} ${tr(t.times)}`.trim() },
  ]
  if (admin && s.spend !== null) tiles.push({ label: tr(t.spend), value: `${tr(t.baht)}${s.spend.toLocaleString()}` })
  if (stamps) {
    tiles.push({
      label: tr(t.stamps),
      value: String(stamps.stamps),
      sub: stamps.rewardsAvailable > 0 ? tr(t.stampsReward).replace('{n}', String(stamps.rewardsAvailable)) : undefined,
    })
  }

  return (
    <section>
      <h2 className="font-display text-xl font-extrabold text-foreground">{tr(t.heading)}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground">{x.label}</p>
            <p className="mt-0.5 font-display text-lg font-extrabold text-card-foreground">{x.value}</p>
            {x.sub && <p className="text-xs text-muted-foreground">{x.sub}</p>}
          </div>
        ))}
      </div>

      {admin && (
        <div className="mt-5 inline-flex rounded-full bg-secondary p-1 text-sm font-semibold">
          {(['visits', 'bills'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn('rounded-full px-4 py-1.5', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              {tr(k === 'visits' ? t.tabVisits : t.tabBills)} ({(k === 'visits' ? history.visits : history.bills).length})
            </button>
          ))}
        </div>
      )}

      {tab === 'visits' ? (
        <Paged items={history.visits} empty={tr(t.none)} render={(v) => <VisitRow key={v.id} v={v} admin={admin} tr={tr} date={date} />} />
      ) : (
        <Paged items={history.bills} empty={tr(t.noBills)} render={(b) => <BillRow key={b.id} b={b} tr={tr} date={date} />} />
      )}
    </section>
  )
}

function Paged<T>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => React.ReactNode }) {
  const { tr } = useLanguage()
  const [shown, setShown] = useState(PAGE)
  if (!items.length) return <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{items.slice(0, shown).map(render)}</ul>
      {shown < items.length && (
        <button type="button" onClick={() => setShown(shown + PAGE)} className="mt-3 w-full text-center text-sm font-semibold text-primary">
          {tr(t.more)} ({items.length - shown})
        </button>
      )}
    </>
  )
}

function VisitRow({ v, admin, tr, date }: { v: HistoryVisit; admin: boolean; tr: Tr; date: (iso: string | null) => string }) {
  const time = `${bangkokTime(v.inAt)}–${v.outAt ? bangkokTime(v.outAt) : ''}`
  return (
    <li className={cn('flex items-start justify-between gap-3 px-4 py-3 text-sm', v.cancelled && 'opacity-55')}>
      <div className="min-w-0">
        <p className="font-semibold text-card-foreground">
          {date(v.date)}
          <span className="ml-2 font-normal text-muted-foreground">{time}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {v.outAt ? duration(v.inAt, v.outAt, tr) : v.cancelled ? '' : tr(t.stillIn)}
          {v.wristband && ` · ${tr(t.band)} ${v.wristband}`}
          {admin && v.staff && ` · ${tr(t.by)} ${v.staff}`}
        </p>
        {v.cancelled && (
          <p className="mt-0.5 text-xs font-semibold text-destructive">
            {tr(t.cancelled)}
            {admin && v.cancelReason && ` — ${v.cancelReason}`}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span
          className={cn(
            'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold',
            v.entryType === 'paid' ? 'bg-secondary text-secondary-foreground' : 'bg-accent/15 text-accent',
          )}
        >
          {tr(v.entryType === 'reward' ? t.free : v.entryType === 'package' ? t.pkg : t.paid)}
        </span>
        {admin && v.entryType === 'paid' && (
          <p className="mt-1 text-xs text-muted-foreground">
            ฿{v.price.toLocaleString()} {payLabel(v.paymentMethod, tr)}
          </p>
        )}
      </div>
    </li>
  )
}

function BillRow({ b, tr, date }: { b: HistoryBill; tr: Tr; date: (iso: string | null) => string }) {
  return (
    <li className={cn('px-4 py-3 text-sm', b.voided && 'opacity-55')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-card-foreground">
          <span className="font-mono text-primary">{receiptLabel(b.receiptNo)}</span>
          <span className="ml-2 font-normal text-muted-foreground">
            {date(b.at)} {bangkokTime(b.at)}
          </span>
        </p>
        <p className={cn('shrink-0 font-display font-extrabold', b.voided && 'line-through')}>฿{b.total.toLocaleString()}</p>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {b.lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ')}
        {b.discount > 0 && ` · ${tr(t.discount)} ฿${b.discount.toLocaleString()}${b.promo ? ` (${b.promo})` : ''}`}
        {b.paymentMethod && ` · ${payLabel(b.paymentMethod, tr)}`}
      </p>
      {b.voided && (
        <p className="mt-0.5 text-xs font-semibold text-destructive">
          {tr(t.voided)}
          {b.voidReason && ` — ${b.voidReason}`}
        </p>
      )}
    </li>
  )
}
