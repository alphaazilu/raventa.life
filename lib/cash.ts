// Cash drawer and shift close (§30, v0.31) — shared by the server and the
// screens. Thai baht notes and coins, largest first.

export const DENOMS = [1000, 500, 100, 50, 20, 10, 5, 2, 1] as const
export type Denom = (typeof DENOMS)[number]
export type Counted = Partial<Record<`${Denom}`, number>>

export type CashStatus = 'open' | 'counted' | 'closed'

export type CashSession = {
  id: string
  status: CashStatus
  openedAt: string
  openedBy: string // name
  float: number
  countedAt: string | null
  countedBy: string | null
  counted: Counted | null
  countedTotal: number | null
  expected: number | null
  cashIn: number | null
  cashOut: number | null
  transfer: number | null
  card: number | null
  diff: number | null
  reason: string | null
  closedAt: string | null
  closedBy: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  reviewNote: string | null
}

export type CashRules = { float: number; alert: number }
export const DEFAULT_CASH_RULES: CashRules = { float: 2000, alert: 100 }

// A drawer left open this long probably wasn't closed (To do box).
export const OPEN_TOO_LONG_HOURS = 16

export function countedTotal(c: Counted): number {
  return DENOMS.reduce((sum, d) => sum + d * Math.max(0, Math.floor(Number(c[`${d}`] ?? 0)) || 0), 0)
}

// Keep only whole, sane counts of real notes/coins.
export function cleanCounted(raw: unknown): Counted | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Counted = {}
  for (const d of DENOMS) {
    const v = (raw as Record<string, unknown>)[`${d}`]
    if (v === undefined || v === null || v === '') continue
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n > 9999) return null
    if (n > 0) out[`${d}`] = n
  }
  return out
}

export const needsReview = (s: CashSession, rules: CashRules) =>
  s.status === 'closed' && !s.reviewedAt && s.diff !== null && Math.abs(s.diff) >= Math.max(1, rules.alert)

const L = (th: string, en: string) => ({ th, en })

