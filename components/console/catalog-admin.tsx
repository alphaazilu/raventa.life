'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { CalendarDays, Package, Percent, Trash2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { catalogCopy as c, catalogErrors } from '@/lib/console/copy'
import { CATALOG_PATH } from '@/lib/auth/roles'
import {
  PRODUCT_KINDS,
  promoActiveOn,
  stockOf,
  type Catalog,
  type PackageRules,
  type Product,
  type ProductKind,
  type Promotion,
} from '@/lib/console/catalog'
import { removeHoliday, saveHoliday, savePromotion, saveProduct, saveVariant, setStock } from '@/app/console/catalog/actions'
import { cn } from '@/lib/utils'

export type CatalogView = 'products' | 'holidays' | 'promotions'

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

export function CatalogAdmin({ catalog, view, today }: { catalog: Catalog | null; view: CatalogView; today: string }) {
  const { tr } = useLanguage()
  const tabs: { key: CatalogView; label: { th: string; en: string }; icon: typeof Package }[] = [
    { key: 'products', label: c.tabProducts, icon: Package },
    { key: 'holidays', label: c.tabHolidays, icon: CalendarDays },
    { key: 'promotions', label: c.tabPromotions, icon: Percent },
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
      ) : view === 'promotions' ? (
        <Promotions catalog={catalog} today={today} />
      ) : (
        <Products catalog={catalog} />
      )}
    </div>
  )
}

// ---------------- Products ----------------

function Products({ catalog }: { catalog: Catalog }) {
  const { tr, lang } = useLanguage()
  const [selected, setSelected] = useState<string | 'new'>(catalog.products[0]?.id ?? 'new')
  const [fresh, setFresh] = useState(0)
  const product = catalog.products.find((p) => p.id === selected) ?? null
  const fmt = (p: Product) =>
    p.pkg ? p.priceWeekday.toLocaleString() : [p.priceWeekday, p.priceWeekend ?? '—', p.priceHoliday ?? '—'].map((v) => (typeof v === 'number' ? v.toLocaleString() : v)).join(' / ')

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-border">
        <div className="flex items-center justify-between bg-secondary px-4 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">{tr(c.colName)}</span>
          <button type="button" onClick={() => setSelected('new')} className="text-sm font-semibold text-primary">
            {tr(c.addProduct)}
          </button>
        </div>
        <ul className="divide-y divide-border">
          {catalog.products.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelected(p.id)}
                className={cn('grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left text-sm', selected === p.id ? 'bg-secondary/70' : 'hover:bg-secondary/40')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{lang === 'en' && p.nameEn ? p.nameEn : p.nameTh}</span>
                  <span className="block text-xs text-muted-foreground">
                    {tr(c[`kind_${p.kind}`])}
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
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <ProductForm key={product?.id ?? `new-${fresh}`} product={product} onCreated={() => setFresh((n) => n + 1)} />
        {product && product.kind !== 'day_pass' && product.kind !== 'package' && <Variants key={`v-${product.id}`} product={product} />}
      </section>
    </div>
  )
}

function ProductForm({ product, onCreated }: { product: Product | null; onCreated: () => void }) {
  const { tr } = useLanguage()
  const { pending, error, saved, run } = useSave()
  const isPass = product?.kind === 'day_pass'
  const [kind, setKind] = useState<ProductKind>(product?.kind ?? 'addon')
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
              kind,
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
            }),
          product ? undefined : onCreated,
        )
      }}
      className="space-y-3"
    >
      <h2 className="font-display text-lg font-bold">{product ? product.nameTh : tr(c.newProduct)}</h2>
      {isPass ? (
        <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">{tr(c.dayPassNote)}</p>
      ) : (
        <div>
          <span className={label}>{tr(c.colKind)}</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {PRODUCT_KINDS.filter((k) => k !== 'day_pass' && (!product || (k === 'package') === (product.kind === 'package'))).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', kind === k ? 'bg-foreground text-background' : 'border border-border')}
              >
                {tr(c[`kind_${k}`])}
              </button>
            ))}
          </div>
        </div>
      )}
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
              <span className={label}>{tr(c.pkgType)}</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setPkgUnlimited(false)} className={chipCls(!pkgUnlimited)}>{tr(c.pkgCount)}</button>
                <button type="button" onClick={() => setPkgUnlimited(true)} className={chipCls(pkgUnlimited)}>{tr(c.pkgUnlimited)}</button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {!pkgUnlimited && (
                <label>
                  <span className={label}>{tr(c.pkgVisits)}</span>
                  <input className={cn(input, 'mt-1 w-24')} inputMode="numeric" value={pkgVisits} onChange={(e) => setPkgVisits(e.target.value.replace(/\D/g, ''))} required />
                </label>
              )}
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
      <div className="flex items-center gap-3">
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
