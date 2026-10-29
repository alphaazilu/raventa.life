import { BRAND } from '@/lib/brand/config'

// Member feedback (§32, v0.33) — shared by the server and the screens.

export const FEEDBACK_DAYS = 7 // a visit can be rated this many days after it
export const MAX_TOPICS = 8

export type FeedbackTopic = { key: string; label: string; labelEn: string | null; sort: number; active: boolean }

export type PendingVisit = { visitId: string; visitDate: string }

export type FeedbackRow = {
  id: string
  memberId: string | null
  memberName: string
  memberNo: string | null
  visitDate: string
  overall: number
  scores: Record<string, number>
  comment: string | null
  contactMe: boolean
  createdAt: string
  handledAt: string | null
  handledBy: string | null
  handledNote: string | null
}

// Needs an admin: low score or "please contact me", not handled yet.
export const needsFollowUp = (f: Pick<FeedbackRow, 'overall' | 'contactMe' | 'handledAt'>) => !f.handledAt && (f.overall <= 2 || f.contactMe)

const L = (th: string, en: string) => ({ th, en })

export const fbCopy = {
  // member
  cardTitle: L('วันนี้เป็นยังไงบ้าง?', 'How was your visit?'),
  cardSub: L('ให้คะแนนการมาเมื่อ {d} · ใช้เวลาไม่ถึงนาที', 'Rate your visit on {d} · takes under a minute'),
  pageTitle: L('ให้คะแนนการมาใช้บริการ', 'Rate your visit'),
  visitOn: L('การมาเมื่อ {d}', 'Your visit on {d}'),
  overall: L('ภาพรวม', 'Overall'),
  topicsHint: L('ให้คะแนนแยกหัวข้อ (ไม่บังคับ)', 'Rate each part (optional)'),
  comment: L('อยากบอกอะไรเราไหม', 'Anything you’d like to tell us?'),
  commentPh: L('ชอบอะไร หรืออยากให้ปรับอะไร', 'What you liked, or what we could do better'),
  contactMe: L('ให้ร้านติดต่อกลับ', 'Please contact me'),
  send: L('ส่งความเห็น', 'Send'),
  thanks: L('ขอบคุณสำหรับความเห็นค่ะ', 'Thank you for your feedback'),
  thanksSub: L('ทีมงานอ่านทุกความเห็น และจะติดต่อกลับถ้าคุณขอไว้', 'We read every answer and will get back to you if you asked'),
  review: L('ช่วยรีวิวบน Google Maps', 'Review us on Google Maps'),
  reviewSub: L(`ถ้าชอบ ${BRAND.name} ช่วยบอกต่อให้คนอื่นรู้จักได้ไหมคะ`, `If you enjoyed ${BRAND.name}, would you tell others?`),
  none: L('ตอนนี้ยังไม่มีการมาที่รอให้คะแนน', 'There’s no visit waiting for a rating'),
  noneSub: L('ให้คะแนนได้ภายใน 7 วันหลังมาใช้บริการ', 'You can rate a visit within 7 days'),
  backAccount: L('กลับบัญชีของฉัน', 'Back to my account'),
  stars: L('{n} ดาว', '{n} stars'),
  // admin
  title: L('ความเห็นลูกค้า', 'Member feedback'),
  tabList: L('ความเห็น', 'Feedback'),
  tabTopics: L('หัวข้อคะแนน', 'Topics'),
  notSetUp: L('ยังไม่ได้ตั้งค่าแบบสอบถาม — แอดมินรัน schema.sql ส่วน §32 ก่อน', 'Feedback not set up yet — an admin needs to run schema.sql §32'),
  avg: L('คะแนนเฉลี่ย', 'Average'),
  answers: L('{n} คำตอบ', '{n} answers'),
  perTopic: L('แยกหัวข้อ', 'By topic'),
  weekly: L('รายสัปดาห์', 'By week'),
  filterAll: L('ทั้งหมด', 'All'),
  filterFollow: L('ต้องติดตาม', 'To follow up'),
  filterComment: L('มีคอมเมนต์', 'With a comment'),
  filterLow: L('1–2 ดาว', '1–2 stars'),
  from: L('จาก', 'From'),
  to: L('ถึง', 'To'),
  show: L('แสดง', 'Show'),
  csv: L('ดาวน์โหลด CSV', 'Download CSV'),
  empty: L('ยังไม่มีความเห็นในช่วงนี้', 'No feedback in this range'),
  wantsContact: L('ขอให้ติดต่อกลับ', 'Asked to be contacted'),
  handle: L('บันทึกว่าติดต่อ/จัดการแล้ว', 'Mark as handled'),
  handled: L('จัดการแล้ว', 'Handled'),
  handleNote: L('บันทึก (เช่น โทรคุยแล้ว ให้ส่วนลดครั้งหน้า)', 'Note (e.g. called, offered a discount next time)'),
  save: L('บันทึก', 'Save'),
  printQr: L('QR ให้คะแนน (ติดทางออก)', 'Rating QR (for the exit)'),
  printQrHint: L('สมาชิกสแกนแล้วเปิดหน้าให้คะแนนการมาล่าสุด', 'Members scan it to rate their latest visit'),
  print: L('พิมพ์', 'Print'),
  topicsNote: L('สูงสุด 8 หัวข้อ · ปิดหัวข้อแล้วคำตอบเดิมยังอยู่', 'Up to 8 topics · turning one off keeps old answers'),
  addTopic: L('เพิ่มหัวข้อ', 'Add a topic'),
  topicTh: L('ชื่อหัวข้อ', 'Topic'),
  topicEn: L('อังกฤษ (ถ้ามี)', 'English (optional)'),
  active: L('ใช้งาน', 'On'),
}

export const fbErrors: Record<string, { th: string; en: string }> = {
  not_set_up: fbCopy.notSetUp,
  not_signed_in: L('เข้าสู่ระบบก่อน', 'Please sign in first'),
  no_visit: L('ไม่พบการมาที่รอให้คะแนน (ให้คะแนนได้ภายใน 7 วัน)', 'No visit to rate (within 7 days)'),
  already: L('ให้คะแนนการมานี้แล้ว ขอบคุณค่ะ', 'You’ve already rated this visit — thank you'),
  bad_stars: L('เลือกดาวภาพรวมก่อน', 'Choose the overall stars first'),
  not_admin: L('เฉพาะแอดมิน', 'Admins only'),
  bad_topics: L('ตรวจชื่อหัวข้ออีกครั้ง (1–40 ตัวอักษร, สูงสุด 8)', 'Check the topics (1–40 characters, up to 8)'),
  failed: L('ทำไม่สำเร็จ ลองใหม่อีกครั้ง', 'Something went wrong — try again'),
}
