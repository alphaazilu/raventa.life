// Bookings (§34, v0.35) — shared by the server and the screens. Times are
// Bangkok wall-clock: a day "YYYY-MM-DD" and "HH:MM"; instants are ISO.

export const BOOKING_KINDS = ['service', 'class', 'entry', 'room'] as const
export type BookingKind = (typeof BOOKING_KINDS)[number]
export const BOOKING_STATUSES = ['booked', 'arrived', 'cancelled', 'no_show'] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]
export const STEP_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240] as const

export type BookingResource = { id: string; label: string; staffId: string | null; active: boolean; sort: number }
export type BookingHours = { weekday: number; start: string; end: string }

// Admin-named groups (§35, v0.35.1).
export type BookingCategory = { id: string; nameTh: string; nameEn: string; description: string | null; imageUrl: string | null; sort: number; active: boolean }
export const CATEGORY_BUCKET = 'booking-images'

// Types in their categories' order (then their own), no category last.
export function sortByCategory<T extends { categoryId: string | null; sort: number; nameTh: string }>(types: T[], cats: { id: string; sort: number }[]): T[] {
  const rank = new Map(cats.map((c, i) => [c.id, i]))
  const r = (t: T) => (t.categoryId && rank.has(t.categoryId) ? (rank.get(t.categoryId) as number) : 9999)
  return [...types].sort((a, b) => r(a) - r(b) || a.sort - b.sort || a.nameTh.localeCompare(b.nameTh, 'th'))
}

export type BookingType = {
  id: string
  kind: BookingKind
  categoryId: string | null
  nameTh: string
  nameEn: string
  description: string | null
  durationMin: number
  bufferMin: number
  capacity: number
  stepMin: number
  productId: string | null
  memberBooking: boolean
  advanceDays: number
  minHours: number
  cancelHours: number
  maxParty: number
  active: boolean
  sort: number
  resources: BookingResource[]
  hours: BookingHours[]
}

export type Booking = {
  id: string
  typeId: string
  typeName: { th: string; en: string }
  kind: BookingKind
  productId: string | null
  resourceId: string | null
  resourceLabel: string | null
  day: string
  start: string
  end: string
  memberId: string | null
  memberName: string | null
  memberNo: string | null
  guestName: string | null
  guestPhone: string | null
  party: number
  status: BookingStatus
  source: 'member' | 'staff'
  note: string | null
  createdAt: string
  createdByName: string | null
  lateCancel: boolean
  movedTo: string | null
  arrivedAt: string | null
  noShowAt: string | null
  noShowAuto: boolean
}

export type SlotResource = { id: string; label: string; left: number }
export type Slot = { start: string; time: string; left: number; resources: SlotResource[] }

export type NoShowRules = { lateMin: number; windowDays: number; warn: number; block: number; blockDays: number; lateCancelWeight: number }
export const DEFAULT_NOSHOW_RULES: NoShowRules = { lateMin: 15, windowDays: 60, warn: 2, block: 3, blockDays: 30, lateCancelWeight: 0.5 }

export type NoShowStatus = { score: number; noShows: number; lateCancels: number; level: 'ok' | 'warn' | 'blocked'; blockedUntil: string | null }

// ---- time ----

const DAY = 86_400_000
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
export const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay()
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
// A Bangkok wall-clock time as an instant (Thailand has no daylight saving).
export const bkkInstant = (day: string, time: string) => new Date(`${day}T${time.slice(0, 5)}:00+07:00`).toISOString()
export const bkkHm = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

export const typeName = (t: Pick<BookingType, 'nameTh' | 'nameEn'>, lang: string) => (lang === 'en' && t.nameEn ? t.nameEn : t.nameTh)
export const who = (b: Pick<Booking, 'memberName' | 'guestName'>) => b.memberName ?? b.guestName ?? '—'

// ---- slots ----

// Times the shop is closed on a day (calendar "closed" items): whole day, or ranges of minutes.
export type Closed = { all: boolean; ranges: [number, number][] }

