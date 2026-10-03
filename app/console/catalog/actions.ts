'use server'

import { isMissingTable, requireAdmin } from '@/lib/console/guard'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { CATALOG_PATH, DESK_PATH } from '@/lib/auth/roles'
import type { PackageRules, ProductKind } from '@/lib/console/catalog'

// Admin: products, variants, stock, public holidays, promotions (§18).
// Written with the service role after an admin check, like the shifts
// page; stock changes are logged in staff_actions with who and why.

export type CatalogResult = { ok: true } | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SELLABLE: ProductKind[] = ['addon', 'merch', 'souvenir', 'package']

function dbError(error: { code?: string; message?: string } | null, unique?: string): string {
  if (!error) return 'failed'
  if (isMissingTable(error)) return 'not_set_up'
  if (error.code === '23505' && unique) return unique
  return 'failed'
}

function done(): CatalogResult {
  revalidatePath(CATALOG_PATH)
  revalidatePath(DESK_PATH)
  return { ok: true }
}

const price = (v: number | null | undefined): number | null | 'bad' => {
  if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return null
  const n = Math.round(Number(v))
  return n >= 0 && n <= 1_000_000 ? n : 'bad'
}

export async function saveProduct(input: {
  id?: string
  kind: ProductKind
  nameTh: string
  nameEn: string
  priceWeekday: number
  priceWeekend: number | null
  priceHoliday: number | null
  trackStock: boolean
  active: boolean
  sort: number
  pkg?: PackageRules | null
}): Promise<CatalogResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const nameTh = input.nameTh.trim().slice(0, 60)
  // Package rules (§21): checked here and again by the database.
  let pkgCols = {}
  if (input.kind === 'package') {
    const r = input.pkg
    const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
    if (!r || !int(r.days, 1, 3650) || !(r.visits === null || int(r.visits, 1, 1000)) || !int(r.activateDays, 1, 3650)) {
      return { ok: false, error: 'bad_package' }
    }
    pkgCols = {
      pkg_visits: r.visits,
      pkg_days: r.days,
      pkg_start: r.start === 'first_use' ? 'first_use' : 'purchase',
      pkg_activate_days: r.activateDays,
      pkg_weekday_only: Boolean(r.weekdayOnly),
      pkg_earns_stamp: Boolean(r.earnsStamp),
      pkg_shareable: r.visits !== null && Boolean(r.shareable),
      price_weekend: null,
      price_holiday: null,
      track_stock: false,
    }
  }
  if (!nameTh) return { ok: false, error: 'need_name' }
  const wd = price(input.priceWeekday)
  const we = price(input.priceWeekend)
  const ho = price(input.priceHoliday)
  if (wd === null || wd === 'bad' || we === 'bad' || ho === 'bad') return { ok: false, error: 'bad_price' }

  const admin = createAdminClient()
  const row = {
    name_th: nameTh,
    name_en: input.nameEn.trim().slice(0, 60),
    price_weekday: wd,
    price_weekend: we,
    price_holiday: ho,
    is_active: input.active,
    sort: Math.round(Number(input.sort) || 0),
    updated_at: new Date().toISOString(),
    ...pkgCols,
  }
  if (input.id) {
    const { data: existing } = await admin.from('products').select('kind').eq('id', input.id).maybeSingle()
    if (!existing) return { ok: false, error: 'failed' }
    // The Day Pass keeps its type and never tracks stock; others may change type.
    // A package stays a package (people own copies of it); nothing becomes one.
    const extra =
      existing.kind === 'day_pass'
        ? {}
        : (existing.kind === 'package') !== (input.kind === 'package')
          ? null
          : input.kind === 'package'
            ? {}
            : SELLABLE.includes(input.kind)
              ? { kind: input.kind, track_stock: input.trackStock }
              : null
    if (extra === null) return { ok: false, error: 'bad_kind' }
    const { error } = await admin.from('products').update({ ...row, ...extra }).eq('id', input.id)
    if (error) return { ok: false, error: dbError(error) }
  } else {
    if (!SELLABLE.includes(input.kind)) return { ok: false, error: 'bad_kind' }
    const { error } = await admin.from('products').insert({ track_stock: input.trackStock, ...row, kind: input.kind })
    if (error) return { ok: false, error: dbError(error) }
  }
  return done()
}

