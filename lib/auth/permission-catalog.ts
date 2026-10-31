// RBAC (phase 1, v0.44.0): what a permission can be, and how a set of them is
// checked. Client-safe (no I/O) — the server side is lib/auth/permissions.ts.
//
// ADDITIVE: nothing decides access with these yet. Access is still
// profiles.role through lib/auth/roles.ts and the three gates (middleware →
// console layout → page). Phase 2 switches the gates over.
//
// Two kinds of key (also the check in schema.sql §55):
//   access:<area>    an area of the Back Office — Module → Menu → Report,
//                    mirroring the side menu (components/console/console-shell.tsx).
//                    Holding a parent grants its children ('access:reports'
//                    ⇒ 'access:reports.sales').
//   action:<action>  something sensitive done inside an area (void a bill…).

type L = { th: string; en: string }
export type Area = { key: string; label: L; children?: Area[] }

/** The Back Office areas, in menu order. Keys are fixed — the database stores them. */
export const AREAS: Area[] = [
  { key: 'overview', label: { th: 'ภาพรวม', en: 'Overview' } },
  {
    key: 'storefront',
    label: { th: 'หน้าร้าน', en: 'Front desk' },
    children: [
      { key: 'storefront.desk', label: { th: 'ขาย + เช็คอิน', en: 'Sell + check-in' } },
      { key: 'storefront.cash', label: { th: 'เงินสด', en: 'Cash' } },
      { key: 'storefront.bookings', label: { th: 'การจอง', en: 'Bookings' } },
      { key: 'storefront.members', label: { th: 'ลูกค้า', en: 'Members' } },
      { key: 'storefront.feedback', label: { th: 'ความเห็นลูกค้า', en: 'Feedback' } },
      { key: 'storefront.leads', label: { th: 'ผู้สนใจจาก Quiz', en: 'Quiz leads' } },
    ],
  },
  {
    key: 'team',
    label: { th: 'ทีมงาน', en: 'Team' },
    children: [
      { key: 'team.time', label: { th: 'ลงเวลาและกะ', en: 'Time & shifts' } },
      { key: 'team.calendar', label: { th: 'ปฏิทิน', en: 'Calendar' } },
      { key: 'team.roles', label: { th: 'ทีมงานและสิทธิ์', en: 'Team & roles' } },
    ],
  },
  {
    key: 'operations',
    label: { th: 'ดูแลร้าน', en: 'Operations' },
    children: [
      { key: 'operations.checklist', label: { th: 'เช็คลิสต์', en: 'Checklists' } },
      { key: 'operations.maintenance', label: { th: 'ซ่อมบำรุง', en: 'Maintenance' } },
    ],
  },
  {
    key: 'catalog',
    label: { th: 'สินค้าและราคา', en: 'Products & prices' },
    children: [
      { key: 'catalog.products', label: { th: 'สินค้า', en: 'Products' } },
      { key: 'catalog.holidays', label: { th: 'วันหยุด', en: 'Holidays' } },
      { key: 'catalog.promotions', label: { th: 'โปรโมชั่น', en: 'Promotions' } },
      { key: 'catalog.commission', label: { th: 'ค่าคอม', en: 'Commission' } },
    ],
  },
  {
    key: 'reports',
    label: { th: 'รายงาน', en: 'Reports' },
    children: [
      { key: 'reports.sales', label: { th: 'การขาย', en: 'Sales' } },
      { key: 'reports.hours', label: { th: 'เวลาทำงาน', en: 'Hours worked' } },
      { key: 'reports.commission', label: { th: 'ค่าคอม', en: 'Commission' } },
    ],
  },
  {
    key: 'system',
    label: { th: 'ระบบ', en: 'System' },
    children: [
      { key: 'system.settings', label: { th: 'ตั้งค่า', en: 'Settings' } },
      { key: 'system.brand', label: { th: 'ตั้งค่าแบรนด์', en: 'Brand' } },
      { key: 'system.branches', label: { th: 'สาขา', en: 'Branches' } },
      { key: 'system.devices', label: { th: 'อุปกรณ์', en: 'Devices' } },
      { key: 'system.audit', label: { th: 'บันทึกการกระทำ', en: 'Audit log' } },
    ],
  },
]

