import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/console/guard'
import { loadSalesReport } from '@/lib/console/reports'
import { resolvePeriod } from '@/lib/console/report-period'
import type { SalesReport } from '@/lib/console/report-calc'

// Back Office › Reports › Export: the same period as CSV for the
// accountant (UTF-8 with BOM so Excel shows Thai). ?type=bills (one row per
// bill), lines (one row per item, discount spread), daily, or summary.

const METHOD: Record<string, string> = { cash: 'เงินสด', transfer: 'โอน', card: 'บัตร' }
const KIND: Record<string, string> = { day_pass: 'Day Pass', package: 'แพ็กเกจ', addon: 'ส่วนเสริม', merch: 'สินค้า', souvenir: 'ของที่ระลึก' }

function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

const time = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function build(type: string, r: SalesReport): (string | number | null)[][] {
  const vat = r.vat
  const exVat = (n: number) => Math.round((n * 100) / 107)
  if (type === 'bills') {
    return [
      ['เลขที่ใบเสร็จ', 'วันที่', 'เวลา', 'เลขสมาชิก', 'รายการ', 'ยอดก่อนส่วนลด', 'ส่วนลด', 'ยอดสุทธิ', ...(vat ? ['ก่อน VAT', 'VAT'] : []), 'วิธีชำระ', 'โปรโมชัน', 'พนักงาน', 'สถานะ', 'เหตุผลยกเลิก'],
      ...r.bills.map((b) => [
        b.receiptNo,
        b.date,
        time(b.at),
        b.memberNo,
        b.items,
        b.gross,
        b.discount,
        b.net,
        ...(vat ? [exVat(b.net), b.net - exVat(b.net)] : []),
        b.net === 0 ? '0 บาท' : (b.method && METHOD[b.method]) || '',
        b.promo,
        b.staff,
        b.voided ? 'ยกเลิก' : 'ปกติ',
        b.voidReason,
      ]),
    ]
  }
  if (type === 'daily') {
    return [
      ['วันที่', 'จำนวนบิล', 'ยอดสุทธิ', 'เงินสด', 'โอน', 'บัตร', 'ส่วนลด', 'บิลยกเลิก'],
      ...r.daily.map((d) => [d.date, d.bills, d.net, d.cash, d.transfer, d.card, d.discount, d.voided]),
    ]
  }
  if (type === 'lines') {
    return [
      ['ประเภท', 'สินค้า', 'จำนวน', 'ยอดก่อนส่วนลด', 'ส่วนลด (เฉลี่ย)', 'ยอดสุทธิ', ...(vat ? ['ก่อน VAT', 'VAT'] : [])],
      ...r.categories.flatMap((c) =>
        c.products.map((p) => [KIND[c.kind] ?? c.kind, p.name, p.qty, p.gross, p.discount, p.net, ...(vat ? [exVat(p.net), p.net - exVat(p.net)] : [])]),
      ),
    ]
  }
  // summary
  const s = r.summary
  const k = r.packages
  return [
    ['รายงานการขาย RAVENTA', `${r.from} ถึง ${r.to}`],
    [],
    ['ยอดขายก่อนส่วนลด', s.gross],
    ['ส่วนลด', s.discount],
    ['ยอดขายสุทธิ', s.net],
    ...(s.vat ? [['ยอดก่อน VAT', s.vat.exVat], ['ภาษีขาย (VAT 7%)', s.vat.vat]] : []),
    ['จำนวนบิล', s.bills],
    ['บิลยกเลิก (ไม่รวมในยอด)', s.voidedBills, s.voidedAmount],
    [],
    ['วิธีชำระ', 'จำนวนบิล', 'ยอด'],
    ...r.payments.map((p) => [p.method === 'zero' ? '0 บาท (แพ็กเกจ/ฟรี)' : METHOD[p.method], p.bills, p.amount]),
    [],
    ['ประเภท', 'จำนวน', 'ยอดก่อนส่วนลด', 'ส่วนลด', 'ยอดสุทธิ'],
    ...r.categories.map((c) => [KIND[c.kind] ?? c.kind, c.qty, c.gross, c.discount, c.net]),
    [],
    ['แพ็กเกจ (รายได้รับล่วงหน้า)'],
    ['ยกมาต้นงวด', k.opening],
    ['ขายในงวด', k.soldAmount, `${k.soldCount} รายการ`],
    ['รับรู้จากการใช้สิทธิ์', k.usedAmount, `${k.usedVisits} ครั้ง`],
    ['รับรู้ตามวัน (รายเดือน)', k.timeAmount],
    ['หมดอายุไม่ได้ใช้', k.forfeited],
    ['คงเหลือปลายงวด', k.closing],
    [],
    ['การเข้าใช้', 'จ่ายเงิน', 'แพ็กเกจ', 'ของขวัญ', 'สิทธิ์ฟรี', 'รวม', 'กลับเข้าวันเดียวกัน', 'ไม่มีบิล'],
    ['', r.visits.paid, r.visits.package, r.visits.gift, r.visits.reward, r.visits.total, r.visits.reEnter, r.visits.noBill],
    [],
    ['ใบเสร็จเลขที่', r.audit.firstReceipt, r.audit.lastReceipt, `${r.audit.count} ใบ`, r.audit.gapCount ? `เลขที่ข้าม ${r.audit.gapCount}` : ''],
  ]
}

export async function GET(request: Request) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return new NextResponse('Forbidden', { status: 403 })
  const q = Object.fromEntries(new URL(request.url).searchParams)
  const type = ['bills', 'lines', 'daily', 'summary'].includes(q.type) ? q.type : 'summary'
  const period = resolvePeriod(q)
  const report = await loadSalesReport(period.from, period.to)
  const name = `raventa-${type}-${period.from}_${period.to}.csv`
  return new NextResponse(csv(build(type, report)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}
