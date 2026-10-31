import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { canSeeArea as seeArea, expandPermissions, holds, mayOpen as openPath, SYSTEM_ROLE_PERMISSIONS, systemRoleOf } from '@/lib/auth/permission-catalog'

// RBAC: can(userId, perm). SERVER ONLY (service role). Phase 1 (v0.44.0)
// added it; phase 2 (v0.44.1) decides Back Office access with it — the
// console layout, the pages, the menu and the export routes. (The middleware
// uses rolePermissions(profiles.role) — no query per request.)
//
// A person's roles = their rows in staff_roles ∪ the system role named by
// their profiles.role. That fallback means everyone keeps exactly today's
// access without being added to staff_roles first.
// TODO(RBAC final phase): remove the profiles.role fallback once everyone has
// been moved into staff_roles.
//
// Before schema.sql §55 has been run the tables don't exist: the system
// role's permissions then come from SYSTEM_ROLE_PERMISSIONS (the same lists
// as the seed), so the answer is the same either way. That list is also a
// floor, always added: a seed row missing from the database can't take away
// what profiles.role gives.

export { ACTIONS, AREAS, ALL_PERMISSIONS } from '@/lib/auth/permission-catalog'

/** Every permission this person holds (inherited children included). Cached per request. */
export const effectivePermissions = cache(async (userId: string): Promise<Set<string>> => {
  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', userId).maybeSingle()
  const fallback = systemRoleOf(profile?.role as string | null)
  const floor = fallback ? SYSTEM_ROLE_PERMISSIONS[fallback] : []

  const { data: mine, error } = await db.from('staff_roles').select('role_id').eq('user_id', userId)
  if (error) {
    if (!isMissingTable(error)) console.error('staff_roles read failed', error.message)
    // §55 not run yet (or unreadable): today's role, from the code.
    return expandPermissions(floor)
  }

  const custom = (mine ?? []).map((r) => r.role_id as string)
  // ยังไม่มี role ที่มอบเพิ่ม (ทุกคน จนกว่าจะมี UI เฟส 3): floor = สิทธิ์ของ system role อยู่แล้ว ข้าม round-trip ที่เหลือ
  if (custom.length === 0) return expandPermissions(floor)

  const roleIds = new Set(custom)
  if (fallback) {
    const { data: sys } = await db.from('roles').select('id').eq('key', fallback).eq('is_system', true).maybeSingle()
    if (sys) roleIds.add(sys.id as string)
  }
  if (roleIds.size === 0) return expandPermissions(floor)

  const { data: perms, error: pErr } = await db.from('role_permissions').select('perm_key').in('role_id', [...roleIds])
  if (pErr) {
    console.error('role_permissions read failed', pErr.message)
    return expandPermissions(floor)
  }
  return expandPermissions([...floor, ...(perms ?? []).map((p) => p.perm_key as string)])
})

/** Does this person hold `perm` ('access:reports.sales', 'action:bill.void', …)? */
export async function can(userId: string, perm: string): Promise<boolean> {
  return holds(await effectivePermissions(userId), perm)
}

/** Can this person see an area (it, or anything beneath it)? */
export async function canSeeArea(userId: string, area: string): Promise<boolean> {
  return seeArea(await effectivePermissions(userId), area)
}

/** May this person open a Back Office path (ROUTE_RULES)? */
export async function mayOpen(userId: string, path: string, onTablet: boolean): Promise<boolean> {
  return openPath(await effectivePermissions(userId), path, onTablet)
}
