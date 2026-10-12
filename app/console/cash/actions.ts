'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { getConsoleSession } from '@/lib/console/session'
import { getCurrentDevice } from '@/lib/console/device'
import { deskAllowed } from '@/lib/console/settings'
import { getCashRules, takingsBetween } from '@/lib/console/cash'
import { CASH_PATH, CONSOLE_PATH, DESK_PATH, canUseDesk, isAdmin } from '@/lib/auth/roles'
import { cleanCounted, countedTotal } from '@/lib/cash'

// Cash drawer (§30, v0.31): open with the float → blind count → reason for
// any difference → closed. Whoever may sell at the counter may do this
// (same rule as the sell screen); admins also review closed counts.

export type CashResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f-]{36}$/i
const fail = (error: { code?: string } | null): CashResult => ({ ok: false, error: isMissingTable(error) ? 'not_set_up' : 'failed' })
const done = () => {
  revalidatePath(CASH_PATH)
  revalidatePath(DESK_PATH)
  revalidatePath(CONSOLE_PATH)
}

async function requireDrawer(): Promise<{ userId: string; admin: boolean; deviceId: string | null } | { error: string }> {
  const { user, role } = await getConsoleSession()
  if (!user || !canUseDesk(role)) return { error: 'not_staff' }
  const device = await getCurrentDevice().catch(() => null)
  const admin = isAdmin(role)
  if (!(await deskAllowed({ userId: user.id, admin, onTablet: Boolean(device) }))) return { error: 'desk_tablet_only' }
  return { userId: user.id, admin, deviceId: device?.id ?? null }
}

const log = (actor: string, action: string, detail: Record<string, unknown>) =>
  createAdminClient().from('staff_actions').insert({ actor_id: actor, action, detail })

export async function openDrawer(): Promise<CashResult> {
  const ctx = await requireDrawer()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const rules = await getCashRules()
  if (!rules.setUp) return { ok: false, error: 'not_set_up' }
  const { data, error } = await createAdminClient()
    .from('cash_sessions')
    .insert({ status: 'open', opened_by: ctx.userId, float_amount: rules.float, device_id: ctx.deviceId })
    .select('id')
    .single()
  if (error) return error.code === '23505' ? { ok: false, error: 'already_open' } : fail(error)
  await log(ctx.userId, 'cash_open', { session: data.id, float: rules.float })
  done()
  return { ok: true }
}

// The blind count. The server works out what should be there now; the
// count can't be changed afterwards.
export async function sendCount(id: string, raw: unknown): Promise<CashResult> {
  const ctx = await requireDrawer()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'not_open' }
  const counted = cleanCounted(raw)
  if (!counted) return { ok: false, error: 'bad_count' }
  const db = createAdminClient()
  const { data: s, error } = await db.from('cash_sessions').select('id, status, opened_at, float_amount').eq('id', id).maybeSingle()
  if (error) return fail(error)
  if (!s || s.status !== 'open') return { ok: false, error: 'not_open' }
  const now = new Date().toISOString()
  let t: Awaited<ReturnType<typeof takingsBetween>>
  try {
    t = await takingsBetween(s.opened_at as string, now)
  } catch {
    return { ok: false, error: 'failed' }
  }
  const total = countedTotal(counted)
  const expected = Number(s.float_amount) + t.cashIn - t.cashOut
  const diff = total - expected
  const { data: upd, error: e } = await db
    .from('cash_sessions')
    .update({
      status: 'counted',
      counted_at: now,
      counted_by: ctx.userId,
      counted,
      counted_total: total,
      expected_cash: expected,
      cash_in: t.cashIn,
      cash_out: t.cashOut,
      transfer_total: t.transfer,
      card_total: t.card,
      diff,
    })
    .eq('id', id)
    .eq('status', 'open') // a second tap / tablet can't count twice
    .select('id')
  if (e) return fail(e)
  if (!upd?.length) return { ok: false, error: 'not_open' }
  await log(ctx.userId, 'cash_count', { session: id, counted: total, diff })
  done()
  return { ok: true }
}

export async function confirmClose(id: string, reason: string): Promise<CashResult> {
  const ctx = await requireDrawer()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'not_open' }
  const db = createAdminClient()
  const { data: s, error } = await db.from('cash_sessions').select('id, status, diff').eq('id', id).maybeSingle()
  if (error) return fail(error)
  if (!s || s.status !== 'counted') return { ok: false, error: 'not_open' }
  const why = String(reason ?? '').trim().slice(0, 500)
  if (Number(s.diff) !== 0 && why.length < 3) return { ok: false, error: 'need_reason' }
  const { data: upd, error: e } = await db
    .from('cash_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: ctx.userId, reason: why || null })
    .eq('id', id)
    .eq('status', 'counted')
    .select('id')
  if (e) return fail(e)
  if (!upd?.length) return { ok: false, error: 'not_open' }
  await log(ctx.userId, 'cash_close', { session: id, diff: Number(s.diff), reason: why || null })
  done()
  return { ok: true }
}

// Admin: "I've looked at this one" (+ a note). The count itself never changes.
export async function reviewSession(id: string, note: string): Promise<CashResult> {
  const { user, role } = await getConsoleSession()
  if (!user || !isAdmin(role)) return { ok: false, error: 'not_admin' }
  if (!UUID.test(id)) return { ok: false, error: 'failed' }
  const text = String(note ?? '').trim().slice(0, 500)
  const { data, error } = await createAdminClient()
    .from('cash_sessions')
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: user.id, review_note: text || null })
    .eq('id', id)
    .eq('status', 'closed')
    .select('id')
  if (error) return fail(error)
  if (!data?.length) return { ok: false, error: 'failed' }
  await log(user.id, 'cash_review', { session: id, note: text || null })
  done()
  return { ok: true }
}