const active = (b: Pick<Booking, 'status'>) => b.status === 'booked' || b.status === 'arrived'

// Every start time of a type on a day with what's left (per person/room).
// `taken` = this type's bookings around that day. `notBefore` = earliest
// start allowed (ms), e.g. now + min_hours for members.
export function daySlots(t: BookingType, day: string, taken: Booking[], closed: Closed, notBefore: number, ignore?: string): Slot[] {
  if (closed.all) return []
  const wd = weekdayOf(day)
  const res = t.resources.filter((r) => r.active).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
  const mine = taken.filter((b) => b.typeId === t.id && active(b) && b.id !== ignore)
  const buf = t.bufferMin * 60_000
  const used = (s: number, e: number, resourceId: string | null) =>
    mine
      .filter((b) => (resourceId === null || b.resourceId === resourceId) && Date.parse(b.start) < e + buf && Date.parse(b.end) + buf > s)
      .reduce((n, b) => n + b.party, 0)
  const out: Slot[] = []
  const seen = new Set<string>()
  for (const h of t.hours.filter((x) => x.weekday === wd).sort((a, b) => toMin(a.start) - toMin(b.start))) {
    for (let m = toMin(h.start); m + t.durationMin <= toMin(h.end); m += t.stepMin) {
      const time = fromMin(m)
      if (seen.has(time)) continue
      seen.add(time)
      if (closed.ranges.some(([a, b]) => m < b && m + t.durationMin > a)) continue
      const start = bkkInstant(day, time)
      const s = Date.parse(start)
      if (s < notBefore) continue
      const e = s + t.durationMin * 60_000
      const resources = res.map((r) => ({ id: r.id, label: r.label, left: Math.max(0, t.capacity - used(s, e, r.id)) }))
      const left = res.length ? Math.max(0, ...resources.map((r) => r.left)) : Math.max(0, t.capacity - used(s, e, null))
      out.push({ start, time, left, resources })
    }
  }
  return out
}

// ---- no-shows ----

export function noShowStatus(
  incidents: { at: string; kind: 'no_show' | 'late_cancel' }[],
  rules: NoShowRules,
  today: string,
  pardonedAt: string | null,
): NoShowStatus {
  const since = Date.parse(`${addDays(today, -rules.windowDays)}T00:00:00+07:00`)
  const p = pardonedAt ? Date.parse(pardonedAt) : 0
  const list = incidents.filter((i) => Date.parse(i.at) >= since && Date.parse(i.at) > p)
  const noShows = list.filter((i) => i.kind === 'no_show').length
  const lateCancels = list.filter((i) => i.kind === 'late_cancel').length
  const score = Math.round((noShows + lateCancels * rules.lateCancelWeight) * 10) / 10
  let level: NoShowStatus['level'] = 'ok'
  let blockedUntil: string | null = null
  if (rules.block > 0 && score >= rules.block) {
    const last = list.map((i) => i.at).sort().at(-1)
    const lastDay = last ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(last)) : today
    const until = addDays(lastDay, rules.blockDays)
    if (until >= today) {
      level = 'blocked'
      blockedUntil = until
    }
  }
  if (level === 'ok' && rules.warn > 0 && score >= rules.warn) level = 'warn'
  return { score, noShows, lateCancels, level, blockedUntil }
}

// Late for a booking still "booked": started more than lateMin minutes ago.
export const isLate = (b: Pick<Booking, 'status' | 'start'>, lateMin: number, now = Date.now()) => b.status === 'booked' && now > Date.parse(b.start) + lateMin * 60_000

// ---- copy ----

const L = (th: string, en: string) => ({ th, en })

