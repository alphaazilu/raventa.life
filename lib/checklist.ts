// Staff checklists by QR (schema.sql §29, v0.29). Shared types and the
// time maths (no database, safe in the browser).
//
// A point is a place with a QR sticker and the things to tick or note
// there. A round lists points and when they must be done: once a day in a
// window ("daily"), every N minutes between two times ("every"), or with
// no time ("anytime" — a list to scan when needed, never late). A round's
// slot is done when every point in it was scanned inside the slot, by
// anyone on the team.

export type ItemKind = 'check' | 'number' | 'text'
export type ChecklistItem = { id: string; label: string; kind: ItemKind; unit?: string | null; min?: number | null; max?: number | null }

export type CheckPoint = {
  id: string
  name: string
  place: string | null
  items: ChecklistItem[]
  codeVersion: number
  active: boolean
  sort: number
}

export type RoundKind = 'daily' | 'every' | 'anytime'
export type CheckRound = {
  id: string
  name: string
  pointIds: string[]
  kind: RoundKind
  start: string | null // "07:00"
  end: string | null
  everyMinutes: number | null
  days: number[] // 0 = Sunday
  active: boolean
  sort: number
}

export type Answer = { id: string; label: string; value: boolean | number | string | null }

export type CheckScan = {
  id: string
  pointId: string
  staffId: string
  staffName: string
  at: string
  results: Answer[]
  note: string | null
  issue: boolean
  flags: string[]
}

export type Slot = { roundId: string; start: number; end: number } // ms
export type SlotStatus = 'done' | 'open' | 'upcoming' | 'partial' | 'missed'
export type SlotState = Slot & { status: SlotStatus; done: Record<string, CheckScan | undefined> }

export const MAX_ITEMS = 20
export const MAX_POINTS_PER_ROUND = 40
// Two different points scanned closer together than this by one person is
// flagged — nobody walks between rooms and checks them that fast.
export const FAST_SECONDS = 10

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const at = (date: string, t: string) => Date.parse(`${date}T${t}:00+07:00`)
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

// The windows a round must be done in on one Bangkok date.
export function slotsOn(r: CheckRound, date: string): Slot[] {
  if (!r.active || r.kind === 'anytime' || !r.start || !r.days.includes(dow(date))) return []
  const start = at(date, r.start)
  let span = r.end ? toMin(r.end) - toMin(r.start) : 60
  if (span <= 0) span += 24 * 60
  const end = start + span * 60_000
  if (r.kind === 'daily') return [{ roundId: r.id, start, end }]
  const step = Math.max(30, r.everyMinutes ?? 120) * 60_000
  const out: Slot[] = []
  for (let t = start; t + step <= end + 1 && out.length < 48; t += step) out.push({ roundId: r.id, start: t, end: t + step })
  if (out.length === 0) out.push({ roundId: r.id, start, end })
  return out
}

// Which points of a slot were scanned inside it (the first scan counts),
// and the slot's state at `now`.
export function slotState(slot: Slot, round: CheckRound, scans: CheckScan[], now: number): SlotState {
  const done: Record<string, CheckScan | undefined> = {}
  for (const s of scans) {
    const t = Date.parse(s.at)
    if (t < slot.start || t >= slot.end || !round.pointIds.includes(s.pointId)) continue
    if (!done[s.pointId] || Date.parse(done[s.pointId]!.at) > t) done[s.pointId] = s
  }
  const n = round.pointIds.filter((p) => done[p]).length
  const all = n === round.pointIds.length && n > 0
  const status: SlotStatus = all ? 'done' : now < slot.start ? 'upcoming' : now < slot.end ? 'open' : n ? 'partial' : 'missed'
  return { ...slot, status, done }
}

// Problems with one set of answers: things not ticked or left empty, and
// numbers outside the point's range.
export function answerFlags(items: ChecklistItem[], answers: Answer[]): string[] {
  const flags = new Set<string>()
  for (const it of items) {
    const a = answers.find((x) => x.id === it.id)
    const v = a?.value
    if (it.kind === 'check' && v !== true) flags.add('missed_items')
    if (it.kind === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) flags.add('missed_items')
      else if ((it.min != null && v < it.min) || (it.max != null && v > it.max)) flags.add('out_of_range')
    }
  }
  return [...flags]
}

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 8)
}