export async function saveVariant(input: {
  id?: string
  productId: string
  label: string
  sku: string
  active: boolean
}): Promise<CatalogResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const label = input.label.trim().slice(0, 40)
  if (!label) return { ok: false, error: 'need_name' }
  const sku = input.sku.trim().toUpperCase().slice(0, 40) || null
  const admin = createAdminClient()
  const row = { label, sku, is_active: input.active }
  const { error } = input.id
    ? await admin.from('product_variants').update(row).eq('id', input.id).eq('product_id', input.productId)
    : await admin.from('product_variants').insert({ ...row, product_id: input.productId })
  if (error) return { ok: false, error: dbError(error, 'sku_taken') }
  return done()
}

// Set the on-hand count (a delivery, a recount). Logged with the reason.
export async function setStock(input: {
  productId: string
  variantId: string | null
  stock: number
  reason: string
}): Promise<CatalogResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const stock = Math.round(Number(input.stock))
  if (!(stock >= 0 && stock <= 1_000_000)) return { ok: false, error: 'bad_stock' }
  const reason = input.reason.trim().slice(0, 200)
  if (reason.length < 2) return { ok: false, error: 'need_reason' }
  const admin = createAdminClient()
  const table = input.variantId ? 'product_variants' : 'products'
  const id = input.variantId ?? input.productId
  const { data: before, error: readErr } = await admin.from(table).select('stock').eq('id', id).maybeSingle()
  if (readErr || !before) return { ok: false, error: dbError(readErr) }
  const { error } = await admin.from(table).update({ stock }).eq('id', id)
  if (error) return { ok: false, error: dbError(error) }
  await admin.from('staff_actions').insert({
    actor_id: ctx.userId,
    action: 'stock_set',
    detail: { product_id: input.productId, variant_id: input.variantId, from: before.stock, to: stock, reason },
  })
  return done()
}

export async function saveHoliday(day: string, name: string): Promise<CatalogResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!DATE_RE.test(day)) return { ok: false, error: 'bad_date' }
  const n = name.trim().slice(0, 60)
  if (!n) return { ok: false, error: 'need_name' }
  const { error } = await createAdminClient().from('holidays').upsert({ day, name: n })
  if (error) return { ok: false, error: dbError(error) }
  return done()
}

export async function removeHoliday(day: string): Promise<CatalogResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!DATE_RE.test(day)) return { ok: false, error: 'bad_date' }
  const { error } = await createAdminClient().from('holidays').delete().eq('day', day)
  if (error) return { ok: false, error: dbError(error) }
  return done()
}

export async function savePromotion(input: {
  id?: string
  name: string
  kind: 'pct' | 'thb'
  value: number
  scope: 'all' | 'day_pass' | 'product'
  productId: string | null
  code: string
  startsOn: string
  endsOn: string
  active: boolean
}): Promise<CatalogResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const name = input.name.trim().slice(0, 60)
  if (!name) return { ok: false, error: 'need_name' }
  if (input.kind !== 'pct' && input.kind !== 'thb') return { ok: false, error: 'bad_value' }
  const value = Math.round(Number(input.value))
  if (!(value > 0) || (input.kind === 'pct' && value > 100) || value > 1_000_000) return { ok: false, error: 'bad_value' }
  if (!['all', 'day_pass', 'product'].includes(input.scope)) return { ok: false, error: 'bad_value' }
  if (input.scope === 'product' && !input.productId) return { ok: false, error: 'need_product' }
  const code = input.code.trim().toUpperCase()
  if (code && !/^[A-Z0-9]{3,20}$/.test(code)) return { ok: false, error: 'bad_code' }
  const startsOn = input.startsOn || null
  const endsOn = input.endsOn || null
  if ((startsOn && !DATE_RE.test(startsOn)) || (endsOn && !DATE_RE.test(endsOn))) return { ok: false, error: 'bad_date' }
  if (startsOn && endsOn && startsOn > endsOn) return { ok: false, error: 'bad_dates' }

  const row = {
    name,
    kind: input.kind,
    value,
    scope: input.scope,
    product_id: input.scope === 'product' ? input.productId : null,
    code: code || null,
    starts_on: startsOn,
    ends_on: endsOn,
    is_active: input.active,
  }
  const admin = createAdminClient()
  const { error } = input.id
    ? await admin.from('promotions').update(row).eq('id', input.id)
    : await admin.from('promotions').insert(row)
  if (error) return { ok: false, error: dbError(error, 'code_taken') }
  return done()
}
