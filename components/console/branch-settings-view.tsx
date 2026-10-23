'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Tablet, Trash2, Check, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { catalogCopy, consoleCopy, settingsCopy } from '@/lib/console/copy'
import { cn } from '@/lib/utils'
import { saveBranch } from '@/app/console/settings/actions'
import { setBranchPrice, setBranchStock } from '@/app/console/settings/branch/actions'
import type { BranchDetail, BranchPriceRow, BranchStockRow, BranchProduct } from '@/lib/console/branch-detail'

// Keys live across three copy objects; merge them so c.* resolves (no overlap).
const c = { ...catalogCopy, ...consoleCopy, ...settingsCopy }

const card = 'rounded-2xl border border-border bg-card p-5'
const input = 'rounded-xl border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary'
const label = 'text-xs font-semibold tracking-wide text-muted-foreground'
const num = (s: string) => (s.trim() === '' ? null : Number(s))

export function BranchSettingsView({ detail }: { detail: BranchDetail }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const b = detail.branch
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(b.name)
  const refresh = () => router.refresh()
  const run = (task: () => Promise<{ ok: boolean }>, after?: () => void) =>
    start(async () => {
      const r = await task()
      if (r.ok) after?.()
      refresh()
    })

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-6 md:px-6">
      <Link href="/console/settings?tab=shop" className="text-sm font-semibold text-muted-foreground hover:text-primary">
        {tr(c.branchCfgBack)}
      </Link>

      {/* Header: name + on/off */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          {editing ? (
            <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={cn(input, 'min-w-0 flex-1 text-lg font-bold')} />
          ) : (
            <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-extrabold text-foreground">{b.name}</h1>
          )}
          {editing ? (
            <>
              <button type="button" disabled={pending || !name.trim()} onClick={() => run(() => saveBranch({ id: b.id, name }), () => setEditing(false))} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
                <Check className="h-3.5 w-3.5" /> {tr(c.save)}
              </button>
              <button type="button" onClick={() => (setName(b.name), setEditing(false))} className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold">
                <X className="h-3.5 w-3.5" /> {tr(c.branchCancel)}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditing(true)} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary/40">
                {tr(c.rename)}
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => saveBranch({ id: b.id, name: b.name, active: !b.active }))} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', b.active ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground')}>
                {tr(b.active ? c.branchOn : c.branchOff)}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Price overrides */}
      <section className={card}>
        <h2 className="text-base font-bold">{tr(c.branchCfgPrices)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{detail.pricesReady ? tr(c.branchCfgPricesHint) : tr(c.branchCfgPricesOff)}</p>
        {detail.pricesReady && (
          <>
            {detail.prices.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{tr(c.branchCfgEmptyPrices)}</p>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,64px)_32px] items-center gap-2 px-1 sm:grid-cols-[minmax(0,1fr)_repeat(3,80px)_36px]">
                  <span />
                  <span className={cn(label, 'text-center')}>{tr(c.priceWeekday)}</span>
                  <span className={cn(label, 'text-center')}>{tr(c.priceWeekend)}</span>
                  <span className={cn(label, 'text-center')}>{tr(c.priceHoliday)}</span>
                  <span />
                </div>
                {detail.prices.map((p) => (
                  <PriceRow key={p.productId} row={p} branchId={b.id} pending={pending} run={run} />
                ))}
              </div>
            )}
            <AddPrice
              branchId={b.id}
              products={detail.products.filter((p) => !detail.prices.some((x) => x.productId === p.id))}
              pending={pending}
              run={run}
            />
          </>
        )}
      </section>

      {/* Per-branch stock */}
      <section className={card}>
        <h2 className="text-base font-bold">{tr(c.branchCfgStock)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{detail.stockReady ? tr(c.branchCfgStockHint) : tr(c.branchCfgStockOff)}</p>
        {detail.stockReady && (
          <>
            {detail.stock.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{tr(c.branchCfgEmptyStock)}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {detail.stock.map((s) => (
                  <StockRow key={s.productId} row={s} branchId={b.id} pending={pending} run={run} />
                ))}
              </div>
            )}
            <AddStock
              branchId={b.id}
              products={detail.products.filter((p) => p.trackStock && !p.hasVariants && !detail.stock.some((x) => x.productId === p.id))}
              pending={pending}
              run={run}
            />
          </>
        )}
      </section>

      {/* Tablets on this branch */}
      <section className={card}>
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Tablet className="h-4 w-4" aria-hidden="true" /> {tr(c.branchCfgDevices)}
        </h2>
        {detail.devices.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{tr(c.branchCfgNoDevices)}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {detail.devices.map((d) => (
              <li key={d.id} className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold">
                {d.name}
              </li>
            ))}
          </ul>
        )}
        <Link href="/console/devices" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
          {tr(c.branchCfgManageDevices)}
        </Link>
      </section>
    </div>
  )
}

