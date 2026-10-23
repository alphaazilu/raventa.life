'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'

// Branch settings page (v0.38.7): set one product's price override or stock for
// one branch. Admins only; the tables are service-role (schema.sql §48/§49).

export type BranchEditResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f-]{36}$/i
const path = (id: string) => `/console/settings/branch/${id}`
const clean = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10_000_000 ? Math.round(v) : null)

// A price override for (product, branch). All three blank removes it.
export async function setBranchPrice(
  productId: string,
  branchId: string,
  prices: { weekday: number | null; weekend: number | null; holiday: number | null },
): Promise<BranchEditResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(productId) || !UUID.test(branchId)) return { ok: false, error: 'bad_input' }
  const admin = createAdminClient()
  const wd = clean(prices.weekday)
  const we = clean(prices.weekend)
  const ho = clean(prices.holiday)
  if (wd === null && we === null && ho === null) {
    const { error } = await admin.from('product_branch_prices').delete().eq('product_id', productId).eq('branch_id', branchId)
    if (error && error.code !== '42P01') return { ok: false, error: 'failed' }
  } else {
    const { error } = await admin
      .from('product_branch_prices')
      .upsert({ product_id: productId, branch_id: branchId, price_weekday: wd, price_weekend: we, price_holiday: ho, updated_at: new Date().toISOString() }, { onConflict: 'product_id,branch_id' })
    if (error) return { ok: false, error: error.code === '42P01' ? 'not_set_up' : 'failed' }
  }
  await admin.from('staff_actions').insert({ actor_id: ctx.userId, action: 'branch_price', detail: { product: productId, branch: branchId, wd, we, ho } })
  revalidatePath(path(branchId))
  return { ok: true }
}

// A stock figure for (product, branch). null / blank removes the branch's own
// stock so it draws on the shared pool again.
export async function setBranchStock(productId: string, branchId: string, stock: number | null): Promise<BranchEditResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(productId) || !UUID.test(branchId)) return { ok: false, error: 'bad_input' }
  const admin = createAdminClient()
  const n = clean(stock)
  if (n === null) {
    const { error } = await admin.from('product_branch_stock').delete().eq('product_id', productId).eq('branch_id', branchId)
    if (error && error.code !== '42P01') return { ok: false, error: 'failed' }
  } else {
    const { error } = await admin
      .from('product_branch_stock')
      .upsert({ product_id: productId, branch_id: branchId, stock: n, updated_at: new Date().toISOString() }, { onConflict: 'product_id,branch_id' })
    if (error) return { ok: false, error: error.code === '42P01' ? 'not_set_up' : 'failed' }
  }
  await admin.from('staff_actions').insert({ actor_id: ctx.userId, action: 'branch_stock', detail: { product: productId, branch: branchId, stock: n } })
  revalidatePath(path(branchId))
  return { ok: true }
}
