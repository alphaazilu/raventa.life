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
  // v0.44.1: without it, the areas marked tabletUnless in ROUTE_RULES open only
  // on a registered counter tablet (what staff have always had).
  { key: 'console.anywhere', area: 'system', label: { th: 'ใช้ Back Office นอก tablet เคาน์เตอร์', en: 'Use the Back Office away from the counter tablet' } },
]

export const ALL_PERMISSIONS: string[] = [...AREA_KEYS.map((k) => `access:${k}`), ...ACTIONS.map((a) => `action:${a.key}`)]

export type SystemRole = 'admin' | 'staff' | 'accountant'

/**
 * The built-in roles = exactly what profiles.role allows today. The seed in
 * schema.sql §55 holds the same lists — keep the two in step.
 *   staff: the front desk (on their phone too when an admin allows it); on a
 *     registered counter tablet also cash, bookings, the member list (view
 *     only), the time page and the calendar — "tablet only" is ROUTE_RULES'
 *     tabletUnless: 'action:console.anywhere', which staff don't hold. May void
 *     within 30 minutes (the limit is in pos_void_sale) and work the drawer.
 *   accountant: the sales report and its export.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, string[]> = {
  admin: ALL_PERMISSIONS,
  // v0.44.1: + cash, bookings, calendar — staff have always opened these on the
  // counter tablet (where the middleware leaves the decision to the page);
  // phase 1 missed them. The seed in schema.sql §55 gets them with the next
  // SQL change; until then this list is the floor can() always adds.
  staff: [
    'access:storefront.desk',
    'access:storefront.cash',
    'access:storefront.bookings',
    'access:storefront.members',
    'access:team.time',
    'access:team.calendar',
    'action:bill.void',
    'action:cash.close',
  ],
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

// ---- phase 2 (v0.44.1): deciding access with the keys ------------------------

/**
 * Can this person see an area at all — i.e. open its page / see it in the
 * menu? True when the area is held (directly or from an ancestor) OR any area
 * beneath it is: an accountant holding only 'access:reports.sales' still sees
 * the "Reports" module.
 */
export function canSeeArea(perms: ReadonlySet<string>, area: string): boolean {
  if (holds(perms, `access:${area}`)) return true
  const prefix = `access:${area}.`
  for (const k of perms) if (k.startsWith(prefix)) return true
  return false
}

/** Anything in the Back Office at all (the console shell lets them in). */
export function canSeeConsole(perms: ReadonlySet<string>): boolean {
  for (const k of perms) if (k.startsWith('access:')) return true
  return false
}

/**
 * Permissions straight from profiles.role, no database: the system role's
 * list. Used where a request can't wait for a query (the middleware) — the
 * same answer as can() until anyone holds extra roles in staff_roles (the
 * role-management screen, phase 3; revisit then).
 */
export function rolePermissions(role: string | null | undefined): Set<string> {
  const s = systemRoleOf(role)
  return expandPermissions(s ? SYSTEM_ROLE_PERMISSIONS[s] : [])
}

/**
 * The rule for each Back Office path (one source for the middleware and the
 * pages). Longest prefix wins. `see` = canSeeArea (the page shows several
 * sub-areas); `need` = every key must be held; `tabletUnless` = without this
 * key, only on a registered counter tablet (a device condition, kept from
 * before RBAC — staff see the member list / time page at the counter only).
 */
export type RouteRule = { path: string; exact?: boolean; see?: string; need?: string[]; tabletUnless?: string }

const ANYWHERE = 'action:console.anywhere'

export const ROUTE_RULES: RouteRule[] = [
  { path: '/console', exact: true, need: ['access:overview'] },
  { path: '/console/desk', need: ['access:storefront.desk'] },
  { path: '/console/cash', need: ['access:storefront.cash'], tabletUnless: ANYWHERE },
  { path: '/console/bookings', need: ['access:storefront.bookings'], tabletUnless: ANYWHERE },
  // The list (view only for staff, on the tablet); one member's page is the full record.
  { path: '/console/members', exact: true, need: ['access:storefront.members'], tabletUnless: ANYWHERE },
  { path: '/console/members', need: ['access:storefront.members', 'action:pii.view'] },
  { path: '/console/feedback', need: ['access:storefront.feedback'] },
  { path: '/console/leads', need: ['access:storefront.leads'] },
  { path: '/console/time', need: ['access:team.time'], tabletUnless: ANYWHERE },
  { path: '/console/calendar', need: ['access:team.calendar'], tabletUnless: ANYWHERE },
  { path: '/console/team', need: ['access:team.roles'] },
  { path: '/console/checklist', need: ['access:operations.checklist'] },
  { path: '/console/catalog', see: 'catalog' },
  { path: '/console/reports', see: 'reports' },
  { path: '/console/settings/brand', need: ['access:system.brand'] },
  { path: '/console/settings', need: ['access:system.settings'] },
  { path: '/console/branches', need: ['access:system.branches'] },
  { path: '/console/devices', need: ['access:system.devices'] },
  { path: '/console/audit', need: ['access:system.audit'] },
]
/** A console path with no rule of its own: admins only, as before. */
const FALLBACK_RULE: RouteRule = { path: '/console', need: ['access:system'] }

export function ruleFor(path: string): RouteRule {
  let best: RouteRule | null = null
  for (const r of ROUTE_RULES) {
    const hit = r.exact ? path === r.path : path === r.path || path.startsWith(`${r.path}/`)
    if (hit && (!best || r.path.length > best.path.length || (r.exact && r.path.length === best.path.length))) best = r
  }
  return best ?? FALLBACK_RULE
}

/** May this person open `path`? (`onTablet` = a registered counter tablet's cookie.) */
export function mayOpen(perms: ReadonlySet<string>, path: string, onTablet: boolean): boolean {
  const r = ruleFor(path)
  if (r.see && !canSeeArea(perms, r.see)) return false
  if (r.need && !r.need.every((k) => holds(perms, k))) return false
  if (r.tabletUnless && !onTablet && !holds(perms, r.tabletUnless)) return false
  return true
}

/** Where someone lands when turned away: the desk, else Reports, else their account. */
export function consoleHomeFor(perms: ReadonlySet<string>): string {
  if (holds(perms, 'access:storefront.desk')) return '/console/desk'
  if (canSeeArea(perms, 'reports')) return '/console/reports'
  return '/account'
}

/** The keys as stored: known keys only, and none whose ancestor is also there. */
export function minimalKeys(keys: Iterable<string>): string[] {
  const known = new Set(ALL_PERMISSIONS)
  const set = new Set([...keys].filter((k) => known.has(k)))
  return [...set].filter((k) => !withAncestors(k).slice(1).some((a) => set.has(a))).sort()
}
