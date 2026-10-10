'use client'

import { useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { catalogCopy } from '@/lib/console/copy'
import { formatMemberDate } from '@/lib/format-date'
import { bangkokTime } from '@/lib/check-in/day'
import { receiptLabel } from '@/lib/console/catalog'
import { REPORTS_PATH } from '@/lib/auth/roles'
import type { Period, Preset } from '@/lib/console/report-period'
import type { BillRow, SalesReport } from '@/lib/console/report-calc'
import { cn } from '@/lib/utils'
import { keepPeriod, ReportTabs } from '@/components/console/time-report-view'

type L = { th: string; en: string }
const t = {
  title: { th: 'รายงานการขาย', en: 'Sales report' },
  today: { th: 'วันนี้', en: 'Today' },
  yesterday: { th: 'เมื่อวาน', en: 'Yesterday' },
  '7d': { th: '7 วัน', en: '7 days' },
  month: { th: 'เดือนนี้', en: 'This month' },
  last_month: { th: 'เดือนก่อน', en: 'Last month' },
  fromTo: { th: 'ถึง', en: 'to' },
  show: { th: 'ดู', en: 'Show' },
  failed: { th: 'โหลดรายงานไม่สำเร็จ — ตรวจว่ารัน schema.sql แล้ว แล้วลองใหม่', en: 'Couldn’t load the report — check schema.sql has been run, then try again' },
  // summary
  gross: { th: 'ยอดขายก่อนส่วนลด', en: 'Gross sales' },
  discount: { th: 'ส่วนลด', en: 'Discounts' },
  net: { th: 'ยอดขายสุทธิ', en: 'Net sales' },
  bills: { th: 'บิล', en: 'Bills' },
  avg: { th: 'เฉลี่ย/บิล', en: 'Avg / bill' },
  voidedNote: { th: 'ยกเลิก {n} บิล ฿{a} (ไม่รวมในยอด)', en: '{n} voided bills ฿{a} (not counted)' },
  exVat: { th: 'ก่อน VAT', en: 'Before VAT' },
  vat: { th: 'ภาษีขาย 7%', en: 'Output VAT 7%' },
  // payments
  payHeading: { th: 'แยกตามวิธีรับเงิน', en: 'By payment' },
  payHint: { th: 'ใช้กระทบกับเงินจริง', en: 'Check against the money' },
  cash: { th: 'เงินสด', en: 'Cash' },
  transfer: { th: 'โอน', en: 'Transfer' },
  card: { th: 'บัตร', en: 'Card' },
  zero: { th: '0 บาท', en: '฿0' },
  checkCash: { th: 'นับเงินในลิ้นชัก', en: 'Count the cash drawer' },
  checkTransfer: { th: 'Statement ธนาคาร — ดูรายบิลด้านล่าง', en: 'Bank statement — bills listed below' },
  checkCard: { th: 'สลิปสรุปยอดเครื่องรูดบัตร (EDC)', en: 'Card machine settlement slip' },
  checkZero: { th: 'เช็คอินด้วยแพ็กเกจ/ของขวัญ/สิทธิ์ฟรี — ไม่มีเงินเข้า', en: 'Package / gift / free check-ins — no money in' },
  colMethod: { th: 'วิธี', en: 'Method' },
  colBills: { th: 'บิล', en: 'Bills' },
  colAmount: { th: 'ยอด', en: 'Amount' },
  colCheck: { th: 'กระทบกับ', en: 'Check against' },
  total: { th: 'รวม', en: 'Total' },
  // categories
  catHeading: { th: 'แยกตามประเภท', en: 'By kind of sale' },
  catHint: { th: 'ส่วนลดท้ายบิลเฉลี่ยเข้าแต่ละรายการตามสัดส่วนราคา ยอดรวมทุกประเภทจึงเท่ายอดสุทธิ', en: 'Bill discounts are spread over items by price, so the kinds add up to net sales' },
  colKind: { th: 'ประเภท / สินค้า', en: 'Kind / item' },
  colQty: { th: 'จำนวน', en: 'Qty' },
  colGross: { th: 'ก่อนส่วนลด', en: 'Gross' },
  colDisc: { th: 'ส่วนลด', en: 'Discount' },
  colNet: { th: 'สุทธิ', en: 'Net' },
  promoHeading: { th: 'โปรโมชัน', en: 'Promotions' },
  promoLine: { th: '{n} บิล · ลด ฿{d}', en: '{n} bills · ฿{d} off' },
  // packages
  pkgHeading: { th: 'แพ็กเกจ — รายได้รับล่วงหน้า', en: 'Packages — paid in advance' },
  pkgHint: { th: 'เงินเข้าตอนขาย แต่บริการให้ภายหลัง · มูลค่าต่อครั้ง = ราคาที่จ่ายจริง ÷ จำนวนครั้ง · รายเดือนคิดตามวัน · ของขวัญที่แบ่งให้เพื่อนนับเป็นการใช้ของแพ็กเกจต้นทาง', en: 'Paid at sale, used later · value per visit = price paid ÷ visits · passes by the day · gifted visits count against the package they came from' },
  pkgOpening: { th: 'ยกมาต้นงวด', en: 'Opening balance' },
  pkgSold: { th: '+ ขายในงวด ({n} รายการ)', en: '+ Sold ({n})' },
  pkgUsed: { th: '− ใช้สิทธิ์ ({n} ครั้ง)', en: '− Visits used ({n})' },
  pkgTime: { th: '− รายเดือน (ตามวัน)', en: '− Passes (by day)' },
  pkgForfeit: { th: '− หมดอายุไม่ได้ใช้', en: '− Expired unused' },
  pkgClosing: { th: '= คงเหลือปลายงวด', en: '= Closing balance' },
  pkgRecognised: { th: 'รายได้ที่รับรู้งวดนี้ (ถ้าลงแพ็กเกจเป็นรายได้รับล่วงหน้า)', en: 'Revenue earned this period (if packages are deferred)' },
  pkgRecognisedHow: { th: 'ยอดขายที่ไม่ใช่แพ็กเกจ ฿{a} + รับรู้จากแพ็กเกจ ฿{b}', en: 'Non-package sales ฿{a} + earned from packages ฿{b}' },
  // visits
  visitHeading: { th: 'การเข้าใช้', en: 'Visits' },
  vPaid: { th: 'จ่ายเงิน', en: 'Paid' },
  vPackage: { th: 'แพ็กเกจ', en: 'Package' },
  vGift: { th: 'ของขวัญ', en: 'Gift' },
  vReward: { th: 'สิทธิ์ฟรี (แสตมป์)', en: 'Free (stamps)' },
  vTotal: { th: 'รวมเข้าใช้', en: 'Total' },
  vReEnter: { th: 'กลับเข้าวันเดียวกัน (ไม่นับซ้ำ)', en: 'Back in same day (not counted again)' },
  vNoBill: { th: 'เข้าโดยไม่มีบิล {n} ครั้ง — ตรวจสอบ', en: '{n} visits without a bill — check' },
  // audit
  auditHeading: { th: 'ตรวจสอบ', en: 'Audit' },
  receipts: { th: 'ใบเสร็จเลขที่ {a} – {b} ({n} ใบ)', en: 'Receipts {a} – {b} ({n})' },
  noReceipts: { th: 'ไม่มีใบเสร็จในช่วงนี้', en: 'No receipts in this period' },
  gaps: { th: 'เลขที่ข้าม {n} เลข: {list}', en: '{n} numbers skipped: {list}' },
  gapsWhy: { th: 'ระบบจะข้ามเลขเมื่อการชำระเงินไม่สำเร็จกลางทาง (บิลนั้นไม่ได้เกิดขึ้น) — ถ้ามีเลขข้ามมากผิดปกติให้แจ้งผู้ดูแล', en: 'A number is skipped when a payment fails midway (no bill was made) — report unusually many' },
  noGaps: { th: 'เลขที่ต่อเนื่อง ไม่มีเลขข้าม', en: 'No skipped numbers' },
  voidHeading: { th: 'บิลที่ยกเลิก', en: 'Voided bills' },
  staffHeading: { th: 'แยกตามพนักงาน', en: 'By staff' },
  // daily
  dailyHeading: { th: 'รายวัน', en: 'Day by day' },
  colDate: { th: 'วันที่', en: 'Date' },
  colVoided: { th: 'ยกเลิก', en: 'Voided' },
  // bills
  billsHeading: { th: 'รายบิล', en: 'Bills' },
  all: { th: 'ทั้งหมด', en: 'All' },
  voidedTab: { th: 'ยกเลิก', en: 'Voided' },
  colReceipt: { th: 'ใบเสร็จ', en: 'Receipt' },
  colTime: { th: 'เวลา', en: 'Time' },
  colItems: { th: 'รายการ', en: 'Items' },
  colStaff: { th: 'พนักงาน', en: 'Staff' },
  noBills: { th: 'ไม่มีบิล', en: 'No bills' },
  more: { th: 'ดูเพิ่ม ({n})', en: 'Show more ({n})' },
  // export
  export: { th: 'Export CSV', en: 'Export CSV' },
  exSummary: { th: 'สรุป', en: 'Summary' },
  exBills: { th: 'รายบิล', en: 'Bills' },
  exLines: { th: 'รายสินค้า', en: 'Items' },
  exDaily: { th: 'รายวัน', en: 'Daily' },
} satisfies Record<string, L>

const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`
const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'
const th = 'px-3 py-2 text-left text-xs font-semibold text-muted-foreground'
const td = 'px-3 py-2'
const num = 'px-3 py-2 text-right tabular-nums'

export function ReportView({ period, report }: { period: Period; report: SalesReport | null }) {
  const { tr, lang } = useLanguage()
  const date = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d
  const presets = ['today', 'yesterday', '7d', 'month', 'last_month'] as const satisfies readonly Preset[]
  const qs = `from=${period.from}&to=${period.to}`

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <ReportTabs active="sales" keep={keepPeriod(period.preset, period.from, period.to)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold md:text-3xl">{tr(t.title)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {period.from === period.to ? date(period.from) : `${date(period.from)} – ${date(period.to)}`}
          </p>
        </div>
        <ExportMenu qs={qs} />
      </div>

      {/* Period */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <a
            key={p}
            href={`${REPORTS_PATH}?p=${p}`}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-semibold',
              period.preset === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary',
            )}
          >
            {tr(t[p])}
          </a>
        ))}
        <form action={REPORTS_PATH} className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" name="from" defaultValue={period.from} className="h-9 rounded-full border border-border bg-background px-3" />
          <span className="text-muted-foreground">{tr(t.fromTo)}</span>
          <input type="date" name="to" defaultValue={period.to} className="h-9 rounded-full border border-border bg-background px-3" />
          <button type="submit" className="h-9 rounded-full border border-border px-4 font-semibold hover:bg-secondary">
            {tr(t.show)}
          </button>
        </form>
      </div>

      {!report ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr(t.failed)}
        </p>
      ) : (
        <Body report={report} date={date} />
      )}
    </div>
  )
}

function ExportMenu({ qs }: { qs: string }) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState(false)
  const types = [
    ['summary', t.exSummary],
    ['bills', t.exBills],
    ['lines', t.exLines],
    ['daily', t.exDaily],
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
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {types.map(([type, label]) => (
            <a
              key={type}
              href={`${REPORTS_PATH}/export?type=${type}&${qs}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm hover:bg-secondary"
            >
              {tr(label)}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function Body({ report: r, date }: { report: SalesReport; date: (d: string) => string }) {
  const { tr } = useLanguage()
  const s = r.summary
  const k = r.packages
  const packageNet = r.categories.find((c) => c.kind === 'package')?.net ?? 0
  const kindLabel = (kind: string) => tr((catalogCopy as Record<string, L>)[`kind_${kind}`] ?? { th: kind, en: kind })

  return (
    <>
      {/* 1. Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={tr(t.net)} value={baht(s.net)} strong sub={s.vat ? `${tr(t.exVat)} ${baht(s.vat.exVat)} · VAT ${baht(s.vat.vat)}` : undefined} />
        <Kpi label={tr(t.gross)} value={baht(s.gross)} sub={`${tr(t.discount)} ${baht(s.discount)}`} />
        <Kpi label={tr(t.bills)} value={s.bills.toLocaleString()} sub={`${tr(t.avg)} ${baht(s.average)}`} />
        <Kpi
          label={tr(t.voidHeading)}
          value={s.voidedBills.toLocaleString()}
          sub={tr(t.voidedNote).replace('{n}', String(s.voidedBills)).replace('{a}', Math.round(s.voidedAmount).toLocaleString())}
        />
      </div>

      {/* 2. Payments */}
      <section className={card}>
        <Heading title={tr(t.payHeading)} hint={tr(t.payHint)} />
        <div className="-mx-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={th}>{tr(t.colMethod)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colBills)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colAmount)}</th>
                <th className={th}>{tr(t.colCheck)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.payments.map((p) => (
                <tr key={p.method}>
                  <td className={cn(td, 'font-semibold')}>{tr(t[p.method])}</td>
                  <td className={num}>{p.bills}</td>
                  <td className={cn(num, 'font-semibold')}>{baht(p.amount)}</td>
                  <td className={cn(td, 'text-xs text-muted-foreground')}>
                    {tr(p.method === 'cash' ? t.checkCash : p.method === 'transfer' ? t.checkTransfer : p.method === 'card' ? t.checkCard : t.checkZero)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-bold">
                <td className={td}>{tr(t.total)}</td>
                <td className={num}>{s.bills}</td>
                <td className={num}>{baht(s.net)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Kinds of sale */}
      <section className={card}>
        <Heading title={tr(t.catHeading)} hint={tr(t.catHint)} />
        <div className="-mx-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={th}>{tr(t.colKind)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colQty)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colGross)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colDisc)}</th>
                <th className={cn(th, 'text-right')}>{tr(t.colNet)}</th>
                {r.vat && <th className={cn(th, 'text-right')}>VAT</th>}
              </tr>
            </thead>
            {r.categories.map((c) => (
              <CategoryRows key={c.kind} label={kindLabel(c.kind)} row={c} vat={r.vat} />
            ))}
            <tbody>
              <tr className="border-t-2 border-border font-bold">
                <td className={td}>{tr(t.total)}</td>
                <td />
                <td className={num}>{baht(s.gross)}</td>
                <td className={num}>{baht(s.discount)}</td>
                <td className={num}>{baht(s.net)}</td>
                {r.vat && <td className={num}>{baht(s.vat?.vat ?? 0)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
        {r.promotions.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold">{tr(t.promoHeading)}</h3>
            <ul className="mt-1 text-sm">
              {r.promotions.map((p) => (
                <li key={p.name} className="flex justify-between gap-3 py-1">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">{tr(t.promoLine).replace('{n}', String(p.bills)).replace('{d}', p.discount.toLocaleString())}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 4. Packages */}
        <section className={card}>
          <Heading title={tr(t.pkgHeading)} hint={tr(t.pkgHint)} />
          <dl className="text-sm">
            <Line label={tr(t.pkgOpening)} value={k.opening} />
            <Line label={tr(t.pkgSold).replace('{n}', String(k.soldCount))} value={k.soldAmount} />
            <Line label={tr(t.pkgUsed).replace('{n}', String(k.usedVisits))} value={k.usedAmount} />
            <Line label={tr(t.pkgTime)} value={k.timeAmount} />
            <Line label={tr(t.pkgForfeit)} value={k.forfeited} />
            <Line label={tr(t.pkgClosing)} value={k.closing} strong />
          </dl>
          <div className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm">
            <p className="text-xs font-semibold text-muted-foreground">{tr(t.pkgRecognised)}</p>
            <p className="mt-0.5 font-display text-xl font-extrabold">{baht(s.net - packageNet + k.recognised)}</p>
            <p className="text-xs text-muted-foreground">
              {tr(t.pkgRecognisedHow)
                .replace('{a}', Math.round(s.net - packageNet).toLocaleString())
                .replace('{b}', Math.round(k.recognised).toLocaleString())}
            </p>
          </div>
        </section>

        {/* 5. Visits */}
        <section className={card}>
          <Heading title={tr(t.visitHeading)} />
          <dl className="text-sm">
            <Line label={tr(t.vPaid)} value={r.visits.paid} count />
            <Line label={tr(t.vPackage)} value={r.visits.package} count />
            <Line label={tr(t.vGift)} value={r.visits.gift} count />
            <Line label={tr(t.vReward)} value={r.visits.reward} count />
            <Line label={tr(t.vTotal)} value={r.visits.total} count strong />
            <Line label={tr(t.vReEnter)} value={r.visits.reEnter} count muted />
          </dl>
          {r.visits.noBill > 0 && (
            <p className="mt-3 rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
              {tr(t.vNoBill).replace('{n}', String(r.visits.noBill))}
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 6. Audit */}
        <section className={card}>
          <Heading title={tr(t.auditHeading)} />
          <p className="text-sm">
            {r.audit.count
              ? tr(t.receipts)
                  .replace('{a}', receiptLabel(r.audit.firstReceipt ?? 0))
                  .replace('{b}', receiptLabel(r.audit.lastReceipt ?? 0))
                  .replace('{n}', String(r.audit.count))
              : tr(t.noReceipts)}
          </p>
          {r.audit.count > 0 &&
            (r.audit.gapCount ? (
              <div className="mt-2 rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold">
                  {tr(t.gaps)
                    .replace('{n}', String(r.audit.gapCount))
                    .replace('{list}', r.audit.gaps.map(receiptLabel).join(', ') + (r.audit.gapCount > r.audit.gaps.length ? ' …' : ''))}
                </p>
                <p className="mt-0.5">{tr(t.gapsWhy)}</p>
              </div>
            ) : (
              <p className="mt-1 text-xs font-semibold text-accent">{tr(t.noGaps)}</p>
            ))}
          {r.bills.some((b) => b.voided) && (
            <>
              <h3 className="mt-4 text-sm font-bold">{tr(t.voidHeading)}</h3>
              <ul className="mt-1 divide-y divide-border text-sm">
                {r.bills
                  .filter((b) => b.voided)
                  .map((b) => (
                    <li key={b.id} className="py-1.5">
                      <span className="font-mono text-primary">{receiptLabel(b.receiptNo)}</span> · {baht(b.net)} · {b.voidReason || '—'}
                      {b.voidedBy && <span className="text-muted-foreground"> · {b.voidedBy}</span>}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </section>

        {/* Staff */}
        <section className={card}>
          <Heading title={tr(t.staffHeading)} />
          <ul className="divide-y divide-border text-sm">
            {r.staff.map((x) => (
              <li key={x.name} className="flex justify-between gap-3 py-1.5">
                <span>{x.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {x.bills} {tr(t.bills)} · <span className="font-semibold text-foreground">{baht(x.net)}</span>
                </span>
              </li>
            ))}
            {r.staff.length === 0 && <li className="py-1.5 text-muted-foreground">{tr(t.noBills)}</li>}
          </ul>
        </section>
      </div>

      {/* 7. Day by day */}
      {r.daily.length > 1 && (
        <section className={card}>
          <Heading title={tr(t.dailyHeading)} />
          <div className="-mx-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={th}>{tr(t.colDate)}</th>
                  <th className={cn(th, 'text-right')}>{tr(t.colBills)}</th>
                  <th className={cn(th, 'text-right')}>{tr(t.colNet)}</th>
                  <th className={cn(th, 'text-right')}>{tr(t.cash)}</th>
                  <th className={cn(th, 'text-right')}>{tr(t.transfer)}</th>
                  <th className={cn(th, 'text-right')}>{tr(t.card)}</th>
                  <th className={cn(th, 'text-right')}>{tr(t.colDisc)}</th>
                  <th className={cn(th, 'text-right')}>{tr(t.colVoided)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {r.daily.map((d) => (
                  <tr key={d.date} className={cn(d.bills === 0 && 'text-muted-foreground')}>
                    <td className={td}>
                      <a href={`${REPORTS_PATH}?from=${d.date}&to=${d.date}`} className="hover:text-primary hover:underline">
                        {date(d.date)}
                      </a>
                    </td>
                    <td className={num}>{d.bills}</td>
                    <td className={cn(num, 'font-semibold')}>{baht(d.net)}</td>
                    <td className={num}>{baht(d.cash)}</td>
                    <td className={num}>{baht(d.transfer)}</td>
                    <td className={num}>{baht(d.card)}</td>
                    <td className={num}>{baht(d.discount)}</td>
                    <td className={num}>{d.voided || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 8. Bills */}
      <Bills bills={r.bills} vat={r.vat} date={date} multiDay={r.daily.length > 1} />
    </>
  )
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Kpi({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={cn('rounded-2xl border px-4 py-3', strong ? 'border-primary/40 bg-primary/5' : 'border-border bg-card')}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 font-display font-extrabold tabular-nums', strong ? 'text-2xl text-primary' : 'text-xl')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Line({ label, value, strong, count, muted }: { label: string; value: number; strong?: boolean; count?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 py-1.5', strong && 'mt-1 border-t border-border pt-2 font-bold', muted && 'text-muted-foreground')}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{count ? value.toLocaleString() : baht(value)}</dd>
    </div>
  )
}

function CategoryRows({ label, row, vat }: { label: string; row: SalesReport['categories'][number]; vat: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <tbody className="border-b border-border">
      <tr className="cursor-pointer hover:bg-secondary/50" onClick={() => setOpen(!open)}>
        <td className={cn(td, 'font-semibold')}>
          <span className="inline-flex items-center gap-1">
            <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} aria-hidden="true" />
            {label}
          </span>
        </td>
        <td className={num}>{row.qty}</td>
        <td className={num}>{baht(row.gross)}</td>
        <td className={num}>{baht(row.discount)}</td>
        <td className={cn(num, 'font-semibold')}>{baht(row.net)}</td>
        {vat && <td className={num}>{baht(row.vat?.vat ?? 0)}</td>}
      </tr>
      {open &&
        row.products.map((p) => (
          <tr key={`${p.productId}${p.name}`} className="text-muted-foreground">
            <td className={cn(td, 'pl-9')}>{p.name}</td>
            <td className={num}>{p.qty}</td>
            <td className={num}>{baht(p.gross)}</td>
            <td className={num}>{baht(p.discount)}</td>
            <td className={num}>{baht(p.net)}</td>
            {vat && <td className={num}>{baht(p.net - Math.round((p.net * 100) / 107))}</td>}
          </tr>
        ))}
    </tbody>
  )
}

type BillFilter = 'all' | 'cash' | 'transfer' | 'card' | 'zero' | 'voided'
const PAGE = 50

function Bills({ bills, vat, date, multiDay }: { bills: BillRow[]; vat: boolean; date: (d: string) => string; multiDay: boolean }) {
  const { tr } = useLanguage()
  const [filter, setFilter] = useState<BillFilter>('all')
  const [shown, setShown] = useState(PAGE)
  const match = (b: BillRow) =>
    filter === 'all'
      ? true
      : filter === 'voided'
        ? b.voided
        : filter === 'zero'
          ? !b.voided && b.net === 0
          : !b.voided && b.net > 0 && b.method === filter
  const rows = bills.filter(match)
  const sum = rows.filter((b) => !b.voided).reduce((t2, b) => t2 + b.net, 0)
  const filters: BillFilter[] = ['all', 'cash', 'transfer', 'card', 'zero', 'voided']
  return (
    <section className={card}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">{tr(t.billsHeading)}</h2>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f)
                setShown(PAGE)
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold',
                filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary',
              )}
            >
              {tr(f === 'all' ? t.all : f === 'voided' ? t.voidedTab : t[f])}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{tr(t.noBills)}</p>
      ) : (
        <>
          <div className="-mx-3 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={th}>{tr(t.colReceipt)}</th>
                  <th className={th}>{tr(t.colTime)}</th>
                  <th className={th}>{tr(t.colItems)}</th>
                  <th className={cn(th, 'text-right')}>{tr(t.colDisc)}</th>
                  <th className={cn(th, 'text-right')}>{tr(t.colNet)}</th>
                  {vat && <th className={cn(th, 'text-right')}>VAT</th>}
                  <th className={th}>{tr(t.colMethod)}</th>
                  <th className={th}>{tr(t.colStaff)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, shown).map((b) => (
                  <tr key={b.id} className={cn(b.voided && 'text-muted-foreground line-through decoration-muted-foreground/60')}>
                    <td className={cn(td, 'font-mono text-primary')}>{receiptLabel(b.receiptNo)}</td>
                    <td className={cn(td, 'whitespace-nowrap')}>
                      {multiDay && `${date(b.date)} `}
                      {bangkokTime(b.at)}
                    </td>
                    <td className={cn(td, 'max-w-[18rem] truncate')} title={b.items}>
                      {b.memberNo && <span className="mr-1 text-xs text-muted-foreground">{b.memberNo}</span>}
                      {b.items}
                    </td>
                    <td className={num}>{b.discount ? baht(b.discount) : ''}</td>
                    <td className={cn(num, 'font-semibold')}>{baht(b.net)}</td>
                    {vat && <td className={num}>{baht(b.net - Math.round((b.net * 100) / 107))}</td>}
                    <td className={td}>{b.net === 0 ? tr(t.zero) : b.method ? tr(t[b.method]) : '—'}</td>
                    <td className={td}>{b.staff}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-bold">
                  <td className={td} colSpan={4}>
                    {tr(t.total)} ({rows.filter((b) => !b.voided).length} {tr(t.bills)})
                  </td>
                  <td className={num}>{baht(sum)}</td>
                  <td colSpan={vat ? 3 : 2} />
                </tr>
              </tfoot>
            </table>
          </div>
          {shown < rows.length && (
            <button type="button" onClick={() => setShown(shown + PAGE)} className="mt-3 w-full text-center text-sm font-semibold text-primary">
              {tr(t.more).replace('{n}', String(rows.length - shown))}
            </button>
          )}
        </>
      )}
    </section>
  )
}
