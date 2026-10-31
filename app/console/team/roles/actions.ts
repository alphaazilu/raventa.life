'use server'

import { revalidatePath } from 'next/cache'
import { requirePermissions } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { TEAM_PATH } from '@/lib/auth/roles'
import { minimalKeys } from '@/lib/auth/permission-catalog'
import { listRoles } from '@/lib/console/roles'

// Roles (RBAC phase 3a, v0.44.4): create / change / delete roles, and give
// people extra roles (staff_roles). Only someone who can manage roles
// (action:roles.manage — admins); written with the service role (no one
// writes these tables with their own session, §55) and logged in
// staff_actions.
//
// System roles (admin / staff / accountant) can't be deleted or renamed;
// their built-in keys (SYSTEM_ROLE_PERMISSIONS) always stay — keys can only
// be added. The admin role holds everything already and is locked.

export type RolesResult = { ok: true; id?: string } | { ok: false; error: string }

const ROLES_PATH = `${TEAM_PATH}/roles`
const UUID = /^[0-9a-f-]{36}$/i
const guard = () => requirePermissions('access:team.roles', 'action:roles.manage')
const name = (v: unknown) => String(v ?? '').trim().slice(0, 80)

const log = (actor: string, action: string, detail: Record<string, unknown>, member?: string) =>
  createAdminClient().from('staff_actions').insert({ actor_id: actor, member_id: member ?? null, action, detail })

export async function createRole(nameTh: string, nameEn: string): Promise<RolesResult> {
  const ctx = await guard()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const th = name(nameTh)
  const en = name(nameEn) || th
  if (!th) return { ok: false, error: 'bad_name' }
  const key = `custom_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
  const { data, error } = await createAdminClient().from('roles').insert({ key, name_th: th, name_en: en, is_system: false }).select('id').single()
  if (error || !data) return { ok: false, error: 'failed' }
  await log(ctx.userId, 'role_create', { name: th })
  revalidatePath(ROLES_PATH)
  return { ok: true, id: data.id as string }
}

export async function updateRole(id: string, input: { nameTh: string; nameEn: string; perms: string[] }): Promise<RolesResult> {
  const ctx = await guard()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'failed' }
  const role = (await listRoles())?.find((r) => r.id === id)
  if (!role) return { ok: false, error: 'not_found' }
  if (role.key === 'admin') return { ok: false, error: 'locked' }

  const db = createAdminClient()
  if (!role.isSystem) {
    const th = name(input.nameTh)
    if (!th) return { ok: false, error: 'bad_name' }
    const { error } = await db.from('roles').update({ name_th: th, name_en: name(input.nameEn) || th }).eq('id', id)
    if (error) return { ok: false, error: 'failed' }
  }

  // A system role keeps its built-in keys whatever was sent.
  const next = minimalKeys([...(Array.isArray(input.perms) ? input.perms : []).map(String), ...role.base])
  const now = new Set(role.perms)
  const added = next.filter((k) => !now.has(k))
  const removed = role.perms.filter((k) => !next.includes(k))
  if (removed.length) {
    const { error } = await db.from('role_permissions').delete().eq('role_id', id).in('perm_key', removed)
    if (error) return { ok: false, error: 'failed' }
  }
  if (added.length) {
    const { error } = await db.from('role_permissions').insert(added.map((perm_key) => ({ role_id: id, perm_key })))
    if (error) return { ok: false, error: 'failed' }
  }
  if (added.length || removed.length || !role.isSystem) await log(ctx.userId, 'role_update', { name: role.nameTh, added, removed })
  revalidatePath(ROLES_PATH)
  return { ok: true }
}

export async function deleteRole(id: string): Promise<RolesResult> {
  const ctx = await guard()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'failed' }
  const role = (await listRoles())?.find((r) => r.id === id)
  if (!role) return { ok: false, error: 'not_found' }
  if (role.isSystem) return { ok: false, error: 'system' }
  // staff_roles / role_permissions rows go with it (on delete cascade).
  const { error } = await createAdminClient().from('roles').delete().eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  await log(ctx.userId, 'role_delete', { name: role.nameTh, holders: role.holders })
  revalidatePath(ROLES_PATH)
  revalidatePath(TEAM_PATH)
  return { ok: true }
}

/**
 * The extra roles this person holds (replaces the set). On top of their
 * profiles.role (the base role, set with setRole — unchanged); their access
 * is the union. The admin role is never given this way — admins are made with
 * the base role (setRole asks to confirm, keeps at least one).
 */
export async function assignRoles(userId: string, roleIds: string[]): Promise<RolesResult> {
  const ctx = await guard()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(userId) || !Array.isArray(roleIds) || !roleIds.every((r) => UUID.test(r))) return { ok: false, error: 'failed' }
  const roles = await listRoles()
  if (!roles) return { ok: false, error: 'not_set_up' }
  const wanted = [...new Set(roleIds)]
  if (!wanted.every((id) => roles.some((r) => r.id === id && r.key !== 'admin'))) return { ok: false, error: 'failed' }

  const db = createAdminClient()
  const { data: p } = await db.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (!p) return { ok: false, error: 'not_found' }
  const { data: cur } = await db.from('staff_roles').select('role_id').eq('user_id', userId)
  const now = new Set((cur ?? []).map((r) => r.role_id as string))
  const add = wanted.filter((id) => !now.has(id))
  const drop = [...now].filter((id) => !wanted.includes(id))
  if (drop.length) {
    const { error } = await db.from('staff_roles').delete().eq('user_id', userId).in('role_id', drop)
    if (error) return { ok: false, error: 'failed' }
  }
  if (add.length) {
    const { error } = await db.from('staff_roles').insert(add.map((role_id) => ({ user_id: userId, role_id })))
    if (error) return { ok: false, error: 'failed' }
  }
  if (add.length || drop.length) {
    const nameOf = (id: string) => roles.find((r) => r.id === id)?.nameTh ?? id
    await log(ctx.userId, 'roles_assign', { added: add.map(nameOf), removed: drop.map(nameOf) }, userId)
  }
  revalidatePath(TEAM_PATH)
  revalidatePath(ROLES_PATH)
  return { ok: true }
}
