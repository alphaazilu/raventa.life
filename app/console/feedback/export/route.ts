import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/console/guard'
import { listFeedback, listTopics } from '@/lib/console/feedback'

// Member feedback as CSV (§32, v0.33). UTF-8 with BOM so Excel shows Thai.

const ISO = /^\d{4}-\d{2}-\d{2}$/

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
  const [topics, rows] = await Promise.all([listTopics(true), listFeedback(from, to, 20000)])
  const ts = topics ?? []
  const out: (string | number | null)[][] = [['ส่งเมื่อ', 'วันที่มา', 'สมาชิก', 'เลขสมาชิก', 'ภาพรวม', ...ts.map((t) => t.label), 'คอมเมนต์', 'ขอให้ติดต่อกลับ', 'จัดการเมื่อ', 'จัดการโดย', 'บันทึก']]
  for (const r of [...(rows ?? [])].reverse()) {
    out.push([
      stamp(r.createdAt),
      r.visitDate,
      r.memberName,
      r.memberNo ?? '',
      r.overall,
      ...ts.map((t) => r.scores[t.key] ?? null),
      r.comment ?? '',
      r.contactMe ? 'ใช่' : '',
      stamp(r.handledAt),
      r.handledBy ?? '',
      r.handledNote ?? '',
    ])
  }
  return new NextResponse(csv(out), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="raventa-feedback-${from}_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
