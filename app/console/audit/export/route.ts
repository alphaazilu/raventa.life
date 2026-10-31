import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/console/guard'
import { resolvePeriod } from '@/lib/console/report-period'
import { auditFiltersFrom, listAudit, type AuditRow } from '@/lib/console/audit'
import { detailPairs } from '@/lib/console/audit-format'
import { AUDIT_DETAIL_KEYS, auditLabel } from '@/lib/console/copy'
import { BRAND } from '@/lib/brand/config'

// The audit log as CSV (v0.43.1), with the page's filters. UTF-8 with BOM so
// Excel shows Thai. Admins only. Read only.

const MAX_ROWS = 10000
const CHUNK = 999 // + the one extra listAudit asks for = 1,000

function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
const stamp = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')

export async function GET(request: Request) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return new NextResponse('Forbidden', { status: 403 })
  const q = Object.fromEntries(new URL(request.url).searchParams)
  const period = resolvePeriod(q.p || q.from ? q : { p: '7d' })
  const filters = auditFiltersFrom(q, period)
  // Supabase returns at most 1,000 rows per request: read in chunks.
  const rows: AuditRow[] = []
  const seen = new Set<number>()
  for (let offset = 0; offset < MAX_ROWS; offset += CHUNK) {
    const page = await listAudit(filters, offset, CHUNK)
    if (!page) return new NextResponse('Not available', { status: 503 })
    // a row logged mid-export shifts the pages by one — skip repeats
    for (const r of page.rows) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      rows.push(r)
    }
    if (!page.hasMore) break
  }

  const out: (string | number | null)[][] = [['วันเวลา', 'ผู้ทำ', 'การกระทำ', 'รหัส', 'สมาชิกที่เกี่ยว', 'เลขสมาชิก', 'รายละเอียด']]
  for (const r of rows.slice(0, MAX_ROWS)) {
    out.push([
      stamp(r.at),
      r.actorName ?? (r.actorId ? '—' : 'ระบบ'),
      auditLabel(r.action).th,
      r.action,
      r.memberName ?? '',
      r.memberNo ?? '',
      detailPairs(r.detail)
        .map(([k, v]) => `${AUDIT_DETAIL_KEYS[k]?.th ?? k}: ${v}`)
        .join(' · '),
    ])
  }
  const name = `${BRAND.slug}-audit-${period.from}_${period.to}.csv`
  return new NextResponse(csv(out), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  })
}
