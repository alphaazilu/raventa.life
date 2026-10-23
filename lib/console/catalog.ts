import { isMissingTable } from '@/lib/console/db-errors'

// Catalog, prices and promotions (schema.sql §18). Types plus one loader
// that works with any Supabase client: the admin page passes the
// service-role client, the desk passes the staff member's own session
// (RLS lets staff read these tables).

export type ProductKind = 'day_pass' | 'addon' | 'merch' | 'souvenir' | 'package'
// Sale type (v0.37) = what happens when it's sold: an item / service (the
// bill is all), an entry (checks the guest in — the Day Pass) or a package
// (visits kept on the member's account). Stored as products.kind: the old
// add-on / merchandise / souvenir kinds are all "item" now — categories
// group them.
export type SaleType = 'item' | 'entry' | 'package'
export const SALE_TYPES: SaleType[] = ['item', 'entry', 'package']
export const saleTypeOf = (k: ProductKind): SaleType => (k === 'day_pass' ? 'entry' : k === 'package' ? 'package' : 'item')

// The admin's names for the sale types, and which are offered (app_settings.sale_types).
export type SaleTypeNames = Record<SaleType, { th: string; en: string; on: boolean }>
export const DEFAULT_SALE_TYPES: SaleTypeNames = {
  item: { th: 'ของ / บริการ', en: 'Item / service', on: true },
  entry: { th: 'บัตรเข้าใช้', en: 'Entry', on: true },
  package: { th: 'แพ็กเกจหลายครั้ง', en: 'Multi-visit package', on: true },
}
export function saleTypesFrom(raw: unknown): SaleTypeNames {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, { th?: unknown; en?: unknown; on?: unknown }>
  const out = { ...DEFAULT_SALE_TYPES }
  for (const k of SALE_TYPES) {
    const v = r[k]
    if (!v) continue
    out[k] = {
      th: typeof v.th === 'string' && v.th.trim() ? v.th.trim().slice(0, 40) : DEFAULT_SALE_TYPES[k].th,
      en: typeof v.en === 'string' && v.en.trim() ? v.en.trim().slice(0, 40) : DEFAULT_SALE_TYPES[k].en,
      on: v.on !== false,
    }
  }
  return out
}

// Admin-named product groups (§37, v0.37).
export type ProductCategory = { id: string; nameTh: string; nameEn: string; sort: number }
export type DayType = 'weekday' | 'weekend' | 'holiday'

export type Variant = {
  id: string
  label: string
  sku: string | null
  stock: number
  active: boolean
}

export type Product = {
  id: string
  kind: ProductKind
  nameTh: string
  nameEn: string
  priceWeekday: number
  priceWeekend: number | null
  priceHoliday: number | null
  trackStock: boolean
  stock: number
  active: boolean
  hidden: boolean // §43: soft-deleted (kept for reports)
  sort: number
  categoryId: string | null // §37
  variants: Variant[]
  // Package rules (§21); null for other kinds.
  pkg: PackageRules | null
  // What a package holds (§38, v0.37.1): products and how many times (null = unlimited).
  pkgItems?: { itemId: string; qty: number | null }[]
  // What comes with it (§39, v0.37.2): given (on the bill at 0) or lent (back at check-out).
  includes?: { itemId: string; qty: number; lend: boolean }[]
  // Per-branch price overrides (§48, v0.38.5): branchId → prices (null = base).
  branchPrices?: { branchId: string; weekday: number | null; weekend: number | null; holiday: number | null }[]
  // Per-branch stock (§49, v0.38.6): branchId → stock the branch keeps of its own.
  branchStock?: { branchId: string; stock: number }[]
  // §51 (v0.38.11): staff can lend this item to a customer on the spot.
  lendable?: boolean
}

export type PackageRules = {
  visits: number | null // null = unlimited
  days: number
  start: 'purchase' | 'first_use'
  activateDays: number // first_use: must start within this many days
  weekdayOnly: boolean
  earnsStamp: boolean
  // Sharing with friends (§23): off; split = each link hands over one visit
  // (set number of visits only); whole = friends join and use the same package.
  share: 'off' | 'split' | 'whole'
}

export type Promotion = {
  id: string
  name: string
  kind: 'pct' | 'thb'
  value: number
  scope: 'all' | 'day_pass' | 'custom'
  // §42: products and categories this promo applies to (scope 'custom').
  productIds: string[]
  categoryIds: string[]
  code: string | null
  startsOn: string | null
  endsOn: string | null
  active: boolean
}

export type Holiday = { day: string; name: string }

