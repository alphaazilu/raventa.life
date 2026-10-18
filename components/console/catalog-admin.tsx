'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, BadgePercent, CalendarDays, FolderTree, Package, Percent, Trash2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { catalogCopy as c, catalogErrors } from '@/lib/console/copy'
import { CATALOG_PATH } from '@/lib/auth/roles'
import {
  DEFAULT_SALE_TYPES,
  SALE_TYPES,
  saleTypeOf,
  promoActiveOn,
  stockOf,
  type Catalog,
  type PackageRules,
  type Product,
  type ProductCategory,
  type Promotion,
  type SaleType,
  type SaleTypeNames,
} from '@/lib/console/catalog'
import {
  deleteProductCategory,
  orderProductCategories,
  removeHoliday,
  saveCategoryRate,
  saveHoliday,
  savePromotion,
  saveProduct,
  saveProductCategory,
  saveSaleTypes,
  saveVariant,
  setStock,
} from '@/app/console/catalog/actions'
import { cn } from '@/lib/utils'
import { cmCopy, type CommissionRule } from '@/lib/commission'
import { CommissionAdmin, type CommissionSetup } from '@/components/console/commission-admin'

export type CatalogView = 'products' | 'holidays' | 'promotions' | 'commission'

const input =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary'
const btn =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50'
const label = 'block text-xs font-semibold text-muted-foreground'

function useSave() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const run = (task: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      setError(null)
      setSaved(false)
      const r = await task()
      if (r.ok) {
        setSaved(true)
        after?.()
        router.refresh()
      } else setError(r.error)
    })
  return { pending, error, saved, run, setError }
}

function Status({ error, saved }: { error: string | null; saved: boolean }) {
  const { tr } = useLanguage()
  if (error)
    return (
      <p role="alert" className="text-sm font-semibold text-destructive">
        {tr(catalogErrors[error] ?? catalogErrors.failed)}
      </p>
    )
  if (saved) return <p className="text-sm font-semibold text-accent">{tr(c.saved)}</p>
  return null
}

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s))

export function CatalogAdmin({
  catalog,
  view,
  today,
  commission = null,
  rules = null,
  saleTypes = DEFAULT_SALE_TYPES,
}: {
  catalog: Catalog | null
  view: CatalogView
  today: string
  commission?: CommissionSetup | null
  // Products view (v0.37): commission rates (null = §33 not run) and sale type names.
  rules?: CommissionRule[] | null
  saleTypes?: SaleTypeNames
}) {
  const { tr } = useLanguage()
  const tabs: { key: CatalogView; label: { th: string; en: string }; icon: typeof Package }[] = [
    { key: 'products', label: c.tabProducts, icon: Package },
    { key: 'holidays', label: c.tabHolidays, icon: CalendarDays },
    { key: 'promotions', label: c.tabPromotions, icon: Percent },
    { key: 'commission', label: cmCopy.tab, icon: BadgePercent },
  ]
  return (
    <div className="w-full px-4 py-5 md:px-6 xl:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-display text-2xl font-extrabold text-foreground">{tr(c.title)}</h1>
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'products' ? CATALOG_PATH : `${CATALOG_PATH}?tab=${t.key}`}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold',
              view === t.key ? 'bg-foreground text-background' : 'border border-border text-foreground hover:border-primary/40',
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />
            {tr(t.label)}
          </Link>
        ))}
      </div>
      {!catalog ? (
        <p className="mt-6 rounded-2xl bg-amber-500/15 p-5 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.notSetUp)}</p>
      ) : view === 'holidays' ? (
        <Holidays catalog={catalog} today={today} />
      ) : view === 'commission' ? (
        <CommissionAdmin catalog={catalog} setup={commission} />
      ) : view === 'promotions' ? (
        <Promotions catalog={catalog} today={today} />
      ) : (
        <Products catalog={catalog} rules={rules} saleTypes={saleTypes} />
      )}
    </div>
  )
}

// ---------------- Products ----------------

// The products grouped by category (v0.37), then "No category". Before §37: by sale type.
export function productGroups(catalog: Catalog, tr: (l: { th: string; en: string }) => string, lang: string, saleTypes: SaleTypeNames = DEFAULT_SALE_TYPES) {
  const cats = catalog.categories
  const groups: { key: string; label: string; items: Product[] }[] = []
  if (!cats) {
    for (const k of SALE_TYPES) groups.push({ key: k, label: tr(saleTypes[k]), items: catalog.products.filter((p) => saleTypeOf(p.kind) === k) })
  } else {
    const known = new Set(cats.map((x) => x.id))
    for (const cat of cats) groups.push({ key: cat.id, label: lang === 'en' && cat.nameEn ? cat.nameEn : cat.nameTh, items: catalog.products.filter((p) => p.categoryId === cat.id) })
    groups.push({ key: 'none', label: tr(c.noCategory), items: catalog.products.filter((p) => !p.categoryId || !known.has(p.categoryId)) })
  }
  return groups.filter((g) => g.items.length > 0)
}

