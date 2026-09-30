type Bilingual = { th: string; en: string }

// Front-desk screen (/console/desk). Staff-facing, so short and direct.
export const deskCopy = {
  title: { th: 'เช็คอินหน้าร้าน', en: 'Front Desk Check-in' },

  scanHeading: { th: 'สแกน QR บัตรสมาชิก', en: 'Scan member QR' },
  startCamera: { th: 'เปิดกล้อง', en: 'Start camera' },
  stopCamera: { th: 'ปิดกล้อง', en: 'Stop camera' },
  switchCamera: { th: 'สลับกล้อง', en: 'Switch camera' },
  cameraHint: { th: 'ให้ลูกค้าเปิด QR เต็มจอ แล้วถือห่างกล้องประมาณหนึ่งฝ่ามือ', en: 'Ask the member to open their full-screen QR and hold it a hand’s width from the camera' },
  cameraDenied: { th: 'ไม่ได้รับอนุญาตให้ใช้กล้อง — อนุญาตในการตั้งค่าเบราว์เซอร์ หรือค้นหาด้วยเบอร์โทรแทน', en: 'Camera permission denied — allow it in the browser settings, or search by phone instead' },
  cameraUnavailable: { th: 'เปิดกล้องไม่ได้บนอุปกรณ์นี้ — ค้นหาด้วยเบอร์โทรแทน', en: 'No camera available on this device — search by phone instead' },

  searchPlaceholder: { th: 'เบอร์โทร / เลขสมาชิก / ชื่อ', en: 'Phone / member no. / name' },
  searchButton: { th: 'ค้นหา', en: 'Search' },
  noResults: { th: 'ไม่พบสมาชิก', en: 'No member found' },
  resultsHeading: { th: 'เลือกสมาชิก', en: 'Choose a member' },

  emptyPanel: { th: 'สแกน QR หรือค้นหาสมาชิกเพื่อเริ่ม', en: 'Scan a QR or search for a member to begin' },
  nextGuest: { th: 'คนถัดไป', en: 'Next guest' },
  memberNo: { th: 'เลขสมาชิก', en: 'Member no.' },
  memberSince: { th: 'สมาชิกตั้งแต่', en: 'Member since' },
  roleStaff: { th: 'พนักงาน', en: 'Staff' },
  roleAdmin: { th: 'แอดมิน', en: 'Admin' },

  stamps: { th: 'บัตรสะสม', en: 'Stamp card' },
  rewardReady: { th: 'มีสิทธิ์ Day Pass ฟรี', en: 'Free Day Pass available' },

  selfWarning: { th: 'นี่คือบัญชีของคุณเอง — ให้พนักงานคนอื่นเช็คอินให้', en: 'This is your own account — ask another staff member to check you in' },

  inStoreNow: { th: 'อยู่ในร้าน', en: 'In the spa' },
  checkedInAt: { th: 'เช็คอิน', en: 'Checked in' },
  checkedOutAt: { th: 'เช็คเอาต์', en: 'Checked out' },
  visitedToday: { th: 'มาแล้ววันนี้', en: 'Already visited today' },
  wristband: { th: 'สายรัดข้อมือ', en: 'Wristband' },
  wristbandPlaceholder: { th: 'เลขสายรัด (ถ้ามี)', en: 'Wristband no. (optional)' },

  dayPassToday: { th: 'Day Pass วันนี้', en: 'Day Pass today' },
  weekday: { th: 'วันธรรมดา', en: 'weekday' },
  weekend: { th: 'เสาร์-อาทิตย์', en: 'weekend' },
  baht: { th: 'บาท', en: 'THB' },
  paymentMethod: { th: 'วิธีชำระเงิน', en: 'Payment' },
  cash: { th: 'เงินสด', en: 'Cash' },
  transfer: { th: 'โอน / QR', en: 'Transfer / QR' },
  card: { th: 'บัตร', en: 'Card' },
  chooseMethod: { th: 'เลือกวิธีชำระเงินก่อน', en: 'Choose a payment method first' },
  checkInPaid: { th: 'รับเงิน {price} บาท และเช็คอิน', en: 'Take {price} THB and check in' },
  useReward: { th: 'ใช้สิทธิ์ฟรี (ไม่เก็บเงิน)', en: 'Use free pass (no charge)' },
  rewardWeekdayOnly: { th: 'สิทธิ์ฟรีใช้ได้เฉพาะวันธรรมดา', en: 'Free pass is weekdays only' },
  free: { th: 'สิทธิ์ฟรี', en: 'Free pass' },

  checkOut: { th: 'เช็คเอาต์', en: 'Check out' },
  cancelVisit: { th: 'ยกเลิกเช็คอิน', en: 'Undo check-in' },
  cancelReason: { th: 'เหตุผล (จำเป็น)', en: 'Reason (required)' },
  cancelConfirm: { th: 'ยืนยันยกเลิก', en: 'Confirm undo' },
  cancelBack: { th: 'ไม่ยกเลิก', en: 'Keep' },
  cancelHint: { th: 'พนักงานยกเลิกได้ภายใน 30 นาที · คืนแต้ม/สิทธิ์ให้อัตโนมัติ · บันทึกชื่อผู้ยกเลิก', en: 'Staff can undo within 30 minutes · stamp/free pass is returned · your name is logged' },

  doneCheckIn: { th: 'เช็คอินแล้ว', en: 'Checked in' },
  doneCheckOut: { th: 'เช็คเอาต์แล้ว', en: 'Checked out' },
  doneCancel: { th: 'ยกเลิกเช็คอินแล้ว', en: 'Check-in undone' },

  floorHeading: { th: 'วันนี้', en: 'Today' },
  capacity: { th: 'คนในร้านตอนนี้', en: 'In the spa now' },
  nobodyYet: { th: 'ยังไม่มีคนเช็คอินวันนี้', en: 'No check-ins yet today' },
  leftToday: { th: 'ออกแล้ว', en: 'Left' },
  takings: { th: 'รับเงินวันนี้', en: 'Taken today' },
  takingsAdminOnly: { th: 'ยอดขายรวมเห็นเฉพาะแอดมิน', en: 'Totals are admin-only' },
  freeCount: { th: 'สิทธิ์ฟรี', en: 'Free passes' },
  people: { th: 'คน', en: 'people' },
  refresh: { th: 'รีเฟรช', en: 'Refresh' },
} satisfies Record<string, Bilingual>

