import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/console/guard'
import { getAppSettings } from '@/lib/console/settings'
import { resolveTimePeriod } from '@/lib/console/time-period'
import { loadTimeReport } from '@/lib/console/time-report'
import { leaveTotal, type PersonTime } from '@/lib/console/time-report-calc'

// Back Office › Reports › Time › Export (v0.28): CSV for pay (UTF-8 with BOM
// so Excel shows Thai). ?type=summary — one row per person of the chosen
// pay type; ?type=daily — one row per person per day, everyone. Hours are
// decimal (8.5 = 8 h 30 min) so Excel can multiply them.

const PAY: Record<string, string> = { monthly: 'รายเดือน', daily: 'รายวัน' }
const STATUS: Record<string, string> = {
  worked: 'มา',
  partial: 'มาไม่ครบกะ',
  absent: 'ขาด',
  leave: 'ลา',
  off: 'วันหยุด',
  upcoming: 'ยังไม่ถึง',
  none: '',
}
const LEAVE: Record<string, string> = { vacation: 'ลาพักร้อน', sick: 'ลาป่วย', personal: 'ลากิจ' }

function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

const hours = (min: number) => Math.round((min / 60) * 100) / 100
const time = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function summary(people: PersonTime[]) {
  return [
    [
      'ชื่อ',
      'เลขสมาชิก',
      'ประเภท',
      'วันที่มีกะ',
      'วันที่มาทำงาน',
      'ชั่วโมงจริง',
      'ชั่วโมงตามกะ',
      'ขาด (วัน)',
      'ขาด (กะ)',
      'ลาพักร้อน',
      'ลาป่วย',
      'ลากิจ',
      'ลารวม',
      'สาย (ครั้ง)',
      'สาย (นาที)',
      'ออกก่อน (ครั้ง)',
      'ออกก่อน (นาที)',
      'OT (ชั่วโมง)',
      'ทำงานวันนักขัตฤกษ์ (วัน)',
      'ทำงานวันนักขัตฤกษ์ (ชั่วโมง)',
      'ลืมลงเวลาออก',
      'แอดมินลงออก',
      'แก้ไขเวลา',
    ],
    ...people.map((p) => [
      p.name,
      p.memberNo,
      p.payType ? PAY[p.payType] : 'ยังไม่ระบุ',
      p.scheduledDays,
      p.daysWorked,
      hours(p.workedMinutes),
      hours(p.scheduledMinutes),
      p.absentDays,
      p.missedShifts,
      p.leave.vacation,
      p.leave.sick,
      p.leave.personal,
      leaveTotal(p),
      p.lateCount,
      p.lateMinutes,
      p.earlyCount,
      p.earlyMinutes,
      hours(p.otMinutes),
      p.holidayDays,
      hours(p.holidayMinutes),
      p.forgotten,
      p.adminOut,
      p.edited,
    ]),
  ]
}

function daily(people: PersonTime[]) {
  const rows: (string | number | null)[][] = [
    ['วันที่', 'ชื่อ', 'เลขสมาชิก', 'ประเภท', 'กะ', 'เข้า', 'ออก', 'ชั่วโมง', 'สาย (นาที)', 'ออกก่อน (นาที)', 'OT (ชั่วโมง)', 'สถานะ', 'ลา', 'วันนักขัตฤกษ์', 'หมายเหตุ'],
  ]
  for (const p of people) {
    for (const d of p.days) {
      if (d.status === 'none' && !d.holiday) continue
      const notes = [
        d.missedShifts && d.status === 'partial' ? `ขาด ${d.missedShifts} กะ` : '',
        d.entries.some((e) => e.forgotten) ? 'ลืมลงเวลาออก' : '',
        d.entries.some((e) => e.adminOut) ? 'แอดมินลงออก' : '',
        d.entries.some((e) => e.edited && !e.adminOut) ? 'แก้ไขเวลา' : '',
      ].filter(Boolean)
      rows.push([
        d.date,
        p.name,
        p.memberNo,
        p.payType ? PAY[p.payType] : 'ยังไม่ระบุ',
        d.shifts.join(' + '),
        d.entries.map((e) => time(e.clockIn)).join(' / '),
        d.entries.map((e) => (e.clockOut ? time(e.clockOut) : '')).join(' / '),
        d.entries.length ? hours(d.workedMinutes) : null,
        d.lateMinutes || null,
        d.earlyMinutes || null,
        d.otMinutes ? hours(d.otMinutes) : null,
        STATUS[d.status],
        d.leave ? LEAVE[d.leave] : '',
        d.holiday ?? '',
        notes.join(' · '),
      ])
    }
  }
  return rows
}

export async function GET(request: Request) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return new NextResponse('Forbidden', { status: 403 })
  const q = Object.fromEntries(new URL(request.url).searchParams)
  const type = q.type === 'daily' ? 'daily' : 'summary'
  const settings = await getAppSettings()
  const period = resolveTimePeriod(q, settings.pay)
  const report = await loadTimeReport(period.from, period.to)
  const group = report.people.filter((p) => (period.pay === 'none' ? !p.payType : p.payType === period.pay))
  const rows = type === 'daily' ? daily(report.people) : summary(group)
  const name = type === 'daily' ? `raventa-time-daily-${period.from}_${period.to}.csv` : `raventa-time-${period.pay}-${period.from}_${period.to}.csv`
  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}