function Products({ catalog, rules, saleTypes }: { catalog: Catalog; rules: CommissionRule[] | null; saleTypes: SaleTypeNames }) {
  const { tr, lang } = useLanguage()
  const [selected, setSelected] = useState<string | 'new' | 'cats'>(catalog.products[0]?.id ?? 'new')
  const [fresh, setFresh] = useState(0)
  const product = catalog.products.find((p) => p.id === selected) ?? null
  const fmt = (p: Product) =>
    p.pkg ? p.priceWeekday.toLocaleString() : [p.priceWeekday, p.priceWeekend ?? '—', p.priceHoliday ?? '—'].map((v) => (typeof v === 'number' ? v.toLocaleString() : v)).join(' / ')
  const groups = productGroups(catalog, tr, lang, saleTypes)

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary px-4 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">{tr(c.colName)}</span>
          <span className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSelected('cats')}
              className={cn('inline-flex items-center gap-1 text-sm font-semibold', selected === 'cats' ? 'text-foreground' : 'text-primary')}
            >
              <FolderTree className="h-4 w-4" aria-hidden="true" />
              {tr(c.manageCats)}
            </button>
            <button type="button" onClick={() => setSelected('new')} className="text-sm font-semibold text-primary">
              {tr(c.addProduct)}
            </button>
          </span>
        </div>
        {groups.map((g) => (
          <div key={g.key}>
            <p className="border-t border-border bg-secondary/40 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground first:border-t-0">
              {g.label} <span className="font-normal">· {g.items.length}</span>
            </p>
            <ul className="divide-y divide-border">
              {g.items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className={cn('grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left text-sm', selected === p.id ? 'bg-secondary/70' : 'hover:bg-secondary/40')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{lang === 'en' && p.nameEn ? p.nameEn : p.nameTh}</span>
                      <span className="block text-xs text-muted-foreground">
                        {tr(saleTypes[saleTypeOf(p.kind)])}
                        {p.pkg && ` · ${pkgSummary(p.pkg, tr)}`}
                        {p.variants.length > 0 && ` · ${p.variants.filter((v) => v.active).length} ${tr(c.variants).split(' ')[0]}`}
                      </span>
                    </span>
                    <span className="text-xs">
                      <span className="block font-semibold">{fmt(p)}</span>
                      <span className={cn('block', p.trackStock && stockOf(p) < 5 ? 'text-destructive' : 'text-muted-foreground')}>
                        {p.trackStock ? `${tr(c.stock)} ${stockOf(p)}` : tr(c.noStock)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        p.active ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {tr(p.active ? c.onSale : c.off)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        {selected === 'cats' ? (
          <CategoryManager
            categories={catalog.categories}
            products={catalog.products}
            rules={rules}
            saleTypes={saleTypes}
            onBack={() => setSelected(catalog.products[0]?.id ?? 'new')}
          />
        ) : (
          <>
            <ProductForm
              key={product?.id ?? `new-${fresh}`}
              product={product}
              categories={catalog.categories}
              saleTypes={saleTypes}
              rules={rules}
              entries={catalog.products.filter((p) => p.kind === 'day_pass')}
              items={catalog.products.filter((p) => saleTypeOf(p.kind) === 'item' && !p.variants.some((v) => v.active))}
              includesReady={Boolean(catalog.includesReady)}
              packageExtrasReady={Boolean(catalog.packageExtrasReady)}
              onCreated={() => setFresh((n) => n + 1)}
            />
            {product && product.kind !== 'day_pass' && product.kind !== 'package' && <Variants key={`v-${product.id}`} product={product} />}
          </>
        )}
      </section>
    </div>
  )
}

type CatApi = {
  saveProductCategory: typeof saveProductCategory
  orderProductCategories: typeof orderProductCategories
  deleteProductCategory: typeof deleteProductCategory
  saveCategoryRate: typeof saveCategoryRate
  saveSaleTypes: typeof saveSaleTypes
}

// Products › Categories (§37, v0.37): name, add, order, remove every
// category, each with its commission rate; and the sale type names.
function CategoryManager({
  categories,
  products,
  rules,
  saleTypes,
  onBack,
  api = { saveProductCategory, orderProductCategories, deleteProductCategory, saveCategoryRate, saveSaleTypes },
}: {
  categories: ProductCategory[] | null
  products: Product[]
  rules: CommissionRule[] | null
  saleTypes: SaleTypeNames
  onBack: () => void
  api?: CatApi
}) {
  const { tr } = useLanguage()
  const { pending, error, saved, run } = useSave()
  const [nameTh, setNameTh] = useState('')
  const [nameEn, setNameEn] = useState('')
  if (!categories) return <p className="rounded-xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(c.catsNotSetUp)}</p>
  const count = (id: string) => products.filter((p) => p.categoryId === id).length
  const move = (i: number, d: -1 | 1) => {
    const ids = categories.map((x) => x.id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    run(() => api.orderProductCategories(ids))
  }
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-primary">
        {tr(c.backToProducts)}
      </button>
      <div>
        <h2 className="font-display text-lg font-bold">{tr(c.catsTitle)}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{tr(c.catsHint)}</p>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {categories.map((cat, i) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            count={count(cat.id)}
            rule={rules?.find((r) => r.categoryId === cat.id) ?? null}
            showRate={rules !== null}
            first={i === 0}
            last={i === categories.length - 1}
            onMove={(d) => move(i, d)}
            pending={pending}
            run={run}
            api={api}
          />
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(() => api.saveProductCategory({ nameTh, nameEn }), () => {
            setNameTh('')
            setNameEn('')
          })
        }}
        className="space-y-2 rounded-xl border border-dashed border-border p-3"
      >
        <div className="grid grid-cols-2 gap-2">
          <input className={input} value={nameTh} onChange={(e) => setNameTh(e.target.value)} maxLength={40} placeholder={tr(c.catPlaceholder)} aria-label={tr(c.nameTh)} required />
          <input className={input} value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={40} placeholder="English" aria-label={tr(c.nameEn)} />
        </div>
        <button type="submit" disabled={pending} className={cn(btn, 'w-full bg-primary text-primary-foreground')}>
          {pending && <Spinner className="h-4 w-4" />}
          {tr(c.addCat)}
        </button>
      </form>
      <Status error={error} saved={saved} />
      <SaleTypesCard saleTypes={saleTypes} save={api.saveSaleTypes} />
    </div>
  )
}

function CategoryRow({
  cat,
  count,
  rule,
  showRate,
  first,
  last,
  onMove,
  pending,
  run,
  api,
}: {
  cat: ProductCategory
  count: number
  rule: CommissionRule | null
  showRate: boolean
  first: boolean
  last: boolean
  onMove: (d: -1 | 1) => void
  pending: boolean
  run: ReturnType<typeof useSave>['run']
  api: CatApi
}) {
  const { tr } = useLanguage()
  const [nameTh, setNameTh] = useState(cat.nameTh)
  const [nameEn, setNameEn] = useState(cat.nameEn)
  const startMode = rule && rule.mode !== 'none' ? rule.mode : ''
  const [mode, setMode] = useState<'' | 'pct' | 'thb'>(startMode)
  const [value, setValue] = useState(rule && rule.mode !== 'none' ? String(rule.value) : '')
  const dirty = nameTh !== cat.nameTh || nameEn !== cat.nameEn
  const rateDirty = mode !== startMode || (mode !== '' && Number(value) !== Number(rule?.value ?? NaN))
  const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-30'
  return (
    <li className="space-y-2 p-3">
      <div className="flex items-center gap-1">
        <span className="mr-auto text-xs text-muted-foreground">{tr(c.catCount).replace('{n}', String(count))}</span>
        <button type="button" className={iconBtn} disabled={first || pending} onClick={() => onMove(-1)} aria-label={tr(c.catUp)} title={tr(c.catUp)}>
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={iconBtn} disabled={last || pending} onClick={() => onMove(1)} aria-label={tr(c.catDown)} title={tr(c.catDown)}>
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(iconBtn, 'hover:text-destructive')}
          disabled={pending}
          onClick={() => {
            if (window.confirm(tr(c.catDeleteAsk).replace('{name}', cat.nameTh))) run(() => api.deleteProductCategory(cat.id))
          }}
          aria-label={tr(c.catDelete)}
          title={tr(c.catDelete)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} value={nameTh} onChange={(e) => setNameTh(e.target.value)} maxLength={40} aria-label={tr(c.nameTh)} />
        <input className={input} value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={40} placeholder="English" aria-label={tr(c.nameEn)} />
      </div>
      {dirty && (
        <button type="button" disabled={pending || !nameTh.trim()} onClick={() => run(() => api.saveProductCategory({ id: cat.id, nameTh, nameEn }))} className={cn(btn, 'bg-primary py-1.5 text-primary-foreground')}>
          {tr(c.save)}
        </button>
      )}
      {showRate && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">{tr(c.catRate)}</span>
          <select className={cn(input, 'w-auto py-1')} value={mode} onChange={(e) => setMode(e.target.value as '' | 'pct' | 'thb')} aria-label={`${tr(c.catRate)} · ${cat.nameTh}`}>
            <option value="">{tr(c.cmNone)}</option>
            <option value="pct">{tr(c.cmPct)}</option>
            <option value="thb">{tr(c.cmThb)}</option>
          </select>
          {mode !== '' && (
            <input className={cn(input, 'w-20 py-1')} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} aria-label={`${tr(c.catRate)} · ${cat.nameTh}`} />
          )}
          {rateDirty && (
            <button
              type="button"
              disabled={pending || (mode !== '' && !(Number(value) > 0))}
              onClick={() => run(() => api.saveCategoryRate(cat.id, mode || null, Number(value)))}
              className={cn(btn, 'bg-primary px-3.5 py-1.5 text-primary-foreground')}
            >
              {tr(c.save)}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

// Sale type names, and which a business offers (§37, v0.37).
function SaleTypesCard({ saleTypes, save }: { saleTypes: SaleTypeNames; save: typeof saveSaleTypes }) {
  const { tr } = useLanguage()
  const { pending, error, saved, run } = useSave()
  const [v, setV] = useState<SaleTypeNames>(saleTypes)
  const set = (k: SaleType, patch: Partial<SaleTypeNames[SaleType]>) => setV((o) => ({ ...o, [k]: { ...o[k], ...patch } }))
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div>
        <h3 className="font-display text-base font-bold">{tr(c.saleTypesTitle)}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{tr(c.saleTypesHint)}</p>
      </div>
      {SALE_TYPES.map((k) => (
        <div key={k} className="space-y-1.5 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{tr(c[`typeHint_${k}`])}</span>
            <label className="flex items-center gap-1.5 text-xs font-semibold">
              <input type="checkbox" checked={v[k].on} onChange={(e) => set(k, { on: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              {tr(c.typeOn)}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} value={v[k].th} onChange={(e) => set(k, { th: e.target.value })} maxLength={40} aria-label={tr(c.nameTh)} />
            <input className={input} value={v[k].en} onChange={(e) => set(k, { en: e.target.value })} maxLength={40} aria-label={tr(c.nameEn)} />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending} onClick={() => run(() => save(v))} className={cn(btn, 'bg-primary text-primary-foreground')}>
          {pending && <Spinner className="h-4 w-4" />}
          {tr(c.save)}
        </button>
        <Status error={error} saved={saved} />
      </div>
    </div>
  )
}

function ProductForm({
  product,
  categories,
  saleTypes,
  rules,
  entries = [],
  items = [],
  includesReady = false,
  packageExtrasReady = false,
  onCreated,
}: {
  product: Product | null
  categories: ProductCategory[] | null
  saleTypes: SaleTypeNames
  rules: CommissionRule[] | null // null = commission (§33) not set up
  entries?: Product[] // entry products a package can hold (v0.37.1)
  items?: Product[] // what can come with a product (v0.37.2)
  includesReady?: boolean
  packageExtrasReady?: boolean
  onCreated: () => void
}) {
  const { tr, lang } = useLanguage()
  const { pending, error, saved, run } = useSave()
  const isPass = product?.kind === 'day_pass'
  const [type, setType] = useState<SaleType>(product ? saleTypeOf(product.kind) : saleTypes.item.on ? 'item' : 'package')
  const kind = type
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '')
  // Commission (v0.37): as the category, its own rate, or none.
  const own = product ? rules?.find((r) => r.productId === product.id) : undefined
  const [cmMode, setCmMode] = useState<'cat' | 'own' | 'none'>(own ? (own.mode === 'none' ? 'none' : 'own') : 'cat')
  const [cmKind, setCmKind] = useState<'pct' | 'thb'>(own && own.mode !== 'none' ? own.mode : 'pct')
  const [cmValue, setCmValue] = useState(own && own.mode !== 'none' ? String(own.value) : '')
  const catRule = categoryId ? rules?.find((r) => r.categoryId === categoryId) : rules?.find((r) => r.kind && r.kind === product?.kind)
  const catName = categories?.find((x) => x.id === categoryId)
  const rateText = (r: CommissionRule | undefined) => (r && r.mode !== 'none' ? (r.mode === 'pct' ? `${r.value}%` : `${r.value} ${tr(c.cmThb)}`) : tr(c.cmNone))
  const [nameTh, setNameTh] = useState(product?.nameTh ?? '')
  const [nameEn, setNameEn] = useState(product?.nameEn ?? '')
  const [wd, setWd] = useState(product ? String(product.priceWeekday) : '')
  const [we, setWe] = useState(product?.priceWeekend != null ? String(product.priceWeekend) : '')
  const [ho, setHo] = useState(product?.priceHoliday != null ? String(product.priceHoliday) : '')
  const [track, setTrack] = useState(product?.trackStock ?? false)
  const [active, setActive] = useState(product?.active ?? true)
  const [sort, setSort] = useState(String(product?.sort ?? 0))
  const isPkg = kind === 'package'
  const pk = product?.pkg
  const [pkgUnlimited, setPkgUnlimited] = useState(pk ? pk.visits === null : false)
  const [pkgVisits, setPkgVisits] = useState(String(pk?.visits ?? 10))
  // What comes with it (§39): given or lent.
  const [incl, setIncl] = useState<{ itemId: string; qty: number; lend: boolean }[]>(product?.includes ?? [])
  const pickable = items.filter((x) => x.id !== product?.id)
  // What the package holds (§38): for now one entry product.
  const entryIds = new Set(entries.map((x) => x.id))
  const [pkgItem, setPkgItem] = useState(product?.pkgItems?.find((x) => entryIds.has(x.itemId))?.itemId ?? entries[0]?.id ?? '')
  // Other things in the package (§40): a count or unlimited.
  const [pkgExtra, setPkgExtra] = useState<{ itemId: string; qty: string; unlimited: boolean }[]>(
    (product?.pkgItems ?? []).filter((x) => !entryIds.has(x.itemId)).map((x) => ({ itemId: x.itemId, qty: String(x.qty ?? 1), unlimited: x.qty === null })),
  )
  const monthly = pk ? pk.days % 30 === 0 : true
  const [pkgUnit, setPkgUnit] = useState<'days' | 'months'>(monthly ? 'months' : 'days')
  const [pkgLen, setPkgLen] = useState(String(pk ? (monthly ? pk.days / 30 : pk.days) : 3))
  const [pkgStart, setPkgStart] = useState<'purchase' | 'first_use'>(pk?.start ?? 'purchase')
  const [pkgActivate, setPkgActivate] = useState(String(pk?.activateDays ?? 90))
  const [pkgWeekday, setPkgWeekday] = useState(pk?.weekdayOnly ?? false)
  const [pkgStamp, setPkgStamp] = useState(pk?.earnsStamp ?? false)
  const [pkgShare, setPkgShare] = useState<'off' | 'split' | 'whole'>(pk?.share ?? 'off')
  const chipCls = (on: boolean) => cn('rounded-full px-3 py-1.5 text-xs font-semibold', on ? 'bg-foreground text-background' : 'border border-border')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            saveProduct({
              id: product?.id,
              kind: type === 'entry' ? (product?.kind ?? 'day_pass') : type,
              categoryId: categories ? categoryId || null : undefined,
              commission: rules ? { mode: cmMode === 'own' ? cmKind : cmMode, value: Number(cmValue) } : undefined,
              nameTh,
              nameEn,
              priceWeekday: Number(wd),
              priceWeekend: num(we),
              priceHoliday: num(ho),
              trackStock: track,
              active,
              sort: Number(sort),
              pkg: isPkg
                ? {
                    visits: pkgUnlimited ? null : Number(pkgVisits),
                    days: Number(pkgLen) * (pkgUnit === 'months' ? 30 : 1),
                    start: pkgStart,
                    activateDays: Number(pkgActivate),
                    weekdayOnly: pkgWeekday,
                    earnsStamp: pkgStamp,
                    share: pkgUnlimited && pkgShare === 'split' ? 'off' : pkgShare,
                  }
                : null,
              pkgItems:
                isPkg && pkgItem
                  ? [
                      { itemId: pkgItem, qty: pkgUnlimited ? null : Number(pkgVisits) },
                      ...(packageExtrasReady
                        ? pkgExtra.filter((x) => x.itemId).map((x) => ({ itemId: x.itemId, qty: x.unlimited ? null : Number(x.qty) || 0 }))
                        : []),
                    ]
                  : undefined,
              includes: includesReady && !isPkg ? incl.filter((x) => x.itemId) : undefined,
            }),
          product ? undefined : onCreated,
        )
      }}
      className="space-y-3"
    >
      <h2 className="font-display text-lg font-bold">{product ? product.nameTh : tr(c.newProduct)}</h2>
      <p className={cn(label, 'text-primary')}>{tr(c.secInfo)}</p>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={label}>{tr(c.nameTh)}</span>
          <input className={cn(input, 'mt-1')} value={nameTh} onChange={(e) => setNameTh(e.target.value)} maxLength={60} required />
        </label>
        <label>
          <span className={label}>{tr(c.nameEn)}</span>
          <input className={cn(input, 'mt-1')} value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={60} />
        </label>
      </div>
      {categories && (
        <label className="block">
          <span className={label}>{tr(c.colCategory)}</span>
          <select className={cn(input, 'mt-1')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{tr(c.noCategory)}</option>
            {categories.map((x) => (
              <option key={x.id} value={x.id}>
                {lang === 'en' && x.nameEn ? x.nameEn : x.nameTh}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className={cn(label, 'pt-2 text-primary')}>{tr(c.secType)}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {SALE_TYPES.filter((k) => saleTypes[k].on || k === type).map((k) => {
          const locked = product ? k !== type : k === 'entry'
          return (
            <button
              key={k}
              type="button"
              disabled={locked}
              onClick={() => setType(k)}
              aria-pressed={type === k}
              className={cn(
                'rounded-xl border p-2.5 text-left disabled:cursor-not-allowed',
                type === k ? 'border-2 border-accent bg-accent/10' : 'border-border',
                locked && type !== k && 'opacity-40',
              )}
            >
              <span className="block text-sm font-semibold">{tr(saleTypes[k])}</span>
              <span className="block text-[11px] text-muted-foreground">{tr(c[`typeHint_${k}`])}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{product ? tr(c.typeLocked) : tr(c.entryOne)}</p>

      <p className={cn(label, 'pt-2 text-primary')}>{tr(c.secPrice)}</p>
      {isPkg ? (
        <>
          <label className="block max-w-[12rem]">
            <span className={label}>{tr(c.pkgPrice)}</span>
            <input className={cn(input, 'mt-1')} inputMode="numeric" value={wd} onChange={(e) => setWd(e.target.value.replace(/\D/g, ''))} required />
          </label>
          <p className="text-xs text-muted-foreground">{tr(c.pkgPriceNote)}</p>
          <fieldset className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <legend className="px-1 text-xs font-bold text-primary">{tr(c.pkgHeading)}</legend>
            <div>
              <span className={label}>{tr(c.pkgHolds)}</span>
              {entries.length === 0 ? (
                <p className="mt-1 text-xs font-semibold text-destructive">{tr(c.pkgNoEntry)}</p>
              ) : (
                <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-2 text-sm">
                  <select className={cn(input, 'w-auto min-w-0 flex-1 py-1.5')} value={pkgItem} onChange={(e) => setPkgItem(e.target.value)} aria-label={tr(c.pkgHolds)}>
                    {entries.map((x) => (
                      <option key={x.id} value={x.id}>
                        {lang === 'en' && x.nameEn ? x.nameEn : x.nameTh}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground">×</span>
                  <input
                    className={cn(input, 'w-20 py-1.5', pkgUnlimited && 'opacity-40')}
                    inputMode="numeric"
                    value={pkgUnlimited ? '' : pkgVisits}
                    disabled={pkgUnlimited}
                    onChange={(e) => setPkgVisits(e.target.value.replace(/\D/g, ''))}
                    aria-label={tr(c.pkgVisits)}
                    required={!pkgUnlimited}
                  />
                  <span>{tr(c.pkgTimes)}</span>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={pkgUnlimited} onChange={(e) => setPkgUnlimited(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                    {tr(c.pkgUnlimitedShort)}
                  </label>
                </div>
              )}
              {packageExtrasReady ? (
                <>
                  {pkgExtra.map((x, i) => (
                    <div key={i} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-2 text-sm">
                      <select
                        className={cn(input, 'w-auto min-w-0 flex-1 py-1.5')}
                        value={x.itemId}
                        onChange={(e) => setPkgExtra((l) => l.map((y, j) => (j === i ? { ...y, itemId: e.target.value } : y)))}
                        aria-label={tr(c.inclPick)}
                      >
                        <option value="">{tr(c.inclPick)}</option>
                        {items.map((p) => (
                          <option key={p.id} value={p.id}>
                            {lang === 'en' && p.nameEn ? p.nameEn : p.nameTh}
                          </option>
                        ))}
                      </select>
                      <span className="text-muted-foreground">×</span>
                      <input
                        className={cn(input, 'w-20 py-1.5', x.unlimited && 'opacity-40')}
                        inputMode="numeric"
                        value={x.unlimited ? '' : x.qty}
                        disabled={x.unlimited}
                        onChange={(e) => setPkgExtra((l) => l.map((y, j) => (j === i ? { ...y, qty: e.target.value.replace(/\D/g, '').slice(0, 4) } : y)))}
                        aria-label="qty"
                      />
                      <span>{tr(c.pkgTimes)}</span>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={x.unlimited}
                          onChange={(e) => setPkgExtra((l) => l.map((y, j) => (j === i ? { ...y, unlimited: e.target.checked } : y)))}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        {tr(c.pkgUnlimitedShort)}
                      </label>
                      <button
                        type="button"
                        onClick={() => setPkgExtra((l) => l.filter((_, j) => j !== i))}
                        aria-label={tr(c.inclRemove)}
                        title={tr(c.inclRemove)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  {pkgExtra.length < 10 && items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPkgExtra((l) => [...l, { itemId: '', qty: '1', unlimited: false }])}
                      className="mt-2 rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-accent hover:bg-secondary"
                    >
                      {tr(c.pkgAddItem)}
                    </button>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">{tr(c.pkgExtraHint)}</p>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">{tr(c.pkgAddLater)}</p>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label>
                <span className={label}>{tr(c.pkgValid)}</span>
                <input className={cn(input, 'mt-1 w-20')} inputMode="numeric" value={pkgLen} onChange={(e) => setPkgLen(e.target.value.replace(/\D/g, ''))} required />
              </label>
              <div className="flex gap-1.5 pb-1">
                <button type="button" onClick={() => setPkgUnit('days')} className={chipCls(pkgUnit === 'days')}>{tr(c.pkgDays)}</button>
                <button type="button" onClick={() => setPkgUnit('months')} className={chipCls(pkgUnit === 'months')}>{tr(c.pkgMonths)}</button>
              </div>
            </div>
            <div>
              <span className={label}>{tr(c.pkgStart)}</span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setPkgStart('purchase')} className={chipCls(pkgStart === 'purchase')}>{tr(c.pkgStartPurchase)}</button>
                <button type="button" onClick={() => setPkgStart('first_use')} className={chipCls(pkgStart === 'first_use')}>{tr(c.pkgStartFirstUse)}</button>
              </div>
              {pkgStart === 'first_use' && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  {tr(c.pkgActivate)}
                  <input className={cn(input, 'w-20 py-1')} inputMode="numeric" value={pkgActivate} onChange={(e) => setPkgActivate(e.target.value.replace(/\D/g, ''))} required />
                </label>
              )}
            </div>
            <div>
              <span className={label}>{tr(c.pkgDaysAllowed)}</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setPkgWeekday(false)} className={chipCls(!pkgWeekday)}>{tr(c.pkgAnyDay)}</button>
                <button type="button" onClick={() => setPkgWeekday(true)} className={chipCls(pkgWeekday)}>{tr(c.pkgWeekdayOnly)}</button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pkgStamp} onChange={(e) => setPkgStamp(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
              {tr(c.pkgStamp)}
            </label>
            <div>
              <span className={label}>{tr(c.pkgShare)}</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setPkgShare('off')} className={chipCls(pkgShare === 'off' || (pkgUnlimited && pkgShare === 'split'))}>{tr(c.pkgShareOff)}</button>
                {!pkgUnlimited && (
                  <button type="button" onClick={() => setPkgShare('split')} className={chipCls(pkgShare === 'split')}>{tr(c.pkgShareSplit)}</button>
                )}
                <button type="button" onClick={() => setPkgShare('whole')} className={chipCls(pkgShare === 'whole')}>{tr(c.pkgShareWhole)}</button>
              </div>
              {pkgShare === 'split' && !pkgUnlimited && <p className="mt-1 text-xs text-muted-foreground">{tr(c.pkgShareSplitHint)}</p>}
              {pkgShare === 'whole' && <p className="mt-1 text-xs text-muted-foreground">{tr(c.pkgShareWholeHint)}</p>}
            </div>
          </fieldset>
        </>
      ) : (
        <>
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            [c.priceWeekday, wd, setWd, true],
            [c.priceWeekend, we, setWe, false],
            [c.priceHoliday, ho, setHo, false],
          ] as const
        ).map(([l, v, set, req]) => (
          <label key={l.en}>
            <span className={label}>{tr(l)}</span>
            <input className={cn(input, 'mt-1')} inputMode="numeric" value={v} onChange={(e) => set(e.target.value.replace(/\D/g, ''))} required={req} />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{tr(c.priceBlankHint)}</p>
        </>
      )}
      {!isPass && !isPkg && <p className={cn(label, 'pt-2 text-primary')}>{tr(c.secStock)}</p>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {!isPass && !isPkg && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            {tr(c.trackStock)}
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          {tr(c.activeLabel)}
        </label>
        <label className="flex items-center gap-2">
          {tr(c.sortLabel)}
          <input className={cn(input, 'w-16 py-1')} inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value.replace(/[^\d-]/g, ''))} />
        </label>
      </div>
      {includesReady && !isPkg && (
        <>
          <p className={cn(label, 'pt-2 text-primary')}>{tr(c.secIncl)}</p>
          <p className="text-[11px] text-muted-foreground">{tr(c.inclHint)}</p>
          {incl.map((x, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2 text-sm">
              <select
                className={cn(input, 'w-auto min-w-0 flex-1 py-1.5')}
                value={x.itemId}
                onChange={(e) => setIncl((l) => l.map((y, j) => (j === i ? { ...y, itemId: e.target.value } : y)))}
                aria-label={tr(c.inclPick)}
              >
                <option value="">{tr(c.inclPick)}</option>
                {pickable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {lang === 'en' && p.nameEn ? p.nameEn : p.nameTh}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">×</span>
              <input
                className={cn(input, 'w-14 py-1.5')}
                inputMode="numeric"
                value={String(x.qty)}
                onChange={(e) => setIncl((l) => l.map((y, j) => (j === i ? { ...y, qty: Math.max(1, Math.min(20, Number(e.target.value.replace(/\D/g, '')) || 1)) } : y)))}
                aria-label="qty"
              />
              <select
                className={cn(input, 'w-auto py-1.5')}
                value={x.lend ? 'lend' : 'give'}
                onChange={(e) => setIncl((l) => l.map((y, j) => (j === i ? { ...y, lend: e.target.value === 'lend' } : y)))}
                aria-label={tr(c.inclLend)}
              >
                <option value="give">{tr(c.inclGive)}</option>
                <option value="lend">{tr(c.inclLend)}</option>
              </select>
              <button
                type="button"
                onClick={() => setIncl((l) => l.filter((_, j) => j !== i))}
                aria-label={tr(c.inclRemove)}
                title={tr(c.inclRemove)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {pickable.length === 0 ? (
            <p className="text-xs text-muted-foreground">{tr(c.inclNone)}</p>
          ) : (
            incl.length < 10 && (
              <button
                type="button"
                onClick={() => setIncl((l) => [...l, { itemId: '', qty: 1, lend: false }])}
                className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-accent hover:bg-secondary"
              >
                {tr(c.inclAdd)}
              </button>
            )
          )}
        </>
      )}

      <p className={cn(label, 'pt-2 text-primary')}>{tr(c.secCm)}</p>
      {rules === null ? (
        <p className="text-xs text-muted-foreground">{tr(c.cmNotSetUp)}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="cm" checked={cmMode === 'cat'} onChange={() => setCmMode('cat')} className="h-4 w-4 accent-[var(--accent)]" />
            {tr(c.cmByCat)}
            <span className="text-muted-foreground">
              ({catName ? (lang === 'en' && catName.nameEn ? catName.nameEn : catName.nameTh) : tr(c.cmNoCat)} · {rateText(catRule)})
            </span>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="cm" checked={cmMode === 'own'} onChange={() => setCmMode('own')} className="h-4 w-4 accent-[var(--accent)]" />
            {tr(c.cmOwn)}
            {cmMode === 'own' && (
              <>
                <select className={cn(input, 'w-auto py-1')} value={cmKind} onChange={(e) => setCmKind(e.target.value as 'pct' | 'thb')} aria-label={tr(c.cmOwn)}>
                  <option value="pct">{tr(c.cmPct)}</option>
                  <option value="thb">{tr(c.cmThb)}</option>
                </select>
                <input className={cn(input, 'w-20 py-1')} inputMode="decimal" value={cmValue} onChange={(e) => setCmValue(e.target.value.replace(/[^\d.]/g, ''))} aria-label={tr(c.cmOwn)} required />
              </>
            )}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="cm" checked={cmMode === 'none'} onChange={() => setCmMode('none')} className="h-4 w-4 accent-[var(--accent)]" />
            {tr(c.cmNone)}
          </label>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={pending} className={cn(btn, 'bg-primary text-primary-foreground')}>
          {pending && <Spinner className="h-4 w-4" />}
          {tr(c.save)}
        </button>
        <Status error={error} saved={saved} />
      </div>
      {product && !isPass && !isPkg && product.variants.length === 0 && product.trackStock && <StockSetter productId={product.id} variantId={null} current={product.stock} />}
    </form>
  )
}

function StockSetter({ productId, variantId, current }: { productId: string; variantId: string | null; current: number }) {
  const { tr } = useLanguage()
  const { pending, error, saved, run } = useSave()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(String(current))
  const [reason, setReason] = useState('')
  useEffect(() => setValue(String(current)), [current])
  if (!open)
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <span className={cn('font-semibold', current < 5 && 'text-destructive')}>{current}</span>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-primary">
          {tr(c.setStock)}
        </button>
        {saved && <span className="text-xs text-accent">✓</span>}
      </span>
    )
  return (
    // Full width on its own line — inside a variant row it would otherwise
    // squeeze in beside the size name and cover it.
    <div className="order-last mt-2 w-full basis-full rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{tr(c.stockHint)}</p>
      <div className="mt-2 flex gap-2">
        <input className={cn(input, 'w-20 shrink-0')} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} aria-label={tr(c.stock)} />
        <input className={cn(input, 'min-w-0 flex-1')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr(c.stockReason)} aria-label={tr(c.stockReason)} maxLength={200} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || value === ''}
          onClick={() => run(() => setStock({ productId, variantId, stock: Number(value), reason }), () => setOpen(false))}
          className={cn(btn, 'bg-primary px-4 py-1.5 text-primary-foreground')}
        >
          {tr(c.save)}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground">
          {tr(c.cancel)}
        </button>
        <Status error={error} saved={false} />
      </div>
    </div>
  )
}

function Variants({ product }: { product: Product }) {
  const { tr } = useLanguage()
  const { pending, error, saved, run } = useSave()
  const [labelText, setLabelText] = useState('')
  const [sku, setSku] = useState('')
  return (
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm font-bold">{tr(c.variants)}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{tr(c.variantsHint)}</p>
      {product.variants.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-sm">
          {product.variants.map((v) => (
            <li key={v.id} className={cn('flex flex-wrap items-center gap-2 py-2', !v.active && 'opacity-50')}>
              <span className="min-w-0 flex-1 font-medium">
                {v.label}
                {v.sku && <span className="ml-2 font-mono text-xs text-muted-foreground">{v.sku}</span>}
              </span>
              {product.trackStock && <StockSetter productId={product.id} variantId={v.id} current={v.stock} />}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => saveVariant({ id: v.id, productId: product.id, label: v.label, sku: v.sku ?? '', active: !v.active }))}
                className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold"
              >
                {tr(v.active ? c.off : c.onSale)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(
            () => saveVariant({ productId: product.id, label: labelText, sku, active: true }),
            () => {
              setLabelText('')
              setSku('')
            },
          )
        }}
      >
        <input className={input} value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder={tr(c.variantLabel)} aria-label={tr(c.variantLabel)} maxLength={40} required />
        <input className={cn(input, 'w-28 uppercase')} value={sku} onChange={(e) => setSku(e.target.value)} placeholder={tr(c.sku)} aria-label={tr(c.sku)} maxLength={40} />
        <button type="submit" disabled={pending} className={cn(btn, 'shrink-0 border border-border px-3')}>
          {tr(c.addVariant)}
        </button>
      </form>
      <div className="mt-2">
        <Status error={error} saved={saved} />
      </div>
    </div>
  )
}

// ---------------- Holidays ----------------

function Holidays({ catalog, today }: { catalog: Catalog; today: string }) {
  const { tr, lang } = useLanguage()
  const { pending, error, saved, run } = useSave()
  const [day, setDay] = useState('')
  const [name, setName] = useState('')
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    )
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-2xl border border-border">
        {catalog.holidays.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{tr(c.noHolidays)}</p>
        ) : (
          <ul className="divide-y divide-border">
            {catalog.holidays.map((h) => (
              <li key={h.day} className={cn('flex items-center gap-3 px-4 py-3 text-sm', h.day < today && 'text-muted-foreground')}>
                <span className="w-44 shrink-0 font-semibold">{fmt(h.day)}</span>
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                {h.day < today && <span className="text-xs">{tr(c.past)}</span>}
                <button type="button" disabled={pending} onClick={() => run(() => removeHoliday(h.day))} aria-label={tr(c.remove)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <form
        className="h-fit space-y-3 rounded-2xl border border-border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => saveHoliday(day, name), () => {
            setDay('')
            setName('')
          })
        }}
      >
        <h2 className="font-display text-lg font-bold">{tr(c.addHoliday)}</h2>
        <label className="block">
          <span className={label}>{tr(c.holidayDate)}</span>
          <input type="date" className={cn(input, 'mt-1')} value={day} onChange={(e) => setDay(e.target.value)} required />
        </label>
        <label className="block">
          <span className={label}>{tr(c.holidayName)}</span>
          <input className={cn(input, 'mt-1')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        <p className="text-xs text-muted-foreground">{tr(c.holidayHint)}</p>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={cn(btn, 'bg-primary text-primary-foreground')}>
            {tr(c.addHoliday)}
          </button>
          <Status error={error} saved={saved} />
        </div>
      </form>
    </div>
  )
}

// ---------------- Promotions ----------------

function Promotions({ catalog, today }: { catalog: Catalog; today: string }) {
  const { tr, lang } = useLanguage()
  const [selected, setSelected] = useState<string | 'new'>(catalog.promotions[0]?.id ?? 'new')
  const [fresh, setFresh] = useState(0)
  const promo = catalog.promotions.find((p) => p.id === selected) ?? null
  const productName = (id: string | null) => {
    const p = catalog.products.find((x) => x.id === id)
    return p ? (lang === 'en' && p.nameEn ? p.nameEn : p.nameTh) : '—'
  }
  const scopeText = (p: Promotion) => (p.scope === 'product' ? productName(p.productId) : tr(c[`scope_${p.scope}`]))
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-border">
        <div className="flex items-center justify-between bg-secondary px-4 py-2.5">
          <span className="text-xs text-muted-foreground">{tr(c.promoHint)}</span>
          <button type="button" onClick={() => setSelected('new')} className="shrink-0 pl-3 text-sm font-semibold text-primary">
            {tr(c.addPromotion)}
          </button>
        </div>
        {catalog.promotions.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{tr(c.noPromotions)}</p>
        ) : (
          <ul className="divide-y divide-border">
            {catalog.promotions.map((p) => {
              const running = promoActiveOn(p, today)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className={cn('grid w-full grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left text-sm', selected === p.id ? 'bg-secondary/70' : 'hover:bg-secondary/40')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.kind === 'pct' ? `${p.value}%` : `${p.value.toLocaleString()} ฿`} · {scopeText(p)}
                      </span>
                    </span>
                    <span className="text-xs">
                      <span className="block font-mono font-semibold">{p.code ?? tr(c.auto)}</span>
                      <span className="block text-muted-foreground">
                        {p.startsOn ?? '…'} → {p.endsOn ?? tr(c.always)}
                      </span>
                    </span>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', running ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground')}>
                      {tr(running ? c.running : p.active ? c.notRunning : c.off)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <section className="h-fit rounded-2xl border border-border bg-card p-5">
        <PromotionForm key={promo?.id ?? `new-${fresh}`} promo={promo} catalog={catalog} onCreated={() => setFresh((n) => n + 1)} />
      </section>
    </div>
  )
}

function PromotionForm({ promo, catalog, onCreated }: { promo: Promotion | null; catalog: Catalog; onCreated: () => void }) {
  const { tr, lang } = useLanguage()
  const { pending, error, saved, run } = useSave()
  const [name, setName] = useState(promo?.name ?? '')
  const [kind, setKind] = useState<'pct' | 'thb'>(promo?.kind ?? 'pct')
  const [value, setValue] = useState(promo ? String(promo.value) : '')
  const [scope, setScope] = useState<Promotion['scope']>(promo?.scope ?? 'all')
  const [productId, setProductId] = useState<string>(promo?.productId ?? '')
  const [code, setCode] = useState(promo?.code ?? '')
  const [startsOn, setStartsOn] = useState(promo?.startsOn ?? '')
  const [endsOn, setEndsOn] = useState(promo?.endsOn ?? '')
  const [active, setActive] = useState(promo?.active ?? true)
  const chip = (on: boolean) => cn('rounded-full px-3 py-1.5 text-xs font-semibold', on ? 'bg-foreground text-background' : 'border border-border')

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            savePromotion({
              id: promo?.id,
              name,
              kind,
              value: Number(value),
              scope,
              productId: scope === 'product' ? productId || null : null,
              code,
              startsOn,
              endsOn,
              active,
            }),
          promo ? undefined : onCreated,
        )
      }}
    >
      <h2 className="font-display text-lg font-bold">{promo ? promo.name : tr(c.newPromotion)}</h2>
      <label className="block">
        <span className={label}>{tr(c.promoName)}</span>
        <input className={cn(input, 'mt-1')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </label>
      <div className="flex items-end gap-3">
        <div>
          <span className={label}>{tr(c.promoKind)}</span>
          <div className="mt-1 flex gap-1.5">
            <button type="button" onClick={() => setKind('pct')} className={chip(kind === 'pct')}>
              {tr(c.pct)}
            </button>
            <button type="button" onClick={() => setKind('thb')} className={chip(kind === 'thb')}>
              {tr(c.thb)}
            </button>
          </div>
        </div>
        <label className="w-28">
          <span className={label}>{tr(c.promoValue)}</span>
          <input className={cn(input, 'mt-1')} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} required />
        </label>
      </div>
      <div>
        <span className={label}>{tr(c.scope)}</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(['all', 'day_pass', 'product'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={chip(scope === s)}>
              {tr(c[`scope_${s}`])}
            </button>
          ))}
        </div>
        {scope === 'product' && (
          <select className={cn(input, 'mt-2')} value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">—</option>
            {catalog.products
              .filter((p) => p.kind !== 'day_pass')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {lang === 'en' && p.nameEn ? p.nameEn : p.nameTh}
                </option>
              ))}
          </select>
        )}
      </div>
      <label className="block">
        <span className={label}>{tr(c.promoCode)}</span>
        <input className={cn(input, 'mt-1 font-mono uppercase')} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={label}>{tr(c.startsOn)}</span>
          <input type="date" className={cn(input, 'mt-1')} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label>
          <span className={label}>{tr(c.endsOn)}</span>
          <input type="date" className={cn(input, 'mt-1')} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
        {tr(c.promoActive)}
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={cn(btn, 'bg-primary text-primary-foreground')}>
          {pending && <Spinner className="h-4 w-4" />}
          {tr(c.save)}
        </button>
        <Status error={error} saved={saved} />
      </div>
    </form>
  )
}

function pkgSummary(p: PackageRules, tr: (v: { th: string; en: string }) => string): string {
  const visits = p.visits === null ? tr(c.pkgSummaryUnlimited) : tr(c.pkgSummaryCount).replace('{n}', String(p.visits))
  return `${visits} · ${tr(c.pkgSummaryDays).replace('{n}', String(p.days))}`
}
