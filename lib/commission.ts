// Staff commission (§33, v0.34) — shared by the server and the screens.

export type CommissionMode = 'pct' | 'thb'
export const COMMISSION_KINDS = ['day_pass', 'package', 'addon', 'merch', 'souvenir'] as const
export type CommissionKind = (typeof COMMISSION_KINDS)[number]

export type CommissionRule = { id: string; productId: string | null; kind: CommissionKind | null; mode: CommissionMode; value: number }

// Who can earn, for the desk: names only.
export type CommissionPerson = { id: string; name: string }

// What the counter needs (null = §33 not run, or nobody earns yet).
export type DeskCommission = {
  ready: boolean // someone earns and a rate is set
  staff: CommissionPerson[] // who can be picked (not the person selling)
  productIds: string[] // products with their own rate
  kinds: string[] // kinds with a default rate
  dayPassId: string | null
  me: string // the person selling
} | null

// The key a bill line is known by between the desk and the server.
export const lineKey = (kind: string, productId: string, variantId: string | null) => (kind === 'day_pass' ? 'day_pass' : `${productId}:${variantId ?? ''}`)

export function hasRule(c: NonNullable<DeskCommission>, kind: string, productId: string | null): boolean {
  return (productId !== null && c.productIds.includes(productId)) || c.kinds.includes(kind)
}

// The bill discount shared out over the lines by their size (whole baht,
// largest remainders first), so the shares add up to the discount exactly.
export function shareDiscount(totals: number[], discount: number): number[] {
  const sum = totals.reduce((a, b) => a + Math.max(0, b), 0)
  if (discount <= 0 || sum <= 0) return totals.map(() => 0)
  const d = Math.min(discount, sum)
  const raw = totals.map((t) => (Math.max(0, t) * d) / sum)
  const out = raw.map(Math.floor)
  let left = d - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    out[i] += 1
    left -= 1
  }
  return out
}

// One line's commission: a percentage of the line after discount, or baht
// per unit (never more than the line itself).
export function lineAmount(base: number, qty: number, mode: CommissionMode, value: number): number {
  if (base <= 0) return 0
  const raw = mode === 'pct' ? (base * value) / 100 : value * qty
  return Math.round(Math.min(raw, base) * 100) / 100
}

export const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })

export const rateLabel = (mode: CommissionMode, value: number, perUnit: string) => (mode === 'pct' ? `${money(value)}%` : `${money(value)} ฿${perUnit}`)

const L = (th: string, en: string) => ({ th, en })