const flat = (list: Area[]): Area[] => list.flatMap((a) => [a, ...flat(a.children ?? [])])
export const AREA_KEYS: string[] = flat(AREAS).map((a) => a.key)

/** Sensitive actions, each tied to the area it happens in. */
export const ACTIONS: { key: string; area: string; label: L }[] = [
  { key: 'bill.void', area: 'storefront', label: { th: 'ยกเลิกบิล', en: 'Void a bill' } },
  { key: 'bill.refund', area: 'storefront', label: { th: 'คืนเงิน', en: 'Refund' } },
  { key: 'discount.override', area: 'storefront', label: { th: 'ให้ส่วนลดนอกเงื่อนไข', en: 'Override a discount' } },
  { key: 'cash.close', area: 'storefront', label: { th: 'เปิด/นับ/ปิดลิ้นชัก', en: 'Open / count / close the drawer' } },
  { key: 'cash.review', area: 'storefront', label: { th: 'รีวิวเงินขาด/เกิน', en: 'Review a cash difference' } },
  { key: 'pii.view', area: 'storefront', label: { th: 'ดูข้อมูลส่วนตัวลูกค้าเต็ม', en: 'See members’ full personal data' } },
  { key: 'time.edit', area: 'team', label: { th: 'แก้เวลาเข้า-ออก', en: 'Edit clock times' } },
  { key: 'export.data', area: 'reports', label: { th: 'ส่งออกข้อมูล', en: 'Export data' } },
  { key: 'roles.manage', area: 'system', label: { th: 'จัดการสิทธิ์', en: 'Manage roles' } },
]

export const ALL_PERMISSIONS: string[] = [...AREA_KEYS.map((k) => `access:${k}`), ...ACTIONS.map((a) => `action:${a.key}`)]

export type SystemRole = 'admin' | 'staff' | 'accountant'

/**
 * The built-in roles = exactly what profiles.role allows today. The seed in
 * schema.sql §55 holds the same lists — keep the two in step.
 *   staff: the front desk; on a registered tablet also the member list (view
 *     only) and the time page (the tablet / setting conditions are checked
 *     separately, as now). May void within 30 minutes (the limit is in
 *     pos_void_sale) and work the drawer.
 *   accountant: the sales report and its export.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, string[]> = {
  admin: ALL_PERMISSIONS,
  staff: ['access:storefront.desk', 'access:storefront.members', 'access:team.time', 'action:bill.void', 'action:cash.close'],
  accountant: ['access:reports.sales', 'action:export.data'],
}

/** profiles.role → the system role it stands for (customers have none). */
export function systemRoleOf(role: string | null | undefined): SystemRole | null {
  return role === 'admin' || role === 'staff' || role === 'accountant' ? role : null
}

/** 'access:reports.sales' → ['access:reports.sales', 'access:reports']. */
export function withAncestors(perm: string): string[] {
  const i = perm.indexOf(':')
  if (i < 0) return [perm]
  const kind = perm.slice(0, i)
  const parts = perm.slice(i + 1).split('.')
  return parts.map((_, n) => `${kind}:${parts.slice(0, parts.length - n).join('.')}`)
}

/** Is `perm` held, directly or through an ancestor? */
export function holds(perms: ReadonlySet<string>, perm: string): boolean {
  return withAncestors(perm).some((k) => perms.has(k))
}

/** Union of the roles' keys, expanded so every inherited child is listed too. */
export function expandPermissions(keys: Iterable<string>): Set<string> {
  const held = new Set(keys)
  return new Set([...held, ...ALL_PERMISSIONS.filter((k) => holds(held, k))])
}