export const kindLabel: Record<BookingKind, { th: string; en: string }> = {
  service: L('บริการรายคน', 'Service'),
  class: L('คลาส/กิจกรรมกลุ่ม', 'Class'),
  entry: L('รอบเข้าใช้ Day Pass', 'Entry window'),
  room: L('ห้อง/โซนส่วนตัว', 'Private room'),
}
export const kindHint: Record<BookingKind, { th: string; en: string }> = {
  service: L('เลือกเวลา (และคนให้บริการ) · 1 คิวต่อคนให้บริการ · กันเวลาซ้อน', 'Pick a time (and who) · one guest per person · no overlaps'),
  class: L('รอบเวลา + จำนวนที่นั่ง', 'Set times + seats'),
  entry: L('ช่วงเวลาเข้าร้าน + จำนวนที่รับ · walk-in ยังเข้าได้ถ้าที่เหลือ', 'An entry window + how many · walk-ins fill what’s left'),
  room: L('จองเป็นช่วง + เวลาเผื่อทำความสะอาด', 'Booked as a block + clean-up time'),
}
export const statusLabel: Record<BookingStatus, { th: string; en: string }> = {
  booked: L('จองแล้ว', 'Booked'),
  arrived: L('มาแล้ว', 'Arrived'),
  cancelled: L('ยกเลิก', 'Cancelled'),
  no_show: L('ไม่มา', 'No-show'),
}
export const WEEKDAYS = [L('อา', 'Sun'), L('จ', 'Mon'), L('อ', 'Tue'), L('พ', 'Wed'), L('พฤ', 'Thu'), L('ศ', 'Fri'), L('ส', 'Sat')]