export const cmCopy = {
  // desk
  referrer: L('ผู้แนะนำ', 'Referrer'),
  addReferrer: L('สแกนผู้แนะนำ', 'Scan referrer'),
  removeReferrer: L('เอาผู้แนะนำออก', 'Remove referrer'),
  scanReferrer: L('สแกน QR บัตรสมาชิกของพนักงานที่แนะนำ', 'Scan the referring staff member’s card QR'),
  cancelScan: L('ยกเลิกการสแกน', 'Cancel scan'),
  referrerSet: L('ตั้งผู้แนะนำ: {name}', 'Referrer: {name}'),
  staffScanned: L('นี่คือพนักงาน', 'This is a team member'),
  staffScannedSub: L('{name} รับค่าคอมได้ — จะใช้ทำอะไร', '{name} earns commission — what is this scan for?'),
  asReferrer: L('ตั้งเป็นผู้แนะนำบิลนี้', 'Referrer for this bill'),
  asCustomer: L('เปิดเป็นลูกค้า', 'Serve as a customer'),
  earner: L('ค่าคอม', 'Commission'),
  earnerDefault: L('อัตโนมัติ', 'Automatic'),
  earnerNone: L('ไม่มีคนรับ', 'Nobody'),
  earnerAuto: L('ผู้แนะนำ ถ้าเป็นบิลแรก', 'referrer, if first bill'),
  // admin (Products › Commission)
  tab: L('ค่าคอมมิชชั่น', 'Commission'),
  notSetUp: L('ยังไม่ได้ตั้งค่าคอมมิชชั่น — แอดมินรัน schema.sql ส่วน §33 ก่อน', 'Commission isn’t set up — an admin needs to run schema.sql §33'),
  who: L('ใครรับค่าคอมได้', 'Who earns commission'),
  whoHint: L('เปิดรายคน · คนที่ปิดอยู่จะไม่ได้ค่าคอม (ทั้งค่าแนะนำสมาชิกและรายการที่เลือก)', 'Turn on per person · people who are off earn nothing (referrals or picked lines)'),
  noStaff: L('ยังไม่มีพนักงาน — เพิ่มที่หน้าทีมงาน', 'No team members yet — add them on the Team page'),
  rates: L('อัตราค่าคอม', 'Rates'),
  ratesHint: L('ตั้งรายสินค้า หรือค่าเริ่มต้นของแต่ละประเภท · รายสินค้ามาก่อน · คิดจากยอดหลังส่วนลด', 'Per product, or a default per kind · a product’s own rate wins · worked out after discounts'),
  kindDefaults: L('ค่าเริ่มต้นตามประเภท', 'Defaults by kind'),
  perProduct: L('รายสินค้า / บริการ', 'Per product or service'),
  none: L('ไม่มี', 'None'),
  useKind: L('ตามประเภท', 'Kind default'),
  pct: L('% ของยอด', '% of the line'),
  thb: L('บาท / ชิ้น', 'Baht each'),
  perUnit: L('/ชิ้น', ' each'),
  save: L('บันทึก', 'Save'),
  saved: L('บันทึกแล้ว', 'Saved'),
  remove: L('ลบอัตรา', 'Remove rate'),
  howItWorks: L(
    'ค่าแนะนำสมาชิก: ลูกค้าใส่รหัส/สแกน QR แนะนำของพนักงานตอนสมัคร (ไม่ใส่ = ผู้แนะนำเริ่มต้นด้านล่าง) · ผู้แนะนำได้ค่าคอมครั้งเดียว จากบิลแรกที่มียอดจากสินค้าที่ตั้งอัตราไว้ (บิลที่ไม่มี เช่น ใช้แพ็กเกจ ไม่นับ · บิลถูกยกเลิก → นับบิลถัดไป) · ผู้แนะนำไม่ได้เปิดรับคอม → ไปที่ผู้แนะนำเริ่มต้น · รายการที่หน้าขายเลือกคนรับไว้ เป็นของคนนั้น · คนกดขายไม่ได้คอมรายบิล · ยอดคิดตอนจ่ายเงินและเก็บไว้ · บิลที่ยกเลิกไม่นับ',
    'Member referrals: a new member types or scans a team member’s referral code when signing up (none = the default referrer below) · the referrer earns once, on the member’s first bill with an amount on items that have a rate (bills without — e.g. on a package — don’t count · voided → the next one counts) · referrer not earning → the default referrer · lines picked for someone at the counter are theirs · the person ringing up doesn’t earn per bill · worked out and kept when paid · voided bills don’t count',
  ),
  on: L('รับคอม', 'Earns'),
  off: L('ไม่รับ', 'Off'),
  // report
  report: L('ค่าคอม', 'Commission'),
  title: L('รายงานค่าคอมมิชชั่น', 'Commission report'),
  colName: L('ชื่อ', 'Name'),
  colBills: L('บิล', 'Bills'),
  colItems: L('รายการ', 'Lines'),
  colBase: L('ยอดขาย (หลังส่วนลด)', 'Sales (after discount)'),
  colAmount: L('ค่าคอม', 'Commission'),
  colDate: L('วันที่', 'Date'),
  colReceipt: L('ใบเสร็จ', 'Receipt'),
  colLine: L('รายการ', 'Item'),
  colRate: L('อัตรา', 'Rate'),
  colHow: L('ได้จาก', 'From'),
  src_cashier: L('ขายเอง (ก่อน v0.34.1)', 'Sold (before v0.34.1)'),
  src_referrer: L('แนะนำ (สแกนที่หน้าขาย ก่อน v0.36)', 'Referred (desk scan, before v0.36)'),
  src_line: L('เลือกที่รายการ', 'Picked'),
  src_signup: L('แนะนำสมาชิก (บิลแรก)', 'Member referral (first bill)'),
  // member referrals (v0.36)
  defaultRef: L('ผู้แนะนำเริ่มต้น', 'Default referrer'),
  defaultRefHint: L('ลูกค้าที่สมัครโดยไม่ใส่รหัสผู้แนะนำ จะนับเป็นของคนนี้', 'Members who sign up without a referral code count as this person’s'),
  defaultRefNone: L('ไม่มี (ไม่มีค่าคอม)', 'None (no commission)'),
  codes: L('รหัสแนะนำของพนักงาน', 'Team referral codes'),
  codesHint: L('พนักงานเห็นรหัสและ QR ของตัวเองที่ บัญชีของฉัน', 'Each team member sees their own code and QR in My account'),
  myRef: L('QR แนะนำสมาชิก', 'My referral QR'),
  myRefSub: L('ให้ลูกค้าสแกนเพื่อสมัครสมาชิก — ได้ค่าคอมเมื่อมาใช้บริการครั้งแรก', 'Have a new guest scan it to sign up — you earn on their first visit'),
  myRefCode: L('รหัส', 'Code'),
  myRefOff: L('ตอนนี้ยังไม่ได้เปิดรับค่าคอม — ค่าแนะนำจะไปที่ผู้แนะนำเริ่มต้นแทน (แอดมินเปิดได้ที่ ค่าคอมมิชชั่น)', 'You don’t earn commission yet — referrals go to the default referrer instead (an admin turns it on under Commission)'),
  copyLink: L('คัดลอกลิงก์', 'Copy link'),
  copied: L('คัดลอกแล้ว', 'Copied'),
  referredBy: L('แนะนำโดย', 'Referred by'),
  referredNone: L('ไม่ใส่รหัส — ใช้ผู้แนะนำเริ่มต้น', 'No code — the default referrer'),
  via_code: L('ใส่รหัสตอนสมัคร', 'code at sign-up'),
  via_qr: L('สแกน QR ตอนสมัคร', 'QR at sign-up'),
  via_admin: L('แอดมินตั้ง', 'set by an admin'),
  via_default: L('ผู้แนะนำเริ่มต้น', 'default referrer'),
  refPaid: L('ได้ค่าคอมแล้ว (บิลแรก)', 'Paid on the first bill'),
  refLocked: L('จ่ายค่าแนะนำไปแล้ว — เปลี่ยนผู้แนะนำไม่ได้', 'The referral was paid — it can’t change'),
  refOld: L('สมัครและใช้บริการก่อนมีระบบแนะนำ (v0.36)', 'Joined and visited before referrals (v0.36)'),
  refWaiting: L('รอบิลแรกที่มียอดจากสินค้าที่ตั้งอัตราไว้', 'Waiting for the first bill with items that have a rate'),
  refChange: L('เปลี่ยนผู้แนะนำ', 'Change referrer'),
  total: L('รวม', 'Total'),
  empty: L('ไม่มีค่าคอมในช่วงนี้', 'No commission in this period'),
  csv: L('Export CSV', 'Export CSV'),
  // my account
  mine: L('ค่าคอมของฉัน', 'My commission'),
  mineSub: L('รอบนี้ {p} · {n} รายการ', 'This period {p} · {n} lines'),
  mineLast: L('รอบที่แล้ว {a} ฿', 'Last period {a} ฿'),
  mineNote: L('ยอดประมาณการ — ยอดจริงตามที่แอดมินสรุปจ่าย', 'An estimate — the amount paid is what the admin settles'),
}

