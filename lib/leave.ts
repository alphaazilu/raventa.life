// Leave requests (schema.sql §25): shared types and rules, used by the
// staff's phone (My account › My shifts) and Back Office › Time › Leave.

export const LEAVE_KINDS = ['vacation', 'sick', 'personal'] as const
export type LeaveKind = (typeof LEAVE_KINDS)[number]
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type LeaveRules = {
  noticeDays: number // ask at least this many days ahead (sick leave: any time)
  kinds: Record<LeaveKind, boolean> // which kinds staff may ask for
  quotas: Record<LeaveKind, number> // days per calendar year; 0 = no limit
}

export const DEFAULT_LEAVE_RULES: LeaveRules = {
  noticeDays: 3,
  kinds: { vacation: true, sick: true, personal: true },
  quotas: { vacation: 0, sick: 0, personal: 0 },
}

// Sick leave may be reported up to this many days after the fact.
export const SICK_BACKDATE_DAYS = 7
export const MAX_LEAVE_DAYS = 60

export type LeaveRequest = {
  id: string
  staffId: string
  staffName: string
  start: string
  end: string
  days: number
  kind: LeaveKind
  reason: string | null
  hasDoc: boolean
  status: LeaveStatus
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
}

// Days used this year per kind (approved + still waiting), for quotas.
export type LeaveBalance = Record<LeaveKind, { used: number; quota: number }>

export const DAY_MS = 86_400_000
export const isoAdd = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
export const daysInclusive = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1

export function datesOf(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end && out.length <= MAX_LEAVE_DAYS; d = isoAdd(d, 1)) out.push(d)
  return out
}

export const leaveCopy = {
  vacation: { th: 'ลาพักร้อน', en: 'Vacation' },
  sick: { th: 'ลาป่วย', en: 'Sick leave' },
  personal: { th: 'ลากิจ', en: 'Personal leave' },
  pending: { th: 'รออนุมัติ', en: 'Waiting' },
  approved: { th: 'อนุมัติแล้ว', en: 'Approved' },
  rejected: { th: 'ไม่อนุมัติ', en: 'Declined' },
  cancelled: { th: 'ยกเลิกแล้ว', en: 'Cancelled' },
}

export const leaveErrors: Record<string, { th: string; en: string }> = {
  not_staff: { th: 'เฉพาะพนักงานเท่านั้น', en: 'Staff only' },
  bad_dates: { th: 'วันที่ไม่ถูกต้อง', en: 'Check the dates' },
  too_long: { th: `ขอได้ครั้งละไม่เกิน ${MAX_LEAVE_DAYS} วัน`, en: `At most ${MAX_LEAVE_DAYS} days at a time` },
  kind_off: { th: 'การลาประเภทนี้ปิดอยู่', en: 'This kind of leave is turned off' },
  notice: { th: 'ต้องขอล่วงหน้าอย่างน้อย {n} วัน', en: 'Ask at least {n} days ahead' },
  sick_past: { th: `ลาป่วยย้อนหลังได้ไม่เกิน ${SICK_BACKDATE_DAYS} วัน`, en: `Sick leave can go back ${SICK_BACKDATE_DAYS} days at most` },
  past: { th: 'เลือกวันที่ยังไม่ผ่านไป', en: 'Pick days that haven’t passed' },
  overlap: { th: 'มีคำขอหยุดช่วงนี้อยู่แล้ว', en: 'You already asked for some of these days' },
  quota: { th: 'เกินโควตา — เหลือ {n} วันในปีนี้', en: 'Over your allowance — {n} days left this year' },
  file_big: { th: 'ไฟล์ใหญ่เกิน 4 MB', en: 'File is over 4 MB' },
  file_type: { th: 'แนบได้เฉพาะรูปหรือ PDF', en: 'Images or PDF only' },
  not_pending: { th: 'คำขอนี้ถูกตัดสินไปแล้ว', en: 'This request was already decided' },
  not_set_up: { th: 'ยังไม่ได้รัน schema.sql §25', en: 'schema.sql §25 hasn’t been run' },
  failed: { th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Something went wrong — try again' },
} satisfies Record<string, { th: string; en: string }>