export const bkCopy = {
  // back office
  title: L('การจอง', 'Bookings'),
  tabDay: L('รายวัน', 'Day'),
  tabList: L('รายการ', 'List'),
  tabStats: L('สรุป', 'Summary'),
  tabSetup: L('ตั้งค่าการจอง', 'Setup'),
  notSetUp: L('ยังไม่ได้ตั้งค่าการจอง — แอดมินรัน schema.sql ส่วน §34 ก่อน', 'Bookings aren’t set up — an admin needs to run schema.sql §34'),
  noTypes: L('ยังไม่มีสิ่งที่จองได้ — แอดมินเพิ่มที่แท็บ “ตั้งค่าการจอง”', 'Nothing bookable yet — an admin adds it under “Setup”'),
  newBooking: L('จองใหม่', 'New booking'),
  today: L('วันนี้', 'Today'),
  prev: L('วันก่อน', 'Previous day'),
  next: L('วันถัดไป', 'Next day'),
  nothing: L('ไม่มีการจองวันนี้', 'No bookings this day'),
  nothingRange: L('ไม่มีการจองในช่วงนี้', 'No bookings in this range'),
  late: L('เลยเวลา', 'Late'),
  markArrived: L('มาแล้ว', 'Arrived'),
  markNoShow: L('ไม่มา', 'No-show'),
  cancel: L('ยกเลิกการจอง', 'Cancel booking'),
  undo: L('คืนเป็น “จองแล้ว”', 'Back to “Booked”'),
  move: L('เลื่อนนัด', 'Move'),
  moved: L('เลื่อนแล้ว', 'Moved'),
  lateCancel: L('ยกเลิกกระชั้น', 'Late cancel'),
  autoNoShow: L('ระบบบันทึก “ไม่มา” ตอนปิดวัน', 'Marked no-show at day end'),
  guest: L('ลูกค้าทั่วไป (ไม่ใช่สมาชิก)', 'Walk-in guest (not a member)'),
  member: L('สมาชิก', 'Member'),
  findMember: L('ค้นหาสมาชิก: ชื่อ / เลขสมาชิก / เบอร์', 'Find a member: name / member no. / phone'),
  guestName: L('ชื่อลูกค้า', 'Guest name'),
  guestPhone: L('เบอร์โทร', 'Phone'),
  what: L('จองอะไร', 'What'),
  when: L('วันที่', 'Date'),
  time: L('เวลา', 'Time'),
  whoServes: L('คนให้บริการ / ห้อง', 'With / room'),
  anyone: L('ใครก็ได้ที่ว่าง', 'Anyone free'),
  party: L('จำนวนคน', 'People'),
  note: L('หมายเหตุ', 'Note'),
  book: L('ยืนยันการจอง', 'Book'),
  saveMove: L('ย้ายไปเวลานี้', 'Move to this time'),
  left: L('เหลือ {n}', '{n} left'),
  full: L('เต็ม', 'Full'),
  noSlots: L('ไม่มีเวลาว่างวันนี้', 'No times left this day'),
  closedDay: L('ร้านปิดวันนี้', 'Closed this day'),
  byMember: L('จองเอง', 'Self-booked'),
  byStaff: L('พนักงานจอง', 'Staff-booked'),
  bookedBy: L('จองโดย {n}', 'Booked by {n}'),
  history: L('ประวัติไม่มา: {s} ครั้งใน {d} วัน', 'No-shows: {s} in {d} days'),
  warnNoShow: L('ลูกค้าไม่มาบ่อย — {s} ครั้งใน {d} วัน', 'Often a no-show — {s} in {d} days'),
  blockedUntil: L('งดจองเองถึง {d}', 'Self-booking paused until {d}'),
  pardon: L('ยกเลิกการงด / ล้างประวัติไม่มา', 'Lift the pause / clear no-shows'),
  from: L('จาก', 'From'),
  to: L('ถึง', 'To'),
  show: L('ดู', 'Show'),
  // stats
  stTotal: L('การจองทั้งหมด', 'Bookings'),
  stArrived: L('มาแล้ว', 'Arrived'),
  stNoShow: L('ไม่มา', 'No-shows'),
  stCancelled: L('ยกเลิก', 'Cancelled'),
  stRate: L('อัตราไม่มา', 'No-show rate'),
  stByType: L('แยกตามบริการ', 'By service'),
  stSelf: L('จองเองผ่านแอป', 'Booked in the app'),
  stTop: L('ไม่มาบ่อย', 'Frequent no-shows'),
  // setup
  types: L('สิ่งที่จองได้', 'Bookable'),
  addType: L('เพิ่มสิ่งที่จองได้', 'Add'),
  kind: L('แบบ', 'Type'),
  nameTh: L('ชื่อ', 'Name'),
  nameEn: L('ชื่ออังกฤษ (ถ้ามี)', 'English name (optional)'),
  description: L('รายละเอียด (ลูกค้าเห็น)', 'Description (members see it)'),
  duration: L('ระยะเวลา (นาที)', 'Length (min)'),
  buffer: L('เผื่อเวลาหลังจบ (นาที)', 'Clean-up after (min)'),
  capacity: L('รับได้ต่อรอบ', 'Places per time'),
  capacityRes: L('รับได้ต่อคน/ห้อง ต่อรอบ', 'Places per person/room'),
  step: L('รอบเวลาทุกๆ (นาที)', 'Start every (min)'),
  maxParty: L('จองได้สูงสุดต่อครั้ง (คน)', 'Max people per booking'),
  product: L('สินค้าที่เพิ่มลงบิล', 'Bill item'),
  noProduct: L('ไม่ผูก', 'None'),
  memberBooking: L('ให้สมาชิกจองเองได้', 'Members can book it'),
  advance: L('จองล่วงหน้าได้ (วัน)', 'Book up to (days ahead)'),
  minHours: L('ต้องจองก่อนเวลาอย่างน้อย (ชม.)', 'At least (hours before)'),
  cancelHours: L('ยกเลิกได้ก่อนเวลา (ชม.)', 'Cancel up to (hours before)'),
  active: L('เปิดรับจอง', 'Open'),
  resources: L('คนให้บริการ / ห้อง', 'People / rooms'),
  resourcesHint: L('ไม่ใส่ = ใช้ “รับได้ต่อรอบ” รวมทั้งหมด', 'None = one shared count per time'),
  addResource: L('เพิ่ม', 'Add'),
  resourceLabel: L('ชื่อ (เช่น ห้อง 1 / พี่แอน)', 'Name (e.g. Room 1 / Ann)'),
  linkStaff: L('ผูกพนักงาน', 'Team member'),
  hours: L('เวลาเปิดรับจอง', 'Open hours'),
  hoursHint: L('วันปิดร้านในปฏิทินปิดรับจองให้เอง', 'Closed days in the calendar close bookings too'),
  addHours: L('เพิ่มช่วงเวลา', 'Add hours'),
  copyHours: L('ใช้เวลาเดียวกันทุกวัน', 'Same every day'),
  rules: L('กติกาเมื่อไม่มา', 'No-show rules'),
  rulesHint: L('ยกเลิกล่วงหน้าตามนโยบายไม่นับ · เปลี่ยนแล้วมีผลทันที', 'Cancelling in time doesn’t count · changes apply at once'),
  ruleLate: L('เลยเวลากี่นาทีถึงขึ้น “เลยเวลา”', 'Minutes until “Late”'),
  ruleWindow: L('นับย้อนหลัง (วัน)', 'Look back (days)'),
  ruleWarn: L('เตือนเมื่อไม่มา (ครั้ง)', 'Warn at (no-shows)'),
  ruleBlock: L('งดจองเองเมื่อไม่มา (ครั้ง)', 'Pause self-booking at'),
  ruleBlockDays: L('งดจองเองนาน (วัน)', 'Pause for (days)'),
  ruleLateCancel: L('ยกเลิกกระชั้นนับเป็น (ครั้ง)', 'A late cancel counts as'),
  zeroOff: L('0 = ปิด', '0 = off'),
  save: L('บันทึก', 'Save'),
  saved: L('บันทึกแล้ว', 'Saved'),
  remove: L('ลบ', 'Remove'),
  close: L('ปิด', 'Close'),
  // member
  myBookings: L('การจองของฉัน', 'My bookings'),
  bookNow: L('จองคิว', 'Book'),
  nextBooking: L('นัดถัดไป: {t}', 'Next: {t}'),
  pickWhat: L('เลือกบริการ', 'Choose'),
  pickDay: L('เลือกวัน', 'Choose a day'),
  pickTime: L('เลือกเวลา', 'Choose a time'),
  confirmTitle: L('ยืนยันการจอง', 'Confirm'),
  booked: L('จองเรียบร้อย', 'You’re booked'),
  other: L('อื่นๆ', 'Other'),
  categories: L('หมวดหมู่', 'Categories'),
  categoriesHint: L('จัดกลุ่มสิ่งที่จองได้ให้ลูกค้าเลือกง่าย · เรียงลำดับเองได้ · ไม่ใส่ก็ได้', 'Group what can be booked so members find it · your order · optional'),
  addCategory: L('เพิ่มหมวดหมู่', 'Add a category'),
  category: L('หมวดหมู่', 'Category'),
  noCategory: L('ไม่ระบุ', 'None'),
  catName: L('ชื่อหมวดหมู่', 'Category name'),
  catDesc: L('คำอธิบายสั้นๆ (ลูกค้าเห็น)', 'A short line (members see it)'),
  image: L('รูป', 'Picture'),
  addImage: L('ใส่รูป', 'Add a picture'),
  changeImage: L('เปลี่ยนรูป', 'Change picture'),
  removeImage: L('ลบรูป', 'Remove picture'),
  moveUp: L('เลื่อนขึ้น', 'Move up'),
  moveDown: L('เลื่อนลง', 'Move down'),
  edit: L('แก้ไข', 'Edit'),
  cancelEdit: L('ยกเลิก', 'Cancel'),
  itemsIn: L('{n} รายการ', '{n} items'),
  bookedSub: L('ส่งอีเมลยืนยันให้แล้ว · ชำระเงินที่หน้าร้านตอนมา', 'We’ve emailed you · pay at the counter when you come'),
  upcoming: L('นัดที่กำลังจะถึง', 'Coming up'),
  past: L('ที่ผ่านมา', 'Past'),
  noBookings: L('ยังไม่มีการจอง', 'No bookings yet'),
  cancelUntil: L('ยกเลิกได้ถึง {t}', 'Cancel until {t}'),
  cancelLate: L('เลยเวลายกเลิกฟรีแล้ว — ยกเลิกตอนนี้จะนับเป็นยกเลิกกระชั้น', 'Past the free-cancel time — cancelling now counts as a late cancel'),
  confirmCancel: L('ยืนยันยกเลิก', 'Yes, cancel'),
  keep: L('ไม่ยกเลิก', 'Keep it'),
  payAtShop: L('ไม่ต้องจ่ายตอนจอง — ชำระที่หน้าร้าน', 'Nothing to pay now — pay at the counter'),
  people: L('{n} คน', '{n} people'),
  min: L('{n} นาที', '{n} min'),
  // desk
  deskToday: L('มีจองวันนี้', 'Booked today'),
  addToBill: L('เพิ่มลงบิล', 'Add to bill'),
  added: L('เพิ่มแล้ว', 'Added'),
  // dashboard
  todayCount: L('การจองวันนี้', 'Bookings today'),
  todayLate: L('{n} คิวเลยเวลา', '{n} late'),
}

