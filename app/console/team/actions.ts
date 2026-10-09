'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { bangkokToday } from '@/lib/check-in/day'
import { MEMBERS_PATH, TEAM_PATH, type Role } from '@/lib/auth/roles'
import { findExact, personById, type Person } from '@/lib/console/team'
import { verifyMemberQrToken } from '@/lib/member-card'
import { isMissingTable } from '@/lib/console/db-errors'
import { PAY_TYPES, type PayType } from '@/lib/console/pay-cycle'

// Admin: who is staff / admin (v0.27). The profiles.role guard in the
// database (protect_role, §11) refuses role changes made with a person's
// own session; these go through the service role after the admin check,
// and every change is logged in staff_actions ('role_change').

export type RoleResult = { ok: true } | { ok: false; error: string }

const ROLES: Role[] = ['customer', 'staff', 'admin']
const UUID = /^[0-9a-f-]{36}$/i

// Exact look-up: member no., full email or full phone (v0.27.1).
export async function findPerson(q: string): Promise<Person | null> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return null
  return findExact(q)
}

// The member card's check-in QR, scanned on this page: the person is
// standing there, so it's the right account (the code expires quickly).
export async function personFromQr(raw: string): Promise<{ ok: true; person: Person } | { ok: false; error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const check = verifyMemberQrToken(raw)
  if (!check.ok) return { ok: false, error: check.reason === 'expired' ? 'qr_expired' : 'qr_invalid' }
  const person = await personById(check.userId)
  return person ? { ok: true, person } : { ok: false, error: 'not_found' }
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

// Paid by the day or by the month (§28, v0.28) — the time report counts the
// two differently. Team members only; logged like role changes.
export async function setPayType(memberId: string, payType: PayType): Promise<RoleResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(memberId) || !(PAY_TYPES as readonly string[]).includes(payType)) return { ok: false, error: 'failed' }
  const db = createAdminClient()
  const { data: p } = await db.from('profiles').select('role').eq('id', memberId).maybeSingle()
  if (!p) return { ok: false, error: 'not_found' }
  if (p.role !== 'staff' && p.role !== 'admin') return { ok: false, error: 'not_team' }
  const { error } = await db.from('staff_pay').upsert({ staff_id: memberId, pay_type: payType, updated_by: ctx.userId, updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: isMissingTable(error) ? 'pay_not_set_up' : 'failed' }
  await db.from('staff_actions').insert({ actor_id: ctx.userId, member_id: memberId, action: 'pay_type', detail: { to: payType } })
  revalidatePath(TEAM_PATH)
  return { ok: true }
}
