'use server'

import { revalidatePath } from 'next/cache'
import { isMissingTable, requirePermissions } from '@/lib/console/guard'
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
  const ctx = await requirePermissions('access:catalog.commission')
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
  const ctx = await requirePermissions('access:catalog.commission')
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

// One rate (v0.37: a list the admin adds to): for one product, a category
// (§37), or the Day Pass / package kind. mode null = remove it.
export async function saveCommissionRule(input: {
  productId?: string | null
  categoryId?: string | null
  kind?: string | null
  mode: CommissionMode | null
  value: number
}): Promise<CommissionResult> {
  const ctx = await requirePermissions('access:catalog.commission')
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const productId = input.productId || null
  const categoryId = input.categoryId || null
  const kind = input.kind || null
  if ([productId, categoryId, kind].filter(Boolean).length !== 1) return { ok: false, error: 'failed' }
  if (kind && !(COMMISSION_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'failed' }
  const db = createAdminClient()
  const col = productId ? 'product_id' : categoryId ? 'category_id' : 'kind'
  const val = (productId ?? categoryId ?? kind) as string
  if (input.mode === null) {
    const { error } = await db.from('commission_rules').delete().eq(col, val)
    return error ? fail(error) : done()
  }
  const value = input.mode === 'none' ? 0 : Math.round(Number(input.value) * 100) / 100
  if (input.mode === 'none') {
    if (!productId) return { ok: false, error: 'failed' }
  } else if (!(input.mode === 'pct' || input.mode === 'thb') || !(value > 0) || (input.mode === 'pct' && value > 100) || value > 1_000_000) {
    return { ok: false, error: 'bad_rate' }
  }
  const row = {
    product_id: productId,
    kind,
    ...(categoryId ? { category_id: categoryId } : {}),
    mode: input.mode,
    value,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  }
  // Replace whatever was there (one per product / category / kind).
  const { data: old, error: e1 } = await db.from('commission_rules').select('id').eq(col, val).maybeSingle()
  if (e1) return fail(e1)
  const { error } = old ? await db.from('commission_rules').update(row).eq('id', old.id) : await db.from('commission_rules').insert(row)
  return error ? fail(error) : done()
}