export const cmErrors: Record<string, { th: string; en: string }> = {
  not_set_up: cmCopy.notSetUp,
  not_admin: L('เฉพาะแอดมิน', 'Admins only'),
  bad_rate: L('ตรวจอัตราอีกครั้ง (มากกว่า 0 · เปอร์เซ็นต์ไม่เกิน 100)', 'Check the rate (above 0 · a percentage up to 100)'),
  not_staff_member: L('คนนี้ไม่ใช่พนักงาน', 'This person isn’t on the team'),
  not_earner: L('คนนี้ยังไม่ได้เปิดรับค่าคอม (สินค้าและราคา › ค่าคอมมิชชั่น)', 'This person doesn’t earn commission yet (Products › Commission)'),
  self_referrer: L('ตั้งตัวเองเป็นผู้แนะนำไม่ได้ — ให้คนอื่นกดขาย หรือให้แอดมินเลือกคนรับ', 'You can’t be the referrer on a bill you sell — let someone else ring it up'),
  not_ready: L('ยังไม่ได้ตั้งค่าคอม — แอดมินเปิดคนรับคอมและตั้งอัตราที่ สินค้าและราคา › ค่าคอมมิชชั่น', 'Commission isn’t set up — an admin turns people on and sets rates in Products › Commission'),
  qr_invalid: L('อ่าน QR ไม่ได้ — ใช้ QR บัตรสมาชิก', 'Couldn’t read that QR — use the member card QR'),
  qr_expired: L('QR หมดอายุ — ให้เปิดบัตรใหม่', 'That QR has expired — open the card again'),
  failed: L('ทำไม่สำเร็จ ลองใหม่อีกครั้ง', 'Something went wrong — try again'),
  ref_locked: L('จ่ายค่าแนะนำไปแล้ว — เปลี่ยนผู้แนะนำไม่ได้', 'The referral was paid — it can’t change'),
  not_ref_set_up: L('ยังไม่ได้รัน schema.sql §36 (ผู้แนะนำสมาชิก)', 'Run schema.sql §36 (member referrals) first'),
}
