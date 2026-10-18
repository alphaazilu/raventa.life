'use server'

import { revalidatePath } from 'next/cache'
import { isMissingTable, requireAdmin } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { CATALOG_PATH, DESK_PATH } from '@/lib/auth/roles'
import { COMMISSION_KINDS, type CommissionMode } from '@/lib/commission'

// Admin: who earns commission, and the rates (§33, v0.34).

export type CommissionResult = { ok: true } | { ok: false; error: string }

const fail = (error: { code?: string } | null): CommissionResult => ({ ok: false, error: isMissingTable(error) ? 'not_set_up' : 'failed' })

function done(): CommissionResult {
  revalidatePath(CATALOG_PATH)
  revalidatePath(DESK_PATH)
  return { ok: true }
}

export async function setEarner(staffId: string, enabled: boolean): Promise<CommissionResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  const { data: p } = await db.from('profiles').select('role').eq('id', staffId).maybeSingle()
  if (!p || (p.role !== 'staff' && p.role !== 'admin')) return { ok: false, error: 'not_staff_member' }
  const { error } = await db
    .from('staff_commission')
    .upsert({ staff_id: staffId, enabled: Boolean(enabled), updated_by: ctx.userId, updated_at: new Date().toISOString() })
  if (error) return fail(error)
  await db
    .from('staff_actions')
    .insert({ actor_id: ctx.userId, member_id: staffId, action: enabled ? 'commission_on' : 'commission_off', detail: {} })
    .then(() => undefined, () => undefined)
  return done()
}

// Members who sign up without a referral code count as this person's (§36, v0.36). null = nobody.
export async function setDefaultReferrer(staffId: string | null): Promise<CommissionResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  if (staffId) {
    const { data: p } = await db.from('profiles').select('role').eq('id', staffId).maybeSingle()
    if (!p || (p.role !== 'staff' && p.role !== 'admin')) return { ok: false, error: 'not_staff_member' }
  }
  const { error } = await db.from('app_settings').upsert({ id: 1, default_referrer_id: staffId, updated_by: ctx.userId, updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: /default_referrer_id/.test(error.message ?? '') || isMissingTable(error) ? 'not_ref_set_up' : 'failed' }
  return done()
}

// One rate for a product, or the default for a kind. mode null = remove it.
export async function saveCommissionRule(input: {
  productId?: string | null
  kind?: string | null
  mode: CommissionMode | null
  value: number
}): Promise<CommissionResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const productId = input.productId || null
  const kind = input.kind || null
  if (Boolean(productId) === Boolean(kind)) return { ok: false, error: 'failed' }
  if (kind && !(COMMISSION_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'failed' }
  const db = createAdminClient()
  const del = productId ? db.from('commission_rules').delete().eq('product_id', productId) : db.from('commission_rules').delete().eq('kind', kind as string)
  if (input.mode === null) {
    const { error } = await del
    return error ? fail(error) : done()
  }
  const value = Math.round(Number(input.value) * 100) / 100
  if (!(input.mode === 'pct' || input.mode === 'thb') || !(value > 0) || (input.mode === 'pct' && value > 100) || value > 1_000_000) {
    return { ok: false, error: 'bad_rate' }
  }
  const row = { product_id: productId, kind, mode: input.mode, value, updated_by: ctx.userId, updated_at: new Date().toISOString() }
  // Replace whatever was there (unique per product / per kind).
  const { data: old, error: e1 } = productId
    ? await db.from('commission_rules').select('id').eq('product_id', productId).maybeSingle()
    : await db.from('commission_rules').select('id').eq('kind', kind as string).maybeSingle()
  if (e1) return fail(e1)
  const { error } = old ? await db.from('commission_rules').update(row).eq('id', old.id) : await db.from('commission_rules').insert(row)
  return error ? fail(error) : done()
}