export const cashCopy = {
  title: L('ปิดกะ · ลิ้นชักเงินสด', 'Shift close · cash drawer'),
  tabDrawer: L('ปิดกะ', 'Close shift'),
  tabHistory: L('ประวัติ', 'History'),
  notSetUp: L('ยังไม่ได้ตั้งค่าลิ้นชักเงินสด — แอดมินรัน schema.sql ส่วน §30 ก่อน', 'Cash drawer not set up yet — an admin needs to run schema.sql §30'),
  // open
  closedNow: L('ลิ้นชักยังไม่เปิด', 'The drawer is not open'),
  closedHint: L('ใส่เงินทอนตั้งต้นในลิ้นชัก แล้วกดเปิดลิ้นชักก่อนเริ่มขาย', 'Put the float in the drawer, then open it before you start selling'),
  float: L('เงินทอนตั้งต้น', 'Float'),
  floatHint: L('ตั้งค่าที่ ตั้งค่า › ร้านและบัญชี', 'Set in Settings › Shop & accounts'),
  open: L('เปิดลิ้นชัก', 'Open the drawer'),
  openSince: L('เปิดลิ้นชักตั้งแต่', 'Drawer open since'),
  by: L('โดย', 'by'),
  // count
  countHeading: L('นับเงินในลิ้นชัก', 'Count the cash in the drawer'),
  countHint: L('นับเงินจริงก่อน ระบบจะไม่แสดงยอดที่ควรมีจนกว่าจะส่ง', 'Count the real cash first — what should be there stays hidden until you send'),
  piece: L('ใบ/เหรียญ', 'pcs'),
  total: L('เงินสดที่นับได้', 'Cash counted'),
  send: L('ส่งยอดปิดกะ', 'Send the count'),
  sendConfirm: L('ส่งแล้วแก้ตัวเลขไม่ได้ · นับครบทุกช่องแล้วใช่ไหม?', 'You can’t change the count once sent · counted everything?'),
  yesSend: L('ส่งยอด', 'Send'),
  cancel: L('ยกเลิก', 'Cancel'),
  // result
  result: L('ผลปิดกะ', 'Shift close result'),
  even: L('เงินสดตรง', 'Cash is right'),
  short: L('เงินสดขาด', 'Cash short'),
  over: L('เงินสดเกิน', 'Cash over'),
  baht: L('บาท', 'THB'),
  reason: L('เหตุผล (จำเป็น)', 'Reason (required)'),
  reasonPh: L('เช่น ทอนเงินลูกค้าเกิน บิล #B0131', 'e.g. gave too much change, bill #B0131'),
  note: L('หมายเหตุ (ถ้ามี)', 'Note (optional)'),
  confirm: L('ยืนยันปิดกะ', 'Confirm and close'),
  closedDone: L('ปิดกะแล้ว', 'Shift closed'),
  openNext: L('เปิดลิ้นชักกะถัดไป', 'Open the drawer for the next shift'),
  lockedHint: L('ปิดแล้วแก้ไม่ได้ · แอดมินเห็นส่วนต่างทุกกะในประวัติ', 'Closed counts can’t be changed · admins see every difference in History'),
  // history (admin)
  from: L('จาก', 'From'),
  to: L('ถึง', 'To'),
  show: L('แสดง', 'Show'),
  csv: L('ดาวน์โหลด CSV', 'Download CSV'),
  none: L('ไม่มีการปิดกะในช่วงนี้', 'No shifts in this range'),
  colOpened: L('เปิด', 'Opened'),
  colClosed: L('ปิด', 'Closed'),
  colFloat: L('เงินทอน', 'Float'),
  colCashIn: L('ขายเงินสด', 'Cash sales'),
  colCashOut: L('ยกเลิก/คืน', 'Voided'),
  colExpected: L('ควรมี', 'Expected'),
  colCounted: L('นับได้', 'Counted'),
  colDiff: L('ส่วนต่าง', 'Difference'),
  colTransfer: L('โอน', 'Transfer'),
  colCard: L('บัตร', 'Card'),
  colReason: L('เหตุผล', 'Reason'),
  stillOpen: L('ยังเปิดอยู่', 'Still open'),
  waiting: L('รอยืนยัน', 'Waiting to confirm'),
  review: L('บันทึกว่าตรวจแล้ว', 'Mark reviewed'),
  shiftsN: L('{n} กะ', '{n} shifts'),
  totalDiff: L('ส่วนต่างรวม', 'Total difference'),
  reviewed: L('ตรวจแล้ว', 'Reviewed'),
  reviewNote: L('บันทึกของแอดมิน', 'Admin note'),
  needsReview: L('ต้องตรวจ', 'Needs a look'),
  compareHint: L('เทียบยอดโอนกับแอปธนาคาร และยอดบัตรกับใบสรุปเครื่องรูดบัตร', 'Compare transfers with the bank app and cards with the card machine’s slip'),
  denoms: L('ธนบัตร/เหรียญ', 'Notes / coins'),
  adminClose: L('แอดมินนับและปิดแทน', 'Count and close as admin'),
  sellWarn: L('ยังไม่ได้เปิดลิ้นชัก — เงินสดที่รับตอนนี้จะไม่อยู่ในการปิดกะ', 'The drawer isn’t open — cash taken now won’t be in a shift close'),
  sellWarnLink: L('เปิดลิ้นชัก', 'Open the drawer'),
}

export const cashErrors: Record<string, { th: string; en: string }> = {
  not_set_up: cashCopy.notSetUp,
  not_staff: L('บัญชีนี้ไม่มีสิทธิ์ใช้ลิ้นชัก', 'This account can’t use the drawer'),
  desk_tablet_only: L('ใช้ได้เฉพาะบน Tablet หน้าร้าน', 'Only on the counter tablet'),
  not_admin: L('เฉพาะแอดมิน', 'Admins only'),
  already_open: L('มีลิ้นชักเปิดอยู่แล้ว', 'A drawer is already open'),
  not_open: L('ลิ้นชักไม่ได้เปิดอยู่', 'The drawer is not open'),
  bad_count: L('ตัวเลขไม่ถูกต้อง', 'Check the numbers'),
  need_reason: L('ใส่เหตุผลของส่วนต่างก่อน', 'Give a reason for the difference'),
  bad_float: L('เงินทอนตั้งต้นไม่ถูกต้อง', 'Check the float'),
  failed: L('ทำไม่สำเร็จ ลองใหม่อีกครั้ง', 'Something went wrong — try again'),
}
