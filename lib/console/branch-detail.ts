import { createAdminClient } from '@/lib/supabase/admin'

// Branch settings page (§46–§49, v0.38.7): everything about one branch in one
// place — its price overrides, its own stock, and the tablets assigned to it.
// SERVER ONLY (service role; the page checks for an admin first).

export type BranchProduct = {
  id: string
  name: string
  kind: string
  trackStock: boolean
  hasVariants: boolean
  priceWeekday: number
}
export type BranchPriceRow = { productId: string; name: string; weekday: number | null; weekend: number | null; holiday: number | null }
export type BranchStockRow = { productId: string; name: string; stock: number }
export type BranchDevice = { id: string; name: string }

export type BranchDetail = {
  branch: { id: string; name: string; active: boolean }
  prices: BranchPriceRow[]
  stock: BranchStockRow[]
  devices: BranchDevice[]
  // Every sellable product, for the "add an override" pickers.
  products: BranchProduct[]
  pricesReady: boolean // §48
  stockReady: boolean // §49
}

type Row = Record<string, unknown>

export async function loadBranchDetail(branchId: string): Promise<BranchDetail | null> {
  const db = createAdminClient()
  const { data: branch } = await db.from('branches').select('id, name, is_active').eq('id', branchId).maybeSingle()
  if (!branch) return null

  const [prodRes, varRes, priceRes, stockRes, devRes] = await Promise.all([
    db.from('products').select('id, name_th, kind, track_stock, price_weekday, hidden').order('sort').order('created_at'),
    db.from('product_variants').select('product_id, is_active'),
    db.from('product_branch_prices').select('product_id, price_weekday, price_weekend, price_holiday').eq('branch_id', branchId),
    db.from('product_branch_stock').select('product_id, stock').eq('branch_id', branchId),
    db.from('devices').select('id, name, branch_id, revoked_at').eq('branch_id', branchId).is('revoked_at', null),
  ])

  const variantOf = new Set<string>()
  for (const v of (varRes.data ?? []) as Row[]) if (v.is_active) variantOf.add(v.product_id as string)

  const allProducts = ((prodRes.data ?? []) as Row[]).filter((p) => !p.hidden)
  const nameOf = new Map<string, string>(allProducts.map((p) => [p.id as string, p.name_th as string]))
  const products: BranchProduct[] = allProducts
    .filter((p) => p.kind !== 'package') // packages are priced 0 / sold as a unit
    .map((p) => ({
      id: p.id as string,
      name: p.name_th as string,
      kind: p.kind as string,
      trackStock: Boolean(p.track_stock),
      hasVariants: variantOf.has(p.id as string),
      priceWeekday: Number(p.price_weekday),
    }))

  const prices: BranchPriceRow[] = priceRes.error
    ? []
    : ((priceRes.data ?? []) as Row[]).map((r) => ({
        productId: r.product_id as string,
        name: nameOf.get(r.product_id as string) ?? '—',
        weekday: r.price_weekday == null ? null : Number(r.price_weekday),
        weekend: r.price_weekend == null ? null : Number(r.price_weekend),
        holiday: r.price_holiday == null ? null : Number(r.price_holiday),
      }))

  const stock: BranchStockRow[] = stockRes.error
    ? []
    : ((stockRes.data ?? []) as Row[]).map((r) => ({
        productId: r.product_id as string,
        name: nameOf.get(r.product_id as string) ?? '—',
        stock: Number(r.stock),
      }))

  const devices: BranchDevice[] = ((devRes.data ?? []) as Row[]).map((r) => ({ id: r.id as string, name: r.name as string }))

  return {
    branch: { id: branch.id as string, name: branch.name as string, active: Boolean(branch.is_active) },
    prices,
    stock,
    devices,
    products,
    pricesReady: !priceRes.error,
    stockReady: !stockRes.error,
  }
}
