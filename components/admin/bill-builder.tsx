'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, Gift, Minus, Package as PackageIcon, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { deskCopy, deskErrors, fill } from '@/lib/check-in/copy'
import { cn } from '@/lib/utils'
import {
  quoteBill,
  type BillLine,
  type DayPassMode,
  type DeskCatalog,
  type DeskItem,
  type PaymentMethod,
  type Quote,
} from '@/app/console/desk/actions'

// One bill at the counter (v0.20): the member's Day Pass (paid or free)
// plus any extras, a promo code, one payment. The database prices it
// (pos_quote) — this screen only shows what the database says.
export function BillBuilder({
  title,
  subtitle,
  memberId,
  withDayPass,
  rewardReady,
  packageReady = false,
  packageIsGift = false,
  catalog,
  busy,
  onPay,
  hint,
  quoteFn = quoteBill,
}: {
  // Shown in the bill's pinned header next to the total.
  title: string
  subtitle: string
  memberId: string | null
  // false = walk-up sale (no member, no check-in)
  withDayPass: boolean
  rewardReady: boolean
  // The member has a package usable today (§21): check in with it by default.
  packageReady?: boolean
  // Today's visit would come from a gift a friend handed over (§23).
  packageIsGift?: boolean
  catalog: DeskCatalog
  busy: boolean
  onPay: (bill: {
    dayPass: DayPassMode
    items: BillLine[]
    code: string
    paymentMethod: PaymentMethod | null
    wristband: string
  }) => void
  // A note shown at the top of the bill (e.g. "no products yet").
  hint?: React.ReactNode
  // Injected only by design previews; the counter always asks the database.
  quoteFn?: typeof quoteBill
}) {
  const { tr, lang } = useLanguage()
  const startMode: DayPassMode = withDayPass ? (packageReady ? 'package' : 'paid') : 'none'
  const [dayPass, setDayPass] = useState<DayPassMode>(startMode)
  const [lines, setLines] = useState<BillLine[]>([])
  const [showItems, setShowItems] = useState(true)
  const [codeInput, setCodeInput] = useState('')
  const [code, setCode] = useState('')
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [wristband, setWristband] = useState('')
  const [picking, setPicking] = useState<DeskItem | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)
  const seq = useRef(0)

  const items = catalog?.items ?? []
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const name = (n: { th: string; en: string }) => (lang === 'en' ? n.en : n.th)

  // Re-price whenever the bill changes (latest answer wins).
  const key = JSON.stringify([memberId, dayPass, lines, code])
  useEffect(() => {
    if (dayPass === 'none' && lines.length === 0) {
      setQuote(null)
      setQuoteError(null)
      return
    }
    const mine = ++seq.current
    setQuoting(true)
    const t = setTimeout(async () => {
      const res = await quoteFn({ memberId, dayPass, items: lines, code })
      if (mine !== seq.current) return
      setQuoting(false)
      if (res.ok) {
        setQuote(res.data)
        setQuoteError(null)
      } else {
        // Keep the last good prices on screen; paying stays blocked.
        setQuoteError(res.error)
      }
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const add = (item: DeskItem, variantId: string | null) => {
    setPicking(null)
    setLines((ls) => {
      const i = ls.findIndex((l) => l.productId === item.id && l.variantId === variantId)
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: Math.min(99, l.qty + 1) } : l))
      return [...ls, { productId: item.id, variantId, qty: 1 }]
    })
  }
  const bump = (idx: number, d: number) =>
    setLines((ls) => ls.flatMap((l, j) => (j !== idx ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: Math.min(99, l.qty + d) }])))

  // "Clear bill": back to how it opened.
  const clear = () => {
    setDayPass(startMode)
    setLines([])
    setCode('')
    setCodeInput('')
    setMethod(null)
    setWristband('')
    setPicking(null)
  }
  const dirty = lines.length > 0 || code !== '' || codeInput !== '' || method !== null || wristband !== '' || dayPass !== startMode
  const hasBill = dayPass !== 'none' || lines.length > 0
  const count = lines.reduce((n, l) => n + l.qty, 0) + (dayPass !== 'none' ? 1 : 0)

  const lineLabel = (l: BillLine) => {
    const item = byId.get(l.productId)
    if (!item) return '—'
    const v = item.variants.find((x) => x.id === l.variantId)
    return v ? `${name(item.name)} · ${v.label}` : name(item.name)
  }

  const total = quote?.total ?? 0
  const needMethod = total > 0 || dayPass === 'paid'
  const canPay = Boolean(quote) && !quoting && !quoteError && (!needMethod || method !== null) && !busy
  const dayLabel =
    quote?.dayType === 'holiday' || catalog?.dayType === 'holiday'
      ? deskCopy.holiday
      : (quote?.dayType ?? catalog?.dayType) === 'weekend'
        ? deskCopy.weekend
        : deskCopy.weekday
  const passLine = quote?.lines.find((l) => l.kind === 'day_pass')
  const extraLines = quote?.lines.filter((l) => l.kind !== 'day_pass') ?? []

  const payLabel = quoteError
    ? tr(deskCopy.fixBill)
    : !quote
      ? tr(deskCopy.quoting)
    : needMethod && !method
      ? tr(deskCopy.chooseMethod)
      : total === 0 && dayPass !== 'none'
        ? tr(deskCopy.checkInFree)
        : fill(tr(dayPass === 'none' ? deskCopy.payOnly : deskCopy.payAndCheckIn), { price: total.toLocaleString() })

  const passModes: DayPassMode[] = [
    ...(packageReady ? (['package'] as const) : []),
    'paid',
    ...(rewardReady ? (['reward'] as const) : []),
    'none',
  ]

  return (
    <div className="flex flex-1 flex-col">
      {/* Pinned under the console bar: who, how many, and the total — always in view. */}
      <div className="sticky top-[57px] z-10 -mx-4 -mt-4 flex rounded-t-2xl items-start gap-3 border-b border-border bg-card/95 px-4 pt-4 pb-3 backdrop-blur md:-mx-5 md:-mt-5 md:px-5 md:pt-5 xl:top-[65px]">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold text-card-foreground">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {subtitle}
            {count > 0 && ` · ${fill(tr(deskCopy.itemCount), { n: count })}`}
          </p>
          {dirty && (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:border-destructive/40 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {tr(deskCopy.clearBill)}
            </button>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">{tr(deskCopy.totalDue)}</p>
          <p className="font-display text-3xl font-extrabold leading-tight text-foreground">
            {quoting ? <Spinner className="inline h-5 w-5 text-primary" /> : total.toLocaleString()}{' '}
            <span className="text-base font-bold">{tr(deskCopy.baht)}</span>
          </p>
          {quote && quote.discount > 0 && (
            <p className="text-xs font-semibold text-accent">
              {tr(deskCopy.discount)} −{quote.discount.toLocaleString()}
              {quote.promoName ? ` · ${quote.promoName}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
      {hint}
      {withDayPass && (
        <div className="rounded-2xl bg-secondary px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-secondary-foreground">
              {tr(deskCopy.dayPassToday)} ({tr(dayLabel)})
            </span>
            {dayPass === 'none' ? (
              <span className="text-sm font-semibold text-muted-foreground">{tr(deskCopy.notCheckingIn)}</span>
            ) : (
              <span className="font-display text-2xl font-extrabold text-foreground">
                {dayPass === 'reward' ? (
                  tr(deskCopy.free)
                ) : dayPass === 'package' ? (
                  tr(deskCopy.packageLabel)
                ) : (
                  <>
                    {passLine ? passLine.unitPrice.toLocaleString() : '…'} <span className="text-sm font-semibold">{tr(deskCopy.baht)}</span>
                  </>
                )}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={tr(deskCopy.dayPassToday)}>
            {passModes.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={dayPass === m}
                onClick={() => setDayPass(m)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold',
                  dayPass === m
                    ? m === 'none'
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-accent bg-accent text-white'
                    : 'border-border bg-background text-foreground',
                )}
              >
                {m === 'reward' && <Gift className="h-3.5 w-3.5" aria-hidden="true" />}
                {m === 'package' && <PackageIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                {m === 'none' && <Ban className="h-3.5 w-3.5" aria-hidden="true" />}
                {tr(m === 'paid' ? deskCopy.payForPass : m === 'reward' ? deskCopy.useReward : m === 'package' ? (packageIsGift ? deskCopy.useGift : deskCopy.usePackage) : deskCopy.noCheckIn)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Extras on the bill */}
      {lines.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
          {lines.map((l, idx) => {
            const priced = extraLines[idx]
            return (
              <li key={`${l.productId}|${l.variantId}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{lineLabel(l)}</span>
                <button type="button" onClick={() => bump(idx, -1)} aria-label="−" className="flex h-8 w-8 items-center justify-center rounded-full border border-border">
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span className="w-6 text-center font-semibold">{l.qty}</span>
                <button type="button" onClick={() => bump(idx, 1)} aria-label="+" className="flex h-8 w-8 items-center justify-center rounded-full border border-border">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span className="w-16 text-right font-semibold">{priced ? priced.lineTotal.toLocaleString() : '…'}</span>
                <button
                  type="button"
                  onClick={() => bump(idx, -l.qty)}
                  aria-label={tr(deskCopy.remove)}
                  title={tr(deskCopy.remove)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {catalog && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowItems((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:border-primary/40"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            {tr(showItems ? deskCopy.hideItems : deskCopy.addItems)}
          </button>
          {showItems &&
            (items.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{tr(deskCopy.noItems)}</p>
            ) : (
              // Many products scroll inside this box, so the total and the
              // pay button stay on screen.
              <div className="mt-2 grid max-h-[38dvh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {items.map((item) => {
                  const stock = item.variants.length > 0 ? item.variants.reduce((n, v) => n + v.stock, 0) : item.stock
                  const memberOnly = item.pkg !== null && !memberId
                  const out = (item.trackStock && stock <= 0) || memberOnly
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={out}
                      onClick={() => (item.variants.length > 0 ? setPicking(item) : add(item, null))}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                        picking?.id === item.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                        out && 'opacity-40',
                      )}
                    >
                      <span className="block truncate font-semibold">{name(item.name)}</span>
                      <span className="block text-xs text-primary">
                        {item.price.toLocaleString()} {tr(deskCopy.baht)}
                        {item.trackStock && (
                          <span className={cn('ml-1', stock < 5 ? 'text-destructive' : 'text-muted-foreground')}>
                            · {stock <= 0 ? tr(deskCopy.soldOut) : `${tr(deskCopy.left)} ${stock}`}
                          </span>
                        )}
                      </span>
                      {item.pkg && (
                        <span className="block text-[11px] text-muted-foreground">
                          {memberOnly
                            ? tr(deskCopy.pkgMemberOnly)
                            : fill(tr(deskCopy.pkgItem), {
                                v: item.pkg.visits === null ? tr(deskCopy.pkgUnlimited) : `${item.pkg.visits}×`,
                                d: item.pkg.days,
                              })}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          {picking && (
            <div className="mt-2 rounded-xl border border-primary/40 p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {tr(deskCopy.chooseVariant)} · {name(picking.name)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {picking.variants.map((v) => {
                  const out = picking.trackStock && v.stock <= 0
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={out}
                      onClick={() => add(picking, v.id)}
                      className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold hover:border-primary disabled:opacity-40"
                    >
                      {v.label}
                      {picking.trackStock && <span className="ml-1 text-xs font-normal text-muted-foreground">({out ? tr(deskCopy.soldOut) : v.stock})</span>}
                    </button>
                  )
                })}
                <button type="button" onClick={() => setPicking(null)} className="px-2 text-sm text-muted-foreground">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Promo code */}
      {catalog && (dayPass !== 'none' || lines.length > 0) && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setCode(codeInput.trim().toUpperCase())
          }}
        >
          <span className="relative min-w-0 flex-1">
            <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
              placeholder={tr(deskCopy.promoCode)}
              aria-label={tr(deskCopy.promoCode)}
              autoCapitalize="characters"
              className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm uppercase outline-none focus:border-primary"
            />
          </span>
          {code ? (
            <button
              type="button"
              onClick={() => {
                setCode('')
                setCodeInput('')
              }}
              className="h-10 rounded-full border border-border px-4 text-sm font-semibold"
            >
              {tr(deskCopy.clearCode)}
            </button>
          ) : (
            <button type="submit" disabled={!codeInput} className="h-10 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40">
              {tr(deskCopy.applyCode)}
            </button>
          )}
        </form>
      )}

      {quoteError && (
        <p role="alert" className="mt-3 rounded-2xl bg-destructive/10 px-4 py-2.5 text-sm font-semibold text-destructive">
          {tr(deskErrors[quoteError] ?? deskErrors.failed)}
        </p>
      )}

      {needMethod && (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr(deskCopy.paymentMethod)}</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label={tr(deskCopy.paymentMethod)}>
            {(['cash', 'transfer', 'card'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={cn(
                  'h-12 rounded-2xl border text-sm font-semibold transition-colors',
                  method === m
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:border-primary/40',
                )}
              >
                {tr(deskCopy[m])}
              </button>
            ))}
          </div>
        </>
      )}

      {dayPass !== 'none' && (
        <input
          value={wristband}
          onChange={(e) => setWristband(e.target.value)}
          placeholder={tr(deskCopy.wristbandPlaceholder)}
          aria-label={tr(deskCopy.wristband)}
          inputMode="numeric"
          maxLength={20}
          className="mt-3 h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary"
        />
      )}

      </div>

      <div className="h-4 shrink-0" />
      {/* Always at the bottom of the screen: pinned while the bill is long,
          pushed down by the full-height box while it's short. */}
      {hasBill && (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-auto rounded-b-2xl border-t border-border bg-card/95 px-4 pt-3 pb-4 backdrop-blur md:-mx-5 md:-mb-5 md:px-5 md:pb-5">
          <button
            type="button"
            disabled={!canPay}
            onClick={() => onPay({ dayPass, items: lines, code, paymentMethod: needMethod ? method : null, wristband })}
            className="h-14 w-full rounded-full bg-primary text-base font-bold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {payLabel}
          </button>
        </div>
      )}
    </div>
  )
}
