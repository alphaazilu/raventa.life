import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { SYSTEM_ROLE_PERMISSIONS, systemRoleOf } from '@/lib/auth/permission-catalog'

// Roles and who holds them (RBAC phase 3a, v0.44.4; schema.sql §55). SERVER
// ONLY (service role) — the pages and actions check access first.

export type RoleRow = {
  id: string
  key: string
  nameTh: string
  nameEn: string
  isSystem: boolean
  /** The keys stored for the role (as ticked — children of a ticked parent aren't repeated). */
  perms: string[]
  /** A system role's built-in keys (lib/auth/permission-catalog.ts) — always in effect (the floor). System roles are read-only. */
  base: string[]
  /** People holding it through staff_roles (not counting profiles.role). */
  holders: number
}

/** All roles, system first. null = §55 not run yet. */
export async function listRoles(): Promise<RoleRow[] | null> {
  const db = createAdminClient()
  const { data: roles, error } = await db.from('roles').select('id, key, name_th, name_en, is_system, created_at').order('created_at')
  if (error) {
    if (!isMissingTable(error)) console.error('roles read failed', error.message)
    return null
  }
  const [{ data: perms }, { data: held }] = await Promise.all([
    db.from('role_permissions').select('role_id, perm_key'),
    db.from('staff_roles').select('role_id'),
  ])
  const permsOf = new Map<string, string[]>()
  for (const p of perms ?? []) permsOf.set(p.role_id as string, [...(permsOf.get(p.role_id as string) ?? []), p.perm_key as string])
  const count = new Map<string, number>()
  for (const h of held ?? []) count.set(h.role_id as string, (count.get(h.role_id as string) ?? 0) + 1)
  return (roles ?? [])
    .map((r) => {
      const sys = r.is_system ? systemRoleOf(r.key as string) : null
      return {
        id: r.id as string,
        key: r.key as string,
        nameTh: r.name_th as string,
        nameEn: r.name_en as string,
        isSystem: Boolean(r.is_system),
        perms: (permsOf.get(r.id as string) ?? []).sort(),
        base: sys ? SYSTEM_ROLE_PERMISSIONS[sys] : [],
        holders: count.get(r.id as string) ?? 0,
      }
    })
    .sort((a, b) => Number(b.isSystem) - Number(a.isSystem))
}

/** Roles given through staff_roles, per person. null = not set up. */
export async function assignedRoles(userIds?: string[]): Promise<Map<string, string[]> | null> {
  let q = createAdminClient().from('staff_roles').select('user_id, role_id')
  if (userIds) {
    if (userIds.length === 0) return new Map()
    q = q.in('user_id', userIds)
  }
  const { data, error } = await q
  if (error) {
    if (!isMissingTable(error)) console.error('staff_roles read failed', error.message)
    return null
  }
  const out = new Map<string, string[]>()
  for (const r of data ?? []) out.set(r.user_id as string, [...(out.get(r.user_id as string) ?? []), r.role_id as string])
  return out
}