// categories: null = §37 not run yet.
export type Catalog = {
  products: Product[]
  promotions: Promotion[]
  holidays: Holiday[]
  categories: ProductCategory[] | null
  // Branches for per-branch pricing (§48, v0.38.5). null = §46 not run.
  branches?: { id: string; name: string; active: boolean }[] | null
  includesReady?: boolean // §39 run: products can bring items along
  packageExtrasReady?: boolean // §40 run: packages can hold other items
  entriesReady?: boolean // §41 run: several entries, packages without entry
  branchPricesReady?: boolean // §48 run: per-branch price overrides
  branchStockReady?: boolean // §49 run: per-branch stock
  lendableReady?: boolean // §51 run: lendable items
}

export const PRODUCT_KINDS: ProductKind[] = ['day_pass', 'package', 'addon', 'merch', 'souvenir']

type Row = Record<string, unknown>
// Minimal surface of a Supabase client used here.
type Client = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

function toVariant(v: Row): Variant {
  return {
    id: v.id as string,
    label: v.label as string,
    sku: (v.sku as string | null) ?? null,
    stock: Number(v.stock ?? 0),
    active: Boolean(v.is_active),
  }
}

// null = §18 hasn't been run yet.
export async function loadCatalog(client: Client): Promise<Catalog | null> {
  const [p, v, pr, pt, h, pc, pi, inc, mpi, ne, bp, br, bs] = await Promise.all([
    client.from('products').select('*').order('sort').order('created_at'),
    client.from('product_variants').select('*').order('sort').order('created_at'),
    client.from('promotions').select('*').order('created_at', { ascending: false }),
    client.from('promotion_targets').select('promotion_id, product_id, category_id'),
    client.from('holidays').select('*').order('day'),
    client.from('product_categories').select('id, name_th, name_en, sort').order('sort').order('created_at'),
    client.from('package_items').select('package_id, item_id, qty, sort').order('sort').order('created_at'),
    client.from('product_includes').select('product_id, item_id, qty, lend, sort').order('sort').order('created_at'),
    client.from('member_package_items').select('id').limit(1),
    client.from('member_packages').select('no_entry').limit(1),
    client.from('product_branch_prices').select('product_id, branch_id, price_weekday, price_weekend, price_holiday'),
    client.from('branches').select('id, name, is_active').order('sort').order('created_at'),
    client.from('product_branch_stock').select('product_id, branch_id, stock'),
  ])
  const err = [p.error, v.error, pr.error, h.error].find(Boolean) as { code?: string } | undefined
  if (err) {
    if (isMissingTable(err)) return null
    throw new Error(`catalog load failed: ${err.code}`)
  }
  const byProduct = new Map<string, Variant[]>()
  for (const row of (v.data ?? []) as Row[]) {
    const list = byProduct.get(row.product_id as string) ?? []
    list.push(toVariant(row))
    byProduct.set(row.product_id as string, list)
  }
  const kindOrder = (k: string) => PRODUCT_KINDS.indexOf(k as ProductKind)
  const products = ((p.data ?? []) as Row[])
    .map(
      (r): Product => ({
        id: r.id as string,
        kind: r.kind as ProductKind,
        nameTh: r.name_th as string,
        nameEn: (r.name_en as string) ?? '',
        priceWeekday: Number(r.price_weekday),
        priceWeekend: r.price_weekend == null ? null : Number(r.price_weekend),
        priceHoliday: r.price_holiday == null ? null : Number(r.price_holiday),
        trackStock: Boolean(r.track_stock),
        lendable: Boolean(r.lendable),
        stock: Number(r.stock ?? 0),
        active: Boolean(r.is_active),
      hidden: Boolean(r.hidden),
        sort: Number(r.sort ?? 0),
        categoryId: (r.category_id as string | null | undefined) ?? null,
        // §38 not run → none listed (the form shows the visit count as before).
        pkgItems: pi.error
          ? undefined
          : ((pi.data ?? []) as Row[]).filter((x) => x.package_id === r.id).map((x) => ({ itemId: x.item_id as string, qty: x.qty == null ? null : Number(x.qty) })),
        // §39 not run → undefined (the form hides the section).
        includes: inc.error
          ? undefined
          : ((inc.data ?? []) as Row[]).filter((x) => x.product_id === r.id).map((x) => ({ itemId: x.item_id as string, qty: Number(x.qty), lend: Boolean(x.lend) })),
        // §48 not run → undefined (the form hides the per-branch price section).
        branchPrices: bp.error
          ? undefined
          : ((bp.data ?? []) as Row[])
              .filter((x) => x.product_id === r.id)
              .map((x) => ({
                branchId: x.branch_id as string,
                weekday: x.price_weekday == null ? null : Number(x.price_weekday),
                weekend: x.price_weekend == null ? null : Number(x.price_weekend),
                holiday: x.price_holiday == null ? null : Number(x.price_holiday),
              })),
        // §49 not run → undefined (the form hides the per-branch stock section).
        branchStock: bs.error
          ? undefined
          : ((bs.data ?? []) as Row[]).filter((x) => x.product_id === r.id).map((x) => ({ branchId: x.branch_id as string, stock: Number(x.stock) })),
        variants: byProduct.get(r.id as string) ?? [],
        pkg:
          r.kind === 'package'
            ? {
                visits: r.pkg_visits == null ? null : Number(r.pkg_visits),
                days: Number(r.pkg_days ?? 30),
                start: r.pkg_start === 'first_use' ? 'first_use' : 'purchase',
                activateDays: Number(r.pkg_activate_days ?? 90),
                weekdayOnly: Boolean(r.pkg_weekday_only),
                earnsStamp: Boolean(r.pkg_earns_stamp),
                share: !r.pkg_shareable ? 'off' : r.pkg_share_whole ? 'whole' : 'split',
              }
            : null,
      }),
    )
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.sort - b.sort)
  // §37 not run → no categories (everything else still works).
  const categories = pc.error
    ? null
    : ((pc.data ?? []) as Row[]).map((r) => ({ id: r.id as string, nameTh: r.name_th as string, nameEn: (r.name_en as string) ?? '', sort: Number(r.sort ?? 0) }))
  const targetsByPromo = new Map<string, { products: string[]; categories: string[] }>()
  for (const t of (pt.data ?? []) as Row[]) {
    const id = t.promotion_id as string
    const e = targetsByPromo.get(id) ?? { products: [], categories: [] }
    if (t.product_id) e.products.push(t.product_id as string)
    if (t.category_id) e.categories.push(t.category_id as string)
    targetsByPromo.set(id, e)
  }
  return {
    includesReady: !inc.error,
    packageExtrasReady: !mpi.error,
    entriesReady: !ne.error,
    branchPricesReady: !bp.error,
    branchStockReady: !bs.error,
    // §51 adds products.lendable — detect it from the rows we already read.
    lendableReady: ((p.data ?? []) as Row[]).some((r) => 'lendable' in r),
    branches: br.error ? null : ((br.data ?? []) as Row[]).map((r) => ({ id: r.id as string, name: r.name as string, active: Boolean(r.is_active) })),
    categories,
    products,
    promotions: ((pr.data ?? []) as Row[]).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      kind: r.kind as 'pct' | 'thb',
      value: Number(r.value),
      scope: (r.scope === 'product' ? 'custom' : r.scope) as Promotion['scope'],
      productIds: (targetsByPromo.get(r.id as string)?.products ?? []),
      categoryIds: (targetsByPromo.get(r.id as string)?.categories ?? []),
      code: (r.code as string | null) ?? null,
      startsOn: (r.starts_on as string | null) ?? null,
      endsOn: (r.ends_on as string | null) ?? null,
      active: Boolean(r.is_active),
    })),
    holidays: ((h.data ?? []) as Row[]).map((r) => ({ day: r.day as string, name: r.name as string })),
  }
}

// Mirrors public.day_type / public.product_price in the database (the
// database is what actually charges; this is for showing prices).
export function dayTypeOf(isoDate: string, holidays: Holiday[]): DayType {
  if (holidays.some((h) => h.day === isoDate)) return 'holiday'
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return d === 0 || d === 6 ? 'weekend' : 'weekday'
}

export function priceOn(p: Pick<Product, 'priceWeekday' | 'priceWeekend' | 'priceHoliday'>, type: DayType): number {
  if (type === 'holiday') return p.priceHoliday ?? p.priceWeekend ?? p.priceWeekday
  if (type === 'weekend') return p.priceWeekend ?? p.priceWeekday
  return p.priceWeekday
}

// Stock on hand for a product (sum of active variants, or its own count).
export function stockOf(p: Product): number {
  const live = p.variants.filter((v) => v.active)
  return live.length > 0 ? live.reduce((n, v) => n + v.stock, 0) : p.stock
}

export function promoActiveOn(pr: Promotion, isoDate: string): boolean {
  return pr.active && (!pr.startsOn || pr.startsOn <= isoDate) && (!pr.endsOn || pr.endsOn >= isoDate)
}

export function receiptLabel(no: number | string): string {
  return `R${String(no).padStart(6, '0')}`
}
