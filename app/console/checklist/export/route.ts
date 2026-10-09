import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/console/guard'
import { dayBounds, listPoints, listScans } from '@/lib/console/checklist'

// Back Office › Checklists › Log as CSV (§29, v0.29). UTF-8 with BOM so
// Excel shows Thai. One row per scan; answers as "label: value".

const ISO = /^\d{4}-\d{2}-\d{2}$/
const FLAG: Record<string, string> = { fast: 'สแกนเร็วผิดปกติ', out_of_range: 'ค่านอกช่วง', missed_items: 'ติ๊กไม่ครบ', issue: 'แจ้งปัญหา' }

function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
const stamp = (iso: string) => {
  const d = new Date(Date.parse(iso) + 7 * 3600_000).toISOString()
  return [d.slice(0, 10), d.slice(11, 16)]
}

export async function GET(request: Request) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return new NextResponse('Forbidden', { status: 403 })
  const q = Object.fromEntries(new URL(request.url).searchParams)
  const from = ISO.test(q.from ?? '') ? q.from : new Date().toISOString().slice(0, 10)
  const to = ISO.test(q.to ?? '') && q.to >= from ? q.to : from
  const [points, scans] = await Promise.all([
    listPoints(),
    listScans(dayBounds(from).from, dayBounds(to).to, { pointId: q.point || undefined, staffId: q.staff || undefined, limit: 20000 }),
  ])
  const names = new Map((points ?? []).map((p) => [p.id, p.name]))
  const rows: (string | number | null)[][] = [['วันที่', 'เวลา', 'จุด', 'พนักงาน', 'ผลตรวจ', 'หมายเหตุ', 'แจ้งปัญหา', 'ธง']]
  for (const s of [...scans].reverse()) {
    const [d, t] = stamp(s.at)
    rows.push([
      d,
      t,
      names.get(s.pointId) ?? '',
      s.staffName,
      s.results.map((r) => `${r.label}: ${r.value === true ? '✓' : r.value === false || r.value === null ? '✗' : r.value}`).join(' | '),
      s.note ?? '',
      s.issue ? 'ใช่' : '',
      s.flags.filter((f) => f !== 'issue').map((f) => FLAG[f] ?? f).join(' · '),
    ])
  }
  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="raventa-checklist-${from}_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
