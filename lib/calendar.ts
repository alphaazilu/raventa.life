// Calendar (§31, v0.32) — shared by the server and the screens.

export const KINDS = ['event', 'campaign', 'note', 'closed'] as const
export type CalKind = (typeof KINDS)[number]
export const VISIBILITY = ['admins', 'team', 'staff', 'members', 'public'] as const
export type Visibility = (typeof VISIBILITY)[number]
export const REPEATS = ['none', 'weekly', 'monthly', 'yearly'] as const
export type Repeat = (typeof REPEATS)[number]

export type CalItem = {
  id: string
  kind: CalKind
  title: string
  titleEn: string | null
  body: string | null
  bodyEn: string | null
  internalNote: string | null // team only — never sent to members / the website
  place: string | null
  startsOn: string // YYYY-MM-DD
  endsOn: string
  startTime: string | null // HH:MM, null = all day
  endTime: string | null
  visibility: Visibility
  staffIds: string[]
  repeat: Repeat
  repeatUntil: string | null
  createdBy: string | null
  createdByName: string | null
}

// One showing of an item (repeats give several).
export type Occurrence = { item: CalItem; start: string; end: string }

// Things shown from other tables (admin / team calendar).
export type CalExtra =
  | { type: 'holiday'; day: string; name: string }
  | { type: 'promo'; start: string; end: string; name: string }
  | { type: 'leave'; start: string; end: string; name: string }
  | { type: 'shifts'; day: string; count: number }

export type Viewer = { id: string | null; role: 'admin' | 'staff' | 'member' | 'public' }

// Who may see an item.
export function canSee(item: Pick<CalItem, 'visibility' | 'staffIds'>, v: Viewer): boolean {
  if (v.role === 'admin') return true
  if (item.visibility === 'public') return true
  if (item.visibility === 'members') return v.role !== 'public'
  if (item.visibility === 'team') return v.role === 'staff'
  if (item.visibility === 'staff') return v.role === 'staff' && !!v.id && item.staffIds.includes(v.id)
  return false
}

// For members and the website: drop the team's own note.
export const forOutside = (i: CalItem): CalItem => ({ ...i, internalNote: null, staffIds: [], createdBy: null, createdByName: null })

const DAY = 86_400_000
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)

function addMonths(d: string, n: number): string | null {
  const [y, m, day] = d.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, day))
  return t.getUTCDate() === day ? t.toISOString().slice(0, 10) : null // e.g. no 31 Feb
}

// Every showing of an item that touches [from, to] (both inclusive).
export function occurrences(item: CalItem, from: string, to: string): Occurrence[] {
  const len = daysBetween(item.startsOn, item.endsOn)
  const out: Occurrence[] = []
  const push = (start: string) => {
    const end = addDays(start, len)
    if (end >= from && start <= to) out.push({ item, start, end })
  }
  if (item.repeat === 'none') {
    push(item.startsOn)
    return out
  }
  const until = item.repeatUntil && item.repeatUntil < to ? item.repeatUntil : to
  for (let i = 0; i < 800; i++) {
    const start =
      item.repeat === 'weekly' ? addDays(item.startsOn, 7 * i) : item.repeat === 'monthly' ? addMonths(item.startsOn, i) : addMonths(item.startsOn, 12 * i)
    if (start === null) continue
    if (start > until) break
    push(start)
  }
  return out
}

export const hm = (t: string | null) => (t ? t.slice(0, 5) : null)

const L = (th: string, en: string) => ({ th, en })

export const kindCopy: Record<CalKind, { th: string; en: string }> = {
  event: L('อีเวนต์', 'Event'),
  campaign: L('แคมเปญ', 'Campaign'),
  note: L('โน้ตสำคัญ', 'Note'),
  closed: L('ปิดร้าน / วันพิเศษ', 'Closed / special day'),
}

export const visibilityCopy: Record<Visibility, { th: string; en: string }> = {
  admins: L('เฉพาะแอดมิน', 'Admins only'),
  team: L('ทีมทั้งหมด', 'Whole team'),
  staff: L('พนักงานที่เลือก', 'Chosen staff'),
  members: L('สมาชิกทุกคน', 'All members'),
  public: L('สาธารณะ (หน้าเว็บ)', 'Public (website)'),
}

export const repeatCopy: Record<Repeat, { th: string; en: string }> = {
  none: L('ไม่ซ้ำ', 'Doesn’t repeat'),
  weekly: L('ทุกสัปดาห์', 'Every week'),
  monthly: L('ทุกเดือน', 'Every month'),
  yearly: L('ทุกปี', 'Every year'),
}