// Database / server error codes → what staff see.
export const deskErrors: Record<string, Bilingual> = {
  not_staff: { th: 'บัญชีนี้ไม่มีสิทธิ์ใช้หน้าเช็คอิน', en: 'This account can’t use the front desk' },
  not_set_up: { th: 'ระบบเช็คอินยังไม่พร้อม — ต้องรัน supabase/schema.sql เวอร์ชันล่าสุดก่อน', en: 'Check-in isn’t set up yet — run the latest supabase/schema.sql first' },
  self_service: { th: 'เช็คอิน / ให้แต้ม / ใช้สิทธิ์ให้ตัวเองไม่ได้ — ให้พนักงานคนอื่นทำ', en: 'You can’t serve yourself — ask another staff member' },
  member_not_found: { th: 'ไม่พบสมาชิก', en: 'Member not found' },
  already_checked_in: { th: 'สมาชิกคนนี้เช็คอินวันนี้แล้ว', en: 'Already checked in today' },
  payment_method_required: { th: 'เลือกวิธีชำระเงินก่อน', en: 'Choose a payment method first' },
  reward_weekday_only: { th: 'สิทธิ์ฟรีใช้ได้เฉพาะวันธรรมดา', en: 'Free pass is weekdays only' },
  no_reward: { th: 'ยังไม่มีสิทธิ์ฟรี', en: 'No free pass available' },
  visit_not_found: { th: 'ไม่พบรายการนี้ หรือถูกยกเลิกไปแล้ว', en: 'Visit not found or already undone' },
  already_checked_out: { th: 'เช็คเอาต์ไปแล้ว', en: 'Already checked out' },
  reason_required: { th: 'กรุณาใส่เหตุผล', en: 'Please give a reason' },
  cancel_window_passed: { th: 'เกิน 30 นาทีแล้ว — ให้แอดมินยกเลิก', en: 'Over 30 minutes — ask an admin to undo it' },
  qr_expired: { th: 'QR หมดอายุ — ให้ลูกค้าเปิดบัตรใหม่อีกครั้ง', en: 'QR expired — ask the member to reopen their card' },
  qr_invalid: { th: 'QR นี้ไม่ใช่บัตรสมาชิก RAVENTA', en: 'Not a RAVENTA member QR' },
  failed: { th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Something went wrong — try again' },
}

export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
