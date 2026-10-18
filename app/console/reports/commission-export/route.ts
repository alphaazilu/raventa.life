import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/console/guard'
import { getAppSettings } from '@/lib/console/settings'
import { resolveTimePeriod } from '@/lib/console/time-period'
import { loadCommissionReport } from '@/lib/console/commission'
import { receiptLabel } from '@/lib/console/catalog'

// Back Office › Reports › Commission › Export (v0.34): one row per line that
// earned commission, then a total per person. UTF-8 with BOM for Excel.

const SOURCE: Record<string, string> = { cashier: 'ขายเอง', referrer: 'แนะนำ', line: 'เลือกที่รายการ', signup: 'แนะนำสมาชิก (บิลแรก)' }

function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export async function GET(req: Request) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return new NextResponse('Forbidden', { status: 403 })
  const url = new URL(req.url)
  const settings = await getAppSettings()
  const period = resolveTimePeriod({ from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined, pay: 'monthly' }, settings.pay)
  const people = await loadCommissionReport(period.from, period.to)
  if (!people) return new NextResponse('Not set up', { status: 404 })
  const rows: (string | number | null)[][] = [['ชื่อ', 'วันที่', 'ใบเสร็จ', 'รายการ', 'จำนวน', 'ได้จาก', 'ยอดหลังส่วนลด', 'แบบ', 'อัตรา', 'ค่าคอม']]
  for (const p of people) {
    for (const d of p.detail) {
      rows.push([p.name, d.saleDate, d.receiptNo ? receiptLabel(d.receiptNo) : '', d.item, d.qty, SOURCE[d.source] ?? d.source, d.base, d.mode === 'pct' ? '%' : 'บาท/ชิ้น', d.rate, d.amount])
    }
  }
  rows.push([])
  rows.push(['สรุปรายคน', '', '', '', '', '', 'ยอดหลังส่วนลด', '', 'บิล', 'ค่าคอม'])
  for (const p of people) rows.push([p.name, '', '', '', p.lines, '', p.base, '', p.bills, p.amount])
  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="commission-${period.from}-to-${period.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