type Run = (task: () => Promise<{ ok: boolean }>, after?: () => void) => void

function PriceRow({ row, branchId, pending, run }: { row: BranchPriceRow; branchId: string; pending: boolean; run: Run }) {
  const { tr } = useLanguage()
  const [wd, setWd] = useState(row.weekday != null ? String(row.weekday) : '')
  const [we, setWe] = useState(row.weekend != null ? String(row.weekend) : '')
  const [ho, setHo] = useState(row.holiday != null ? String(row.holiday) : '')
  const save = () => run(() => setBranchPrice(row.productId, branchId, { weekday: num(wd), weekend: num(we), holiday: num(ho) }))
  const remove = () => run(() => setBranchPrice(row.productId, branchId, { weekday: null, weekend: null, holiday: null }))
  const f = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/\D/g, ''))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,64px)_32px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,80px)_36px]">
      <span className="truncate text-sm font-medium">{row.name}</span>
      <input className={cn(input, 'py-1 text-center')} inputMode="numeric" value={wd} onChange={f(setWd)} onBlur={save} aria-label={`${row.name} ${tr(c.priceWeekday)}`} />
      <input className={cn(input, 'py-1 text-center')} inputMode="numeric" value={we} onChange={f(setWe)} onBlur={save} aria-label={`${row.name} ${tr(c.priceWeekend)}`} />
      <input className={cn(input, 'py-1 text-center')} inputMode="numeric" value={ho} onChange={f(setHo)} onBlur={save} aria-label={`${row.name} ${tr(c.priceHoliday)}`} />
      <button type="button" disabled={pending} onClick={remove} aria-label={tr(c.branchCfgRemove)} title={tr(c.branchCfgRemove)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function StockRow({ row, branchId, pending, run }: { row: BranchStockRow; branchId: string; pending: boolean; run: Run }) {
  const { tr } = useLanguage()
  const [v, setV] = useState(String(row.stock))
  const save = () => run(() => setBranchStock(row.productId, branchId, num(v)))
  const remove = () => run(() => setBranchStock(row.productId, branchId, null))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_80px_32px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_96px_36px]">
      <span className="truncate text-sm font-medium">{row.name}</span>
      <input className={cn(input, 'py-1 text-center')} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} onBlur={save} aria-label={`${row.name} ${tr(c.branchCfgQty)}`} />
      <button type="button" disabled={pending} onClick={remove} aria-label={tr(c.branchCfgRemove)} title={tr(c.branchCfgRemove)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function AddPrice({ branchId, products, pending, run }: { branchId: string; products: BranchProduct[]; pending: boolean; run: Run }) {
  const { tr } = useLanguage()
  const [pid, setPid] = useState('')
  const [wd, setWd] = useState('')
  if (products.length === 0) return null
  const add = () => {
    if (!pid || wd.trim() === '') return
    run(() => setBranchPrice(pid, branchId, { weekday: Number(wd), weekend: null, holiday: null }), () => (setPid(''), setWd('')))
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <select value={pid} onChange={(e) => setPid(e.target.value)} className={cn(input, 'min-w-0 flex-1 py-2')}>
        <option value="">{tr(c.branchCfgPickProduct)}</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input className={cn(input, 'w-24 py-2 text-center')} inputMode="numeric" placeholder={tr(c.priceWeekday)} value={wd} onChange={(e) => setWd(e.target.value.replace(/\D/g, ''))} aria-label={tr(c.priceWeekday)} />
      <button type="button" disabled={pending || !pid || wd.trim() === ''} onClick={add} className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
        {tr(c.branchCfgAdd)}
      </button>
    </div>
  )
}

function AddStock({ branchId, products, pending, run }: { branchId: string; products: BranchProduct[]; pending: boolean; run: Run }) {
  const { tr } = useLanguage()
  const [pid, setPid] = useState('')
  const [v, setV] = useState('')
  if (products.length === 0) return null
  const add = () => {
    if (!pid || v.trim() === '') return
    run(() => setBranchStock(pid, branchId, Number(v)), () => (setPid(''), setV('')))
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <select value={pid} onChange={(e) => setPid(e.target.value)} className={cn(input, 'min-w-0 flex-1 py-2')}>
        <option value="">{tr(c.branchCfgPickProduct)}</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input className={cn(input, 'w-24 py-2 text-center')} inputMode="numeric" placeholder={tr(c.branchCfgQty)} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} aria-label={tr(c.branchCfgQty)} />
      <button type="button" disabled={pending || !pid || v.trim() === ''} onClick={add} className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
        {tr(c.branchCfgAdd)}
      </button>
    </div>
  )
}