const pad = (n: number) => String(n).padStart(2, '0')
export const hhmm = (ms: number) => {
  const d = new Date(ms + 7 * 3600_000)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export const checklistCopy = {
  title: { th: 'เช็คลิสต์', en: 'Checklists' },
  today: { th: 'เช็คลิสต์วันนี้', en: 'Today’s checklists' },
  scan: { th: 'สแกน QR ที่จุด', en: 'Scan a point’s QR' },
  scanHint: { th: 'ส่องกล้องไปที่ QR ที่ติดไว้ตามจุด', en: 'Point the camera at the QR sticker' },
  done: { th: 'ครบแล้ว', en: 'Done' },
  open: { th: 'ถึงเวลาแล้ว', en: 'Due now' },
  upcoming: { th: 'ยังไม่ถึงเวลา', en: 'Later' },
  partial: { th: 'ไม่ครบ', en: 'Incomplete' },
  missed: { th: 'พลาด', en: 'Missed' },
  anytime: { th: 'ทำเมื่อต้องการ', en: 'Any time' },
  left: { th: 'เหลือ {n} จุด', en: '{n} left' },
  nothing: { th: 'วันนี้ไม่มีรอบที่ต้องทำ', en: 'Nothing due today' },
  notSetUp: { th: 'ระบบเช็คลิสต์ยังไม่พร้อม — รัน supabase/schema.sql (§29) ก่อน', en: 'Checklists aren’t set up — run supabase/schema.sql (§29) first' },
  save: { th: 'บันทึก', en: 'Save' },
  saved: { th: 'บันทึกแล้ว', en: 'Saved' },
  note: { th: 'หมายเหตุ', en: 'Note' },
  issue: { th: 'แจ้งปัญหาที่จุดนี้', en: 'Report a problem here' },
  issueHint: { th: 'เช่น ไฟเสีย ของหมด น้ำรั่ว — แอดมินจะเห็นเป็นสีแดง', en: 'e.g. a broken light, ran out, a leak — admins see it in red' },
  scanAgain: { th: 'สแกนจุดถัดไป', en: 'Scan the next point' },
  back: { th: 'กลับไปหน้าเช็คลิสต์', en: 'Back to checklists' },
  range: { th: 'ควรอยู่ {a}–{b}', en: 'Should be {a}–{b}' },
  outOfRange: { th: 'นอกช่วงที่กำหนด', en: 'Out of range' },
  lastScan: { th: 'ตรวจล่าสุด {t} โดย {n}', en: 'Last checked {t} by {n}' },
  noItems: { th: 'จุดนี้ไม่มีรายการให้ติ๊ก — กดบันทึกเพื่อยืนยันว่ามาตรวจแล้ว', en: 'Nothing to tick here — save to confirm you checked' },
  flag_fast: { th: 'สแกนเร็วผิดปกติ', en: 'Scanned unusually fast' },
  flag_out_of_range: { th: 'ค่านอกช่วง', en: 'Value out of range' },
  flag_missed_items: { th: 'ติ๊กไม่ครบ', en: 'Not all ticked' },
  flag_issue: { th: 'แจ้งปัญหา', en: 'Problem reported' },
} satisfies Record<string, { th: string; en: string }>

export const checklistErrors: Record<string, { th: string; en: string }> = {
  not_signed_in: { th: 'กรุณาเข้าสู่ระบบก่อน', en: 'Please sign in first' },
  not_staff: { th: 'เฉพาะพนักงานเท่านั้น', en: 'Staff only' },
  bad_code: { th: 'ไม่ใช่ QR จุดตรวจของ RAVENTA', en: 'Not a RAVENTA check-point QR' },
  old_code: { th: 'QR นี้ถูกเปลี่ยนแล้ว — แจ้งแอดมินให้ติด QR ใหม่', en: 'This QR was replaced — ask an admin for the new sticker' },
  inactive: { th: 'จุดนี้ปิดใช้งานแล้ว', en: 'This point is switched off' },
  not_set_up: { th: 'ระบบเช็คลิสต์ยังไม่พร้อม — รัน supabase/schema.sql (§29) ก่อน', en: 'Checklists aren’t set up — run supabase/schema.sql (§29) first' },
  need_name: { th: 'กรุณาตั้งชื่อ', en: 'Please give it a name' },
  bad_time: { th: 'เวลาไม่ถูกต้อง', en: 'That time isn’t valid' },
  need_points: { th: 'เลือกอย่างน้อย 1 จุด', en: 'Pick at least one point' },
  need_days: { th: 'เลือกอย่างน้อย 1 วัน', en: 'Pick at least one day' },
  bad_items: { th: 'รายการไม่ถูกต้อง (สูงสุด 20 รายการ ชื่อห้ามว่าง)', en: 'Check the items (max 20, each needs a label)' },
  in_use: { th: 'จุดนี้มีประวัติการสแกนแล้ว ลบไม่ได้ — ปิดใช้งานแทน', en: 'This point has scans — switch it off instead' },
  not_admin: { th: 'เฉพาะแอดมินเท่านั้น', en: 'Admins only' },
  failed: { th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save — try again' },
}

// Rounds as they count today: switched-off points left out (they can't be
// scanned, so they must not keep a round from being done).
export function withLivePoints(rounds: CheckRound[], points: Pick<CheckPoint, 'id' | 'active'>[]): CheckRound[] {
  const live = new Set(points.filter((p) => p.active).map((p) => p.id))
  return rounds.map((r) => ({ ...r, pointIds: r.pointIds.filter((id) => live.has(id)) })).filter((r) => r.pointIds.length > 0)
}
