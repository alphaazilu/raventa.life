import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { expandPermissions, holds, SYSTEM_ROLE_PERMISSIONS, systemRoleOf } from '@/lib/auth/permission-catalog'

// RBAC (phase 1, v0.44.0): can(userId, perm). SERVER ONLY (service role).
//
// ADDITIVE: nothing calls this to decide access yet — profiles.role and
// lib/auth/roles.ts still do. Phase 2 moves the gates onto can().
//
// A person's roles = their rows in staff_roles ∪ the system role named by
// their profiles.role. That fallback means everyone keeps exactly today's
// access without being added to staff_roles first.
// TODO(RBAC final phase): remove the profiles.role fallback once everyone has
// been moved into staff_roles.
//
// Before schema.sql §55 has been run the tables don't exist: the system
// role's permissions then come from SYSTEM_ROLE_PERMISSIONS (the same lists
// as the seed), so the answer is the same either way.

export { ACTIONS, AREAS, ALL_PERMISSIONS } from '@/lib/auth/permission-catalog'

/** Every permission this person holds (inherited children included). Cached per request. */
export const effectivePermissions = cache(async (userId: string): Promise<Set<string>> => {
  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', userId).maybeSingle()
  const fallback = systemRoleOf(profile?.role as string | null)

  const { data: mine, error } = await db.from('staff_roles').select('role_id').eq('user_id', userId)
  if (error) {
    if (!isMissingTable(error)) console.error('staff_roles read failed', error.message)
    // §55 not run yet (or unreadable): today's role, from the code.
    return expandPermissions(fallback ? SYSTEM_ROLE_PERMISSIONS[fallback] : [])
  }

  const roleIds = new Set((mine ?? []).map((r) => r.role_id as string))
  if (fallback) {
    const { data: sys } = await db.from('roles').select('id').eq('key', fallback).eq('is_system', true).maybeSingle()
    if (sys) roleIds.add(sys.id as string)
  }
  if (roleIds.size === 0) return new Set()

  const { data: perms, error: pErr } = await db.from('role_permissions').select('perm_key').in('role_id', [...roleIds])
  if (pErr) {
    console.error('role_permissions read failed', pErr.message)
    return expandPermissions(fallback ? SYSTEM_ROLE_PERMISSIONS[fallback] : [])
  }
  return expandPermissions((perms ?? []).map((p) => p.perm_key as string))
})

/** Does this person hold `perm` ('access:reports.sales', 'action:bill.void', …)? */
export async function can(userId: string, perm: string): Promise<boolean> {
  return holds(await effectivePermissions(userId), perm)
}