export const bkErrors: Record<string, { th: string; en: string }> = {
  not_set_up: bkCopy.notSetUp,
  not_signed_in: L('เข้าสู่ระบบก่อน', 'Please sign in first'),
  not_staff: L('เฉพาะพนักงาน', 'Team only'),
  not_admin: L('เฉพาะแอดมิน', 'Admins only'),
  slot_full: L('เวลานี้เต็มแล้ว — เลือกเวลาอื่น', 'That time just filled up — pick another'),
  bad_booking: L('ข้อมูลการจองไม่ถูกต้อง', 'Something’s wrong with that booking'),
  too_soon: L('จองล่วงหน้าไม่พอ หรือเลยเวลาไปแล้ว', 'Too late to book that time'),
  too_far: L('จองล่วงหน้าเกินกำหนด', 'Too far ahead'),
  closed: L('วันนี้ร้านปิด', 'Closed that day'),
  not_bookable: L('บริการนี้ยังไม่เปิดให้จองเอง — ติดต่อร้าน', 'This can’t be booked online — please contact us'),
  blocked: L('งดจองผ่านแอปชั่วคราวเพราะไม่มาตามนัดหลายครั้ง — ติดต่อร้านหรือ walk-in ได้', 'Online booking is paused after several missed bookings — contact us or walk in'),
  overlap: L('คุณมีนัดอื่นช่วงเวลานี้แล้ว', 'You already have a booking at this time'),
  not_yours: L('ไม่พบการจองนี้', 'Booking not found'),
  bad_status: L('การจองนี้เปลี่ยนสถานะไปแล้ว', 'This booking has already changed'),
  need_who: L('เลือกสมาชิก หรือใส่ชื่อลูกค้า', 'Choose a member or enter a name'),
  bad_type: L('ตรวจข้อมูลอีกครั้ง (ชื่อ ระยะเวลา จำนวน)', 'Check the details (name, length, places)'),
  bad_category: L('ตรวจชื่อหมวดหมู่อีกครั้ง (1–40 ตัวอักษร)', 'Check the category name (1–40 characters)'),
  bad_image: L('ใช้รูป JPG/PNG/WebP ไม่เกิน 2 MB', 'Use a JPG/PNG/WebP up to 2 MB'),
  bad_hours: L('ตรวจเวลาเปิดรับจองอีกครั้ง (เวลาจบต้องหลังเวลาเริ่ม)', 'Check the open hours (end after start)'),
  in_use: L('มีการจองใช้อยู่ — ปิดรับจองแทนการลบ', 'It has bookings — turn it off instead'),
  failed: L('ทำไม่สำเร็จ ลองใหม่อีกครั้ง', 'Something went wrong — try again'),
}
