import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/console/guard'
import { listSessions } from '@/lib/console/cash'
import { dayBounds } from '@/lib/console/checklist'
import { DENOMS } from '@/lib/cash'
import { BRAND } from '@/lib/brand/config'

// Front desk › Shift close › History as CSV (§30, v0.31). UTF-8 with BOM so
// Excel shows Thai. One row per drawer, oldest first.

const ISO = /^\d{4}-\d{2}-\d{2}$/
const STATUS: Record<string, string> = { open: 'ยังเปิดอยู่', counted: 'รอยืนยัน', closed: 'ปิดแล้ว' }

function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
const stamp = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '')

export async function GET(request: Request) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return new NextResponse('Forbidden', { status: 403 })
  const q = Object.fromEntries(new URL(request.url).searchParams)
  const from = ISO.test(q.from ?? '') ? q.from : new Date().toISOString().slice(0, 10)
  const to = ISO.test(q.to ?? '') && q.to >= from ? q.to : from
  const sessions = (await listSessions(dayBounds(from).from, dayBounds(to).to, 5000)) ?? []
  const rows: (string | number | null)[][] = [
    [
      'เปิด',
      'เปิดโดย',
      'ปิด',
      'นับโดย',
      'สถานะ',
      'เงินทอนตั้งต้น',
      'ขายเงินสด',
      'ยกเลิก/คืนเงินสด',
      'ควรมี',
      'นับได้',
      'ส่วนต่าง',
      'โอน',
      'บัตร',
      'เหตุผล',
      'ตรวจโดย',
      'บันทึกแอดมิน',
      ...DENOMS.map((d) => `${d} บาท (ใบ/เหรียญ)`),
    ],
  ]
  for (const s of [...sessions].reverse()) {
    rows.push([
      stamp(s.openedAt),
      s.openedBy,
      stamp(s.closedAt),
      s.countedBy ?? '',
      STATUS[s.status] ?? s.status,
      s.float,
      s.cashIn,
      s.cashOut,
      s.expected,
      s.countedTotal,
      s.diff,
      s.transfer,
      s.card,
      s.reason ?? '',
      s.reviewedBy ?? '',
      s.reviewNote ?? '',
      ...DENOMS.map((d) => (s.counted ? (s.counted[`${d}`] ?? 0) : null)),
    ])
  }
  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${BRAND.slug}-shift-close-${from}_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
