import { isMissingTable } from '@/lib/console/db-errors'

// Catalog, prices and promotions (schema.sql §18). Types plus one loader
// that works with any Supabase client: the admin page passes the
// service-role client, the desk passes the staff member's own session
// (RLS lets staff read these tables).

export type ProductKind = 'day_pass' | 'addon' | 'merch' | 'souvenir' | 'package'
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
  sort: number
  variants: Variant[]
  // Package rules (§21); null for other kinds.
  pkg: PackageRules | null
}

export type PackageRules = {
  visits: number | null // null = unlimited
  days: number
  start: 'purchase' | 'first_use'
  activateDays: number // first_use: must start within this many days
  weekdayOnly: boolean
  earnsStamp: boolean
  shareable: boolean // friends can use it (set number of visits only)
}

export type Promotion = {
  id: string
  name: string
  kind: 'pct' | 'thb'
  value: number
  scope: 'all' | 'day_pass' | 'product'
  productId: string | null
  code: string | null
  startsOn: string | null
  endsOn: string | null
  active: boolean
}

export type Holiday = { day: string; name: string }

export type Catalog = { products: Product[]; promotions: Promotion[]; holidays: Holiday[] }

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
  const [p, v, pr, h] = await Promise.all([
    client.from('products').select('*').order('sort').order('created_at'),
    client.from('product_variants').select('*').order('sort').order('created_at'),
    client.from('promotions').select('*').order('created_at', { ascending: false }),
    client.from('holidays').select('*').order('day'),
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
        stock: Number(r.stock ?? 0),
        active: Boolean(r.is_active),
        sort: Number(r.sort ?? 0),
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
                shareable: Boolean(r.pkg_shareable),
              }
            : null,
      }),
    )
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.sort - b.sort)
  return {
    products,
    promotions: ((pr.data ?? []) as Row[]).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      kind: r.kind as 'pct' | 'thb',
      value: Number(r.value),
      scope: r.scope as Promotion['scope'],
      productId: (r.product_id as string | null) ?? null,
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
