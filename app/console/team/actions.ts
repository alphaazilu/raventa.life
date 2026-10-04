'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { bangkokToday } from '@/lib/check-in/day'
import { MEMBERS_PATH, TEAM_PATH, type Role } from '@/lib/auth/roles'
import { searchPeople, type Person } from '@/lib/console/team'

// Admin: who is staff / admin (v0.27). The profiles.role guard in the
// database (protect_role, §11) refuses role changes made with a person's
// own session; these go through the service role after the admin check,
// and every change is logged in staff_actions ('role_change').

export type RoleResult = { ok: true } | { ok: false; error: string }

const ROLES: Role[] = ['customer', 'staff', 'admin']
const UUID = /^[0-9a-f-]{36}$/i

export async function findPeople(q: string): Promise<Person[]> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return []
  return searchPeople(q)
}

export async function setRole(
  memberId: string,
  role: Role,
  opts: { confirmAdmin?: boolean; clearShifts?: boolean; clearPhone?: boolean } = {},
): Promise<RoleResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(memberId) || !ROLES.includes(role)) return { ok: false, error: 'failed' }
  if (memberId === ctx.userId && role !== 'admin') return { ok: false, error: 'self' }

  const db = createAdminClient()
  const { data: p } = await db.from('profiles').select('role').eq('id', memberId).maybeSingle()
  if (!p) return { ok: false, error: 'not_found' }
  const from = p.role as Role
  if (from === role) return { ok: true }

  // Never leave the Back Office without an admin.
  if (from === 'admin') {
    const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
    if ((count ?? 0) <= 1) return { ok: false, error: 'last_admin' }
  }
  if (role === 'admin' && !opts.confirmAdmin) return { ok: false, error: 'confirm_admin' }
  // Leaving the team while still clocked in: clock them out first.
  if (role === 'customer') {
    const { data: open } = await db.from('time_entries').select('id').eq('staff_id', memberId).is('clock_out', null).limit(1)
    if (open?.length) return { ok: false, error: 'open_entry' }
  }

  const { error } = await db.from('profiles').update({ role }).eq('id', memberId)
  if (error) return { ok: false, error: 'failed' }

  let clearedShifts = 0
  let clearedPhone = false
  if (role === 'customer') {
    if (opts.clearPhone !== false) {
      const { error: e } = await db.from('staff_phone_access').delete().eq('staff_id', memberId)
      clearedPhone = !e
    }
    if (opts.clearShifts) {
      const { data: gone } = await db.from('shift_assignments').delete().eq('staff_id', memberId).gte('work_date', bangkokToday()).select('id')
      clearedShifts = gone?.length ?? 0
    }
  }
  await db.from('staff_actions').insert({
    actor_id: ctx.userId,
    member_id: memberId,
    action: 'role_change',
    detail: { from, to: role, cleared_shifts: clearedShifts, cleared_phone: clearedPhone },
  })
  revalidatePath(TEAM_PATH)
  revalidatePath(`${MEMBERS_PATH}/${memberId}`)
  return { ok: true }
}