export const calCopy = {
  title: L('ปฏิทิน', 'Calendar'),
  month: L('เดือน', 'Month'),
  list: L('รายการ', 'List'),
  today: L('วันนี้', 'Today'),
  add: L('เพิ่มรายการ', 'Add'),
  addNote: L('เพิ่มโน้ตทีม', 'Add a team note'),
  layers: L('แสดง', 'Show'),
  layerItems: L('รายการ', 'Items'),
  layerHolidays: L('วันหยุด', 'Holidays'),
  layerPromos: L('โปรโมชั่น', 'Promotions'),
  layerLeave: L('ลา', 'Leave'),
  layerShifts: L('คนเข้ากะ', 'On shift'),
  holiday: L('วันหยุดนักขัตฤกษ์', 'Public holiday'),
  promo: L('โปรโมชั่น', 'Promotion'),
  leave: L('ลา', 'Leave'),
  onShift: L('{n} คนเข้ากะ', '{n} on shift'),
  nothing: L('ไม่มีรายการ', 'Nothing here'),
  nothingRange: L('ไม่มีรายการในช่วงนี้', 'Nothing in this period'),
  allDay: L('ทั้งวัน', 'All day'),
  more: L('+{n} รายการ', '+{n} more'),
  notSetUp: L('ยังไม่ได้ตั้งค่าปฏิทิน — แอดมินรัน schema.sql ส่วน §31 ก่อน', 'Calendar not set up yet — an admin needs to run schema.sql §31'),
  // form
  newItem: L('รายการใหม่', 'New item'),
  editItem: L('แก้ไขรายการ', 'Edit item'),
  kind: L('ประเภท', 'Type'),
  fTitle: L('ชื่อเรื่อง', 'Title'),
  fTitleEn: L('ชื่อเรื่อง (อังกฤษ — ถ้ามี)', 'Title (English — optional)'),
  fBody: L('รายละเอียดที่คนเห็น', 'Details people see'),
  fBodyEn: L('รายละเอียด (อังกฤษ — ถ้ามี)', 'Details (English — optional)'),
  fInternal: L('โน้ตภายในทีม (ลูกค้าไม่เห็น)', 'Team-only note (customers never see it)'),
  fPlace: L('สถานที่', 'Place'),
  fStart: L('วันเริ่ม', 'Starts'),
  fEnd: L('วันสิ้นสุด', 'Ends'),
  fAllDay: L('ทั้งวัน', 'All day'),
  fFrom: L('เวลาเริ่ม', 'From'),
  fTo: L('ถึง', 'To'),
  fWho: L('ใครเห็น', 'Who sees it'),
  fStaff: L('เลือกพนักงาน', 'Choose staff'),
  fRepeat: L('ทำซ้ำ', 'Repeat'),
  fUntil: L('ถึงวันที่ (ถ้ามี)', 'Until (optional)'),
  save: L('บันทึก', 'Save'),
  cancel: L('ยกเลิก', 'Cancel'),
  del: L('ลบรายการ', 'Delete'),
  delConfirm: L('ลบรายการนี้ (และทุกครั้งที่ซ้ำ) ใช่ไหม?', 'Delete this item (and every repeat)?'),
  yesDel: L('ลบ', 'Delete'),
  by: L('โดย', 'by'),
  outsideHint: L('สมาชิก/สาธารณะเห็นเฉพาะชื่อเรื่อง วันเวลา สถานที่ และรายละเอียด', 'Members / the public see only the title, date, time, place and details'),
  // outside the console
  upcoming: L('กิจกรรมและโปรโมชั่น', 'Events & promotions'),
  comingSoon: L('เร็วๆ นี้ที่ RAVENTA', 'Coming up at RAVENTA'),
  seeAll: L('ดูทั้งหมด', 'See all'),
  eventsTitle: L('กิจกรรมและข่าวสาร', 'Events & news'),
  eventsIntro: L('อีเวนต์ แคมเปญ และวันเปิด-ปิดพิเศษของ RAVENTA', 'Events, campaigns and special opening days at RAVENTA'),
  teamUpcoming: L('ปฏิทินทีม 7 วันข้างหน้า', 'Team calendar — next 7 days'),
}

export const calErrors: Record<string, { th: string; en: string }> = {
  not_set_up: calCopy.notSetUp,
  not_allowed: L('ไม่มีสิทธิ์ทำรายการนี้', 'You can’t do that'),
  bad_title: L('ใส่ชื่อเรื่อง (ไม่เกิน 100 ตัวอักษร)', 'Add a title (up to 100 characters)'),
  bad_dates: L('วันที่ไม่ถูกต้อง (ยาวได้ไม่เกิน 92 วัน)', 'Check the dates (up to 92 days long)'),
  bad_times: L('เวลาไม่ถูกต้อง', 'Check the times'),
  need_staff: L('เลือกพนักงานอย่างน้อย 1 คน', 'Choose at least one staff member'),
  failed: L('ทำไม่สำเร็จ ลองใหม่อีกครั้ง', 'Something went wrong — try again'),
}
