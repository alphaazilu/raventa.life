'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Gift, HandHelping, LogIn, Lock, LogOut, RotateCcw, Search, ShoppingBag, Undo2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { dismissToast, toast } from '@/components/ui/toast'
import { AvatarCircle } from '@/components/account/avatar-circle'
import { QrScanner } from '@/components/admin/qr-scanner'
import { BillBuilder } from '@/components/admin/bill-builder'
import { PackageList } from '@/components/package-list'
import { SearchInput } from '@/components/ui/search-input'
import { Spinner } from '@/components/ui/spinner'
import { deskCopy, deskErrors, fill } from '@/lib/check-in/copy'
import { bangkokTime, FLOOR_CAPACITY } from '@/lib/check-in/day'
import { formatMemberDate, formatMemberNo } from '@/lib/format-date'
import { receiptLabel } from '@/lib/console/catalog'
import { cn } from '@/lib/utils'
import { CASH_PATH, DESK_PATH } from '@/lib/auth/roles'
import { cashCopy } from '@/lib/cash'
import { isGift, type MemberPackage, type PackageItem } from '@/lib/packages'
import type { FloorVisit as FloorVisitT, DeskItem as DeskItemT } from '@/app/console/desk/actions'
import { cmCopy, cmErrors, type DeskCommission } from '@/lib/commission'
import { bkCopy, bkkHm } from '@/lib/booking'
import { waiverText } from '@/lib/legal/content'
import {
  cancelVisit,
  checkoutBill,
  reEnter,
  recordWaiver,
  checkOut,
  checkOutWithLoans,
  lendItems,
  redeemPackageItem,
  undoPackageItem,
  getDeskCatalog,
  getFloor,
  getMember,
  lookupByToken,
  searchMembers,
  voidSale,
  type BillInput,
  type BillLine,
  type CheckoutDone,
  type DeskCatalog,
  type DeskMember,
  type DeskResult,
  type Floor,
  type FloorVisit,
  type MemberHit,
  type PaymentMethod,
} from '@/app/console/desk/actions'

type Panel =
  | { kind: 'empty' }
  | { kind: 'hits'; hits: MemberHit[] }
  | { kind: 'member'; member: DeskMember }

const FLOOR_REFRESH_MS = 30_000

export function CheckInDesk({
  showTakings,
  initialFloor,
  initialError,
  initialMember = null,
  initialCatalog = null,
  initialView = 'desk',
  drawerWarn = false,
  commission = null,
  capacity = FLOOR_CAPACITY,
}: {
  // Day totals are for admins only; staff see each visit's method, not sums.
  showTakings: boolean
  initialFloor: Floor | null
  initialError: string | null
  initialMember?: DeskMember | null
  initialCatalog?: DeskCatalog
  initialView?: 'desk' | 'floor'
  // No cash drawer open (§30) — say so above the bill.
  drawerWarn?: boolean
  // Who earns commission and which items have a rate (§33, v0.34). null = off.
  commission?: DeskCommission
  capacity?: number // §45: in-store cap (admin setting)
}) {
  const { tr, lang } = useLanguage()
  const [panel, setPanel] = useState<Panel>(initialMember ? { kind: 'member', member: initialMember } : { kind: 'empty' })
  const [floor, setFloor] = useState<Floor | null>(initialFloor)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  // The last thing handed out from a package (§40) — can be taken back.
  const [lastUse, setLastUse] = useState<{ useId: string; memberId: string } | null>(null)
  // Checking lent items back at check-out (§44).
  const [loanCheckout, setLoanCheckout] = useState<FloorVisitT | null>(null)
  const [lendVisit, setLendVisit] = useState<FloorVisitT | null>(null)
  const [query, setQuery] = useState('')
  const [busy, startBusy] = useTransition()
  const [catalog, setCatalog] = useState<DeskCatalog>(initialCatalog)
  // Items staff may lend on the spot (§51).
  const lendables = (catalog?.items ?? []).filter((i) => i.lendable)
  // Bumped after each sale so a fresh, empty bill is shown.
  const [billKey, setBillKey] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  // 'floor' = who's in today (and check-outs), so the sale screen fits one screen.
  const [view, setView] = useState<'desk' | 'floor'>(initialView)
  // A booking's service put on the bill (§34): the lines, and which bookings.
  const [preset, setPreset] = useState<{ lines: BillLine[]; bookingIds: string[] }>({ lines: [], bookingIds: [] })
  // The tab is in the address (?tab=floor) so the side menu's sub-items
  // (v0.30.4) and this tab bar stay in step.
  const sp = useSearchParams()
  const urlView = sp.get('tab') ?? sp.get('view')
  useEffect(() => {
    const v = urlView === 'floor' ? 'floor' : 'desk'
    setView((cur) => (cur === v ? cur : v))
  }, [urlView])
  const go = (v: 'desk' | 'floor') => {
    setView(v)
    try {
      window.history.replaceState(null, '', v === 'floor' ? `${DESK_PATH}?tab=floor` : DESK_PATH)
    } catch {}
  }

  const errText = (code: string) => tr(deskErrors[code] ?? cmErrors[code] ?? deskErrors.failed)

  const refreshFloor = useCallback(async () => {
    const res = await getFloor()
    if (res.ok) setFloor(res.data)
  }, [])

  useEffect(() => {
    const id = setInterval(refreshFloor, FLOOR_REFRESH_MS)
    return () => clearInterval(id)
  }, [refreshFloor])

  useEffect(() => {
    if (!lastUse) return
    const id = setTimeout(() => setLastUse(null), 60_000)
    return () => clearTimeout(id)
  }, [lastUse])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(id)
  }, [notice])

  const run = <T,>(task: () => Promise<DeskResult<T>>, onOk: (data: T) => void) => {
    startBusy(async () => {
      setError(null)
      const res = await task()
      if (res.ok) onOk(res.data)
      else setError(res.error)
    })
  }

    const showMember = (member: DeskMember) => {
    setPreset((p) => (p.bookingIds.length || p.lines.length ? { lines: [], bookingIds: [] } : p))
    setPanel({ kind: 'member', member })
    setLastUse((u) => (u && u.memberId === member.id ? u : null))
    setSearchOpen(false)
    setQuery('')
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
  }

  const handleCode = (text: string) => {
    if (busy) return
    const token = text.trim()
    if (!token.startsWith('RV1.')) {
      setError('qr_invalid')
      return
    }
    // The per-bill referrer scan is gone (v0.36): referrals are given when
    // a member signs up, and earn on their first bill.
    run(() => lookupByToken(token), showMember)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    // A USB/Bluetooth scanner "types" the code and presses Enter.
    if (q.startsWith('RV1.')) {
      setQuery('')
      handleCode(q)
      return
    }
    run(
      () => searchMembers(q),
      (hits) => {
        if (hits.length === 1) run(() => getMember(hits[0].id), showMember)
        else {
          setPanel({ kind: 'hits', hits })
          setSearchOpen(false)
        }
      },
    )
  }

  const reset = () => {
    setPanel({ kind: 'empty' })
    setError(null)
    closeSearch()
  }

  const reloadMember = (id: string) => run(() => getMember(id), showMember)

  const afterChange = () => {
    void refreshFloor()
    void getDeskCatalog().then((r) => r.ok && setCatalog(r.data))
    setBillKey((k) => k + 1)
  }

  const pay = (
    memberId: string | null,
    bill: Omit<BillInput, 'memberId'> & { paymentMethod: PaymentMethod | null; wristband: string; lineStaff: Record<string, string>; lends: { itemId: string; qty: number }[] },
  ) =>
    run(
      () => {
        const { lineStaff, ...rest } = bill
        return checkoutBill({
          memberId,
          ...rest,
          commission: commission ? { lineStaff } : undefined,
          bookingIds: preset.bookingIds,
        })
      },
      (done: CheckoutDone) => {
        const receipt = done.receiptNo ? ` · ${tr(deskCopy.receipt)} ${receiptLabel(done.receiptNo)}` : ''
        if (done.member) {
          showMember(done.member)
          setNotice(`${tr(deskCopy.doneCheckIn)} · ${done.member.name}${receipt}`)
        } else {
          setNotice(`${tr(deskCopy.doneSale)} ${done.total.toLocaleString()} ${tr(deskCopy.baht)}${receipt}`)
        }
        setPreset({ lines: [], bookingIds: [] })
        afterChange()
      },
    )

  // "Done" messages and errors float as toasts (v0.38.32) so the sell screen
  // never shifts. A package hand-out keeps its Undo for 60 s.
  useEffect(() => {
    if (!notice) return
    const u = lastUse
    toast({
      id: 'desk-notice',
      text: notice,
      duration: u ? 60_000 : 3500,
      action: u
        ? {
            label: tr(deskCopy.undo),
            onClick: () => {
              dismissToast('desk-notice')
              run(
                () => undoPackageItem(u.useId),
                () => {
                  setLastUse(null)
                  setNotice(tr(deskCopy.doneUndo))
                  reloadMember(u.memberId)
                },
              )
            },
          }
        : undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice, lastUse])
  useEffect(() => {
    if (error) toast({ id: 'desk-error', kind: 'error', text: errText(error) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const member = panel.kind === 'member' ? panel.member : null
  const inside = floor?.visits.filter((v) => !v.checkedOutAt).length ?? 0
  // Right side: the member's bill (Day Pass + items) when they can check in;
  // otherwise items only — for a walk-up, or a member already in today.
  const memberBill = member && !member.isSelf && !member.today

  return (
    <div className="w-full px-4 py-3 md:px-6 md:py-4 xl:px-8">
      {/* The console bar shows the tab name and who is working. */}
      <h1 className="sr-only">{tr(deskCopy.title)}</h1>

      <div className="mb-3 inline-flex rounded-full bg-secondary p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => go('desk')}
          className={cn('rounded-full px-4 py-1.5', view === 'desk' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
        >
          {tr(deskCopy.tabDesk)}
        </button>
        <button
          type="button"
          onClick={() => go('floor')}
          className={cn('rounded-full px-4 py-1.5', view === 'floor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
        >
          {tr(deskCopy.tabFloor)} ({inside}/{capacity})
        </button>
      </div>

      {drawerWarn && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
          <span className="min-w-0 flex-1">{tr(cashCopy.sellWarn)}</span>
          <Link href={CASH_PATH} className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
            {tr(cashCopy.sellWarnLink)}
          </Link>
        </div>
      )}


      {view === 'floor' ? (
        <FloorPanel
          floor={floor}
          capacity={capacity}
          showTakings={showTakings}
          busy={busy}
          onRefresh={() => startBusy(refreshFloor)}
          onOpen={(id) => {
            go('desk')
            run(() => getMember(id), showMember)
          }}
          onReEnter={(v) =>
            run(
              () => reEnter(v.id),
              () => {
                setNotice(`${tr(deskCopy.doneReEnter)} · ${v.name}`)
                void refreshFloor()
                if (member && member.id === v.memberId) reloadMember(member.id)
              },
            )
          }
          onCheckOut={(v) =>
            v.loans && v.loans.length > 0
              ? setLoanCheckout(v)
              : run(
                  () => checkOut(v.id),
                  () => {
                    setNotice(`${tr(deskCopy.doneCheckOut)} · ${v.name}`)
                    void refreshFloor()
                    if (member && member.id === v.memberId) reloadMember(member.id)
                  },
                )
          }
          onLend={(v) => setLendVisit(v)}
          canLend={lendables.length > 0}
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[17rem_minmax(0,1fr)] lg:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[22rem_minmax(0,1fr)]">
          {/* Left: who — round camera, or the guest's photo once scanned.
              From md up it stays pinned under the top bar while the bill scrolls (v0.30.1);
              if the guest's details are taller than the screen, this side scrolls on its own. */}
          <div className="relative md:sticky md:top-[69px] xl:top-[77px]">
            <section className="relative rounded-2xl border border-border bg-card p-4 md:max-h-[calc(100dvh-81px)] md:overflow-y-auto md:overscroll-contain xl:max-h-[calc(100dvh-89px)]">
              <div id="desk-scanner" className="relative mx-auto w-full max-w-[15rem]">
                <QrScanner
                  round
                  hint={null}
                  onCode={handleCode}
                  paused={busy || searchOpen || member !== null}
                  pausedText={tr(deskCopy.scanChecking)}
                  cover={member ? <AvatarCircle src={member.avatarUrl} name={member.name} className="h-full w-full text-6xl" /> : undefined}
                  corner={
                    member ? (
                      <CornerButton label={tr(deskCopy.nextGuest)} onClick={reset}>
                        <RotateCcw className="h-5 w-5" aria-hidden="true" />
                      </CornerButton>
                    ) : (
                      <CornerButton label={tr(deskCopy.searchButton)} onClick={() => setSearchOpen(true)}>
                        <Search className="h-5 w-5" aria-hidden="true" />
                      </CornerButton>
                    )
                  }
                />
                {searchOpen && !member && (
                  <form
                    onSubmit={handleSearch}
                    className="absolute inset-x-[-0.5rem] top-[35%] z-20 rounded-2xl border border-border bg-card p-3 shadow-xl"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">{tr(deskCopy.searchHeading)}</span>
                      <button type="button" onClick={closeSearch} aria-label={tr(deskCopy.searchClose)} className="text-muted-foreground">
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <SearchInput
                      value={query}
                      onChange={setQuery}
                      placeholder={tr(deskCopy.searchPlaceholder)}
                      clearLabel={tr(deskCopy.clearSearch)}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={busy || !query.trim()}
                      className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-40"
                    >
                      <Search className="h-4 w-4" aria-hidden="true" />
                      {tr(deskCopy.searchButton)}
                    </button>
                  </form>
                )}
              </div>

              <div className="mt-4">
                {member ? (
                  <MemberInfo
                    member={member}
                    busy={busy}
                    added={preset.bookingIds}
                    onAddBooking={(b) => {
                      if (!b.productId || preset.bookingIds.includes(b.id)) return
                      const lines = [...preset.lines]
                      const i = lines.findIndex((l) => l.productId === b.productId && l.variantId === null)
                      if (i >= 0) lines[i] = { ...lines[i], qty: Math.min(99, lines[i].qty + 1) }
                      else lines.push({ productId: b.productId, variantId: null, qty: 1 })
                      setPreset({ lines, bookingIds: [...preset.bookingIds, b.id] })
                      setBillKey((k) => k + 1)
                    }}
                    onUseItem={(_, x) =>
                      run(
                        () => redeemPackageItem(x.id),
                        (d) => {
                          const name = lang === 'en' ? x.nameEn : x.name
                          setNotice(fill(tr(deskCopy.doneUseItem), { name, n: d.left === null ? tr(deskCopy.pkgItemUnlimited) : d.left }))
                          setLastUse({ useId: d.useId, memberId: member.id })
                          reloadMember(member.id)
                        },
                      )
                    }
                    onCheckOut={(v) =>
                      v.loans && v.loans.length > 0
                        ? setLoanCheckout(v)
                        : run(
                            () => checkOut(v.id),
                            () => {
                              setNotice(`${tr(deskCopy.doneCheckOut)} · ${member.name}`)
                              reloadMember(member.id)
                              void refreshFloor()
                            },
                          )
                    }
                    onLend={(v) => setLendVisit(v)}
                    canLend={lendables.length > 0}
                    onWaiver={() =>
                      run(
                        () => recordWaiver(member.id),
                        () => {
                          setNotice(`${tr(deskCopy.waiverDone)} · ${member.name}`)
                          reloadMember(member.id)
                        },
                      )
                    }
                    onReEnter={(visitId) =>
                      run(
                        () => reEnter(visitId),
                        () => {
                          setNotice(`${tr(deskCopy.doneReEnter)} · ${member.name}`)
                          reloadMember(member.id)
                          void refreshFloor()
                        },
                      )
                    }
                    onCancel={(visit, reason) =>
                      run(
                        () => (visit.saleId ? voidSale(visit.saleId, reason) : cancelVisit(visit.id, reason)),
                        () => {
                          setNotice(`${tr(visit.saleId ? deskCopy.doneVoid : deskCopy.doneCancel)} · ${member.name}`)
                          reloadMember(member.id)
                          afterChange()
                        },
                      )
                    }
                  />
                ) : panel.kind === 'hits' ? (
                  <HitList hits={panel.hits} onPick={(id) => run(() => getMember(id), showMember)} onBack={reset} />
                ) : (
                  <p className="text-center text-sm text-muted-foreground">{tr(deskCopy.emptyPanel)}</p>
                )}
              </div>
            </section>
            {/* Outside the scrolling box so it always covers what is on screen. */}
            {busy && (
              <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-card/50">
                <Spinner className="h-6 w-6 text-primary" />
              </div>
            )}
          </div>

          {/* Right: the bill. */}
          {/* Fills the screen height, so the pay button always sits at the very bottom. */}
          <section className="flex scroll-mt-4 flex-col rounded-2xl border border-border bg-card p-4 md:min-h-[calc(100dvh-9.5rem)] md:p-5">
            <BillBuilder
                title={memberBill ? tr(deskCopy.billHeading) : tr(deskCopy.sellOnlyHeading)}
                subtitle={
                  memberBill
                    ? member.name
                    : member && !member.isSelf
                      ? tr(deskCopy.sellToMemberHint)
                      : tr(deskCopy.sellOnlyHint)
                }
                key={`${memberBill ? member.id : member && !member.isSelf ? `items-${member.id}` : 'walkup'}-${billKey}`}
                initialLines={preset.lines}
                memberId={member && !member.isSelf ? member.id : null}
                withDayPass={Boolean(memberBill)}
                rewardReady={(member?.stamps?.rewardsAvailable ?? 0) > 0}
                packageReady={Boolean(memberBill && member.packageToday)}
                packageIsGift={Boolean(member?.packages.some((k) => k.id === member.packageToday && isGift(k)))}
                catalog={catalog}
                busy={busy}
                /* Commission is admin business — never shown or picked at the
                   counter (§33). It's still worked out automatically server-side
                   (the member's referrer on their first bill, or the set rules). */
                commission={null}
              onPay={(bill) => pay(member && !member.isSelf ? member.id : null, bill)}
              hint={
                !catalog || (catalog.items.length === 0 && !memberBill) ? (
                  <p className="mb-3 rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                <ShoppingBag className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                {tr(catalog ? deskCopy.noItems : deskCopy.catalogNotSetUp)}
              </p>
                ) : null
              }
            />
          </section>
        </div>
      )}

      {loanCheckout && (
        <LoanCheckout
          visit={loanCheckout}
          busy={busy}
          onClose={() => setLoanCheckout(null)}
          onConfirm={(returnedIds, chargeIds, method) => {
            const v = loanCheckout
            run(
              () => checkOutWithLoans(v.id, returnedIds, chargeIds, method),
              (res) => {
                setLoanCheckout(null)
                const extra = res.chargedTotal > 0 ? ` · ${tr(deskCopy.charged)} ${res.chargedTotal.toLocaleString()}` : ''
                const left = res.outstanding > 0 ? ` · ${tr(deskCopy.stillOut)} ${res.outstanding}` : ''
                setNotice(`${tr(deskCopy.doneCheckOut)} · ${v.name}${extra}${left}`)
                void refreshFloor()
                if (member && member.id === v.memberId) reloadMember(member.id)
              },
            )
          }}
        />
      )}

      {lendVisit && (
        <LendModal
          visit={lendVisit}
          items={lendables}
          busy={busy}
          onClose={() => setLendVisit(null)}
          onConfirm={(picked) => {
            const v = lendVisit
            run(
              () => lendItems(v.id, picked),
              () => {
                setLendVisit(null)
                setNotice(`${tr(deskCopy.doneLend)} · ${v.name}`)
                void refreshFloor()
                if (member && member.id === v.memberId) reloadMember(member.id)
              },
            )
          }}
        />
      )}
    </div>
  )
}

// Lend flagged items to someone in the shop (§51, v0.38.11). Pick items and a
// quantity; they come back at check-out like any other loan.
function LendModal({
  visit,
  items,
  busy,
  onClose,
  onConfirm,
}: {
  visit: FloorVisitT
  items: DeskItemT[]
  busy: boolean
  onClose: () => void
  onConfirm: (picked: { itemId: string; qty: number }[]) => void
}) {
  const { tr, lang } = useLanguage()
  const [qty, setQty] = useState<Record<string, number>>({})
  const picked = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([itemId, n]) => ({ itemId, qty: n }))
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-card-foreground">
          {tr(deskCopy.lend)} · {visit.name}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{tr(deskCopy.lendHint)}</p>
        <ul className="mt-3 divide-y divide-border">
          {items.map((it) => {
            const n = qty[it.id] ?? 0
            const set = (val: number) => setQty((m) => ({ ...m, [it.id]: Math.max(0, Math.min(99, val)) }))
            return (
              <li key={it.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{lang === 'en' ? it.name.en : it.name.th}</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => set(n - 1)} disabled={n <= 0} className="h-7 w-7 rounded-full border border-border text-sm font-bold disabled:opacity-30">
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{n}</span>
                  <button type="button" onClick={() => set(n + 1)} className="h-7 w-7 rounded-full border border-border text-sm font-bold">
                    +
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-full border border-border text-sm font-semibold">
            {tr(deskCopy.lendCancel)}
          </button>
          <button
            type="button"
            disabled={busy || picked.length === 0}
            onClick={() => onConfirm(picked)}
            className="h-11 flex-1 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {tr(deskCopy.lendConfirm)}
          </button>
        </div>
      </div>
    </div>
  )
}

// Check-out when items were lent (§44): tick what came back; the rest are
// kept outstanding, or billed as lost (then a payment method is needed).
function LoanCheckout({
  visit,
  busy,
  onClose,
  onConfirm,
}: {
  visit: FloorVisitT
  busy: boolean
  onClose: () => void
  onConfirm: (returnedIds: string[], chargeIds: string[], method: PaymentMethod | null) => void
}) {
  const { tr, lang } = useLanguage()
  const loans = visit.loans ?? []
  // Same item lent several times shows as one row ("ผ้าขนหนู ×3"), not three
  // ×1 rows — easier for staff at check-out. The pick applies to the whole
  // group and, on confirm, each underlying loan id gets that pick.
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; name: string; nameEn: string; qty: number; ids: string[] }>()
    for (const l of loans) {
      const key = `${l.name}\u0000${l.nameEn}`
      const g = m.get(key) ?? { key, name: l.name, nameEn: l.nameEn, qty: 0, ids: [] }
      g.qty += l.qty
      g.ids.push(l.id)
      m.set(key, g)
    }
    return [...m.values()]
  }, [loans])
  // Each group: 'back' (returned) | 'out' (keep outstanding) | 'charge' (bill it).
  const [choice, setChoice] = useState<Record<string, 'back' | 'out' | 'charge'>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, 'back'])),
  )
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const chargeIds = groups.filter((g) => choice[g.key] === 'charge').flatMap((g) => g.ids)
  const returnedIds = groups.filter((g) => choice[g.key] === 'back').flatMap((g) => g.ids)
  const needMethod = chargeIds.length > 0
  const canConfirm = !busy && (!needMethod || method !== null)
  const opt: { k: 'back' | 'out' | 'charge'; label: { th: string; en: string } }[] = [
    { k: 'back', label: deskCopy.loanBack },
    { k: 'out', label: deskCopy.loanOut },
    { k: 'charge', label: deskCopy.loanCharge },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-card p-5 shadow-xl">
        <h2 className="font-display text-lg font-extrabold text-foreground">{tr(deskCopy.returnTitle)}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {visit.name}
          {visit.locker ? ` · ${tr(deskCopy.locker)} ${visit.locker}` : ''}
        </p>
        <ul className="mt-3 space-y-2">
          {groups.map((g) => (
            <li key={g.key} className="rounded-2xl border border-border p-3">
              <p className="text-sm font-semibold">
                {(lang === 'en' ? g.nameEn : g.name)} ×{g.qty}
              </p>
              <div className="mt-2 flex gap-1.5">
                {opt.map((o) => (
                  <button
                    key={o.k}
                    type="button"
                    onClick={() => setChoice((c) => ({ ...c, [g.key]: o.k }))}
                    className={cn(
                      'flex-1 rounded-full border px-2 py-1.5 text-xs font-semibold',
                      choice[g.key] === o.k
                        ? o.k === 'charge'
                          ? 'border-destructive bg-destructive/10 text-destructive'
                          : o.k === 'out'
                            ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            : 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {tr(o.label)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {needMethod && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground">{tr(deskCopy.chargeMethod)}</p>
            <div className="mt-1 flex gap-1.5">
              {(['cash', 'transfer', 'card'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn('flex-1 rounded-full border px-2 py-2 text-xs font-semibold', method === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}
                >
                  {tr(deskCopy[m])}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(returnedIds, chargeIds, method)}
            className="h-11 flex-1 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {tr(deskCopy.returnAndOut)}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-full border border-border text-sm font-semibold">
            {tr(deskCopy.cancelBack)}
          </button>
        </div>
      </div>
    </div>
  )
}

function CornerButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-md"
    >
      {children}
    </button>
  )
}

function HitList({ hits, onPick, onBack }: { hits: MemberHit[]; onPick: (id: string) => void; onBack: () => void }) {
  const { tr } = useLanguage()
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-card-foreground">{tr(deskCopy.resultsHeading)}</h2>
        <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          {tr(deskCopy.nextGuest)}
        </button>
      </div>
      {hits.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{tr(deskCopy.noResults)}</p>
      ) : (
        <ul className="divide-y divide-border">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onPick(h.id)}
                className="flex w-full items-center gap-3 py-3 text-left hover:bg-secondary/60"
              >
                <AvatarCircle src={h.avatarUrl} name={h.name} className="h-10 w-10 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-card-foreground">{h.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatMemberNo(h.memberNo)}
                    {h.phone ? ` · ${maskPhone(h.phone)}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Enough to tell two people apart when reading back to the guest, without
// putting the whole number on a screen others can see.
function maskPhone(phone: string): string {
  return phone.length > 4 ? `•••${phone.slice(-4)}` : phone
}

// Loan note shown on cards: same item merged into one "name ×total".
function loanSummary(loans: { name: string; nameEn: string; qty: number }[], lang: 'th' | 'en'): string {
  const m = new Map<string, { name: string; qty: number }>()
  for (const l of loans) {
    const label = lang === 'en' ? l.nameEn : l.name
    const g = m.get(label) ?? { name: label, qty: 0 }
    g.qty += l.qty
    m.set(label, g)
  }
  return [...m.values()].map((g) => `${g.name} ×${g.qty}`).join(' · ')
}

// Health-risk waiver (§54, v0.42.1): shown until staff confirm the guest
// accepted the current version. Doesn't block the check-in itself.
function WaiverCard({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const { tr } = useLanguage()
  const [ticked, setTicked] = useState(false)
  return (
    <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-left">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">{tr(waiverText.title)}</p>
      <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">{tr(deskCopy.waiverNeeded)}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-card-foreground">
        {waiverText.points.map((pt, i) => (
          <li key={i}>{tr(pt)}</li>
        ))}
      </ul>
      <label className="mt-2.5 flex items-start gap-2 text-sm font-semibold text-card-foreground">
        <input
          type="checkbox"
          checked={ticked}
          onChange={(e) => setTicked(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary"
        />
        <span>{tr(waiverText.confirm)}</span>
      </label>
      <button
        type="button"
        disabled={!ticked || busy}
        onClick={onConfirm}
        className="mt-2.5 inline-flex h-9 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {tr(deskCopy.waiverSave)}
      </button>
    </div>
  )
}

function MemberInfo({
  member,
  busy,
  added,
  onAddBooking,
  onUseItem,
  onCheckOut,
  onReEnter,
  onCancel,
  onLend,
  canLend,
  onWaiver,
}: {
  member: DeskMember
  busy: boolean
  added: string[]
  onAddBooking: (b: DeskMember['bookingsToday'][number]) => void
  onUseItem: (k: MemberPackage, x: PackageItem) => void
  onCheckOut: (v: FloorVisitT) => void
  onReEnter: (visitId: string) => void
  onCancel: (visit: NonNullable<DeskMember['today']>, reason: string) => void
  onLend: (v: FloorVisitT) => void
  canLend: boolean
  onWaiver: () => void
}) {
  const { tr, lang } = useLanguage()
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')

  // New member on the panel → clear the form.
  useEffect(() => {
    setCancelling(false)
    setReason('')
  }, [member.id, member.today?.id])

  const since = formatMemberDate(member.joinedAt, lang, false)
  const visit = member.today
  // Shape today's visit like a floor row so check-out / lend reuse the same
  // loan-aware flow (return modal, lend modal) as the floor list.
  const floorVisit: FloorVisitT | null = visit
    ? { ...visit, memberId: member.id, memberNo: member.memberNo, name: member.name }
    : null
  const rewardReady = (member.stamps?.rewardsAvailable ?? 0) > 0

  return (
    <div>
      <div className="text-center">
        <p className="font-display text-xl font-bold leading-tight text-card-foreground">{member.name}</p>
        <p className="mt-0.5 font-mono text-sm tracking-wider text-primary">{formatMemberNo(member.memberNo)}</p>
        {since && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tr(deskCopy.memberSince)} {since}
          </p>
        )}
        <p className="mt-0.5 text-xs font-semibold text-secondary-foreground">
          {member.history.count === 0
            ? tr(deskCopy.historyFirst)
            : `${tr(deskCopy.historyCount).replace('{n}', String(member.history.count))} · ${tr(deskCopy.historyLast)} ${formatMemberDate(member.history.last, lang, true) ?? '—'}`}
        </p>
        {member.role !== 'customer' && (
          <span className="mt-1.5 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            {tr(member.role === 'admin' ? deskCopy.roleAdmin : deskCopy.roleStaff)}
          </span>
        )}
      </div>

      {member.waiver && !member.waiver.ok && !member.isSelf && <WaiverCard key={member.id} busy={busy} onConfirm={onWaiver} />}

      {member.bookingsToday.length > 0 && (
        <div className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">{tr(bkCopy.deskToday)}</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {member.bookingsToday.map((b) => {
              const isAdded = added.includes(b.id)
              return (
                <li key={b.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {b.wholeDay ? (b.arriveTime ? `~${b.arriveTime}` : tr(bkCopy.allDay)) : bkkHm(b.start)} {tr(b.name)}
                    </span>
                    {b.with && <span className="block truncate text-xs text-muted-foreground">{b.with}</span>}
                  </span>
                  {b.status === 'arrived' ? (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">{tr(bkCopy.markArrived)}</span>
                  ) : b.productId && !member.isSelf ? (
                    <button
                      type="button"
                      disabled={busy || isAdded}
                      onClick={() => onAddBooking(b)}
                      className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', isAdded ? 'bg-accent/15 text-accent' : 'bg-primary text-primary-foreground')}
                    >
                      {tr(isAdded ? bkCopy.added : bkCopy.addToBill)}
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {member.stamps && <StampRow progress={member.stamps.progress} rewardReady={rewardReady} />}
      <PackageList
        packages={member.packages}
        useToday={member.today ? null : member.packageToday}
        onUseItem={member.isSelf ? undefined : onUseItem}
        busy={busy}
        className="mt-3"
      />

      {member.isSelf ? (
        <p className="mt-4 rounded-2xl bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
          {tr(deskCopy.selfWarning)}
        </p>
      ) : (
        visit && (
          <div className="mt-4">
            <div
              className={cn(
                'rounded-2xl px-4 py-3 text-sm',
                visit.checkedOutAt ? 'bg-secondary text-secondary-foreground' : 'bg-accent/15 text-card-foreground',
              )}
            >
              <p className="font-semibold">{visit.checkedOutAt ? tr(deskCopy.visitedToday) : tr(deskCopy.inStoreNow)}</p>
              <p className="mt-1 text-muted-foreground">
                {tr(deskCopy.checkedInAt)} {bangkokTime(visit.checkedInAt)}
                {visit.checkedOutAt && ` · ${tr(deskCopy.checkedOutAt)} ${bangkokTime(visit.checkedOutAt)}`}
                {visit.wristband && ` · ${tr(deskCopy.wristband)} ${visit.wristband}`}
                {' · '}
                {visit.entryType === 'reward'
                  ? tr(deskCopy.free)
                  : visit.entryType === 'package'
                    ? tr(deskCopy.packageLabel)
                    : `${visit.price.toLocaleString()} ${tr(deskCopy.baht)} (${tr(deskCopy[visit.paymentMethod ?? 'cash'])})`}
              </p>
              {visit.loans && visit.loans.length > 0 && !visit.checkedOutAt && (
                <p className="mt-1 font-medium text-accent">
                  {tr(deskCopy.onLoan)}: {loanSummary(visit.loans, lang)}
                </p>
              )}
            </div>

            {cancelling ? (
              <div className="mt-3 rounded-2xl border border-destructive/30 p-3">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={tr(deskCopy.cancelReason)}
                  aria-label={tr(deskCopy.cancelReason)}
                  autoFocus
                  className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-destructive"
                />
                <p className="mt-2 text-xs text-muted-foreground">{tr(visit.saleId ? deskCopy.voidHint : deskCopy.cancelHint)}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !reason.trim()}
                    onClick={() => onCancel(visit, reason)}
                    className="h-11 flex-1 rounded-full bg-destructive text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {tr(deskCopy.cancelConfirm)}
                  </button>
                  <button type="button" onClick={() => setCancelling(false)} className="h-11 flex-1 rounded-full border border-border text-sm font-semibold">
                    {tr(deskCopy.cancelBack)}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {visit.checkedOutAt && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onReEnter(visit.id)}
                    title={tr(deskCopy.reEnterHint)}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    {tr(deskCopy.reEnter)}
                  </button>
                )}
                {!visit.checkedOutAt && floorVisit && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCheckOut(floorVisit)}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {tr(visit.loans?.length ? deskCopy.returnAndOut : deskCopy.checkOut)}
                  </button>
                )}
                {!visit.checkedOutAt && canLend && floorVisit && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onLend(floorVisit)}
                    title={tr(deskCopy.lendHint)}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-accent/40 px-4 text-sm font-semibold text-accent disabled:opacity-40"
                  >
                    <HandHelping className="h-4 w-4" aria-hidden="true" />
                    {tr(deskCopy.lend)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCancelling(true)}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-muted-foreground hover:text-destructive"
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  {tr(visit.saleId ? deskCopy.voidBill : deskCopy.cancelVisit)}
                </button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

function StampRow({ progress, rewardReady }: { progress: number; rewardReady: boolean }) {
  const { tr } = useLanguage()
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr(deskCopy.stamps)}</span>
      <span className="flex gap-1" aria-label={`${progress}/10`}>
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn('h-3 w-3 rounded-full', i < progress ? 'bg-primary' : 'border border-border bg-background')}
          />
        ))}
      </span>
      <span className="text-sm font-semibold text-card-foreground">{progress}/10</span>
      {rewardReady && (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
          <Gift className="h-3.5 w-3.5" aria-hidden="true" />
          {tr(deskCopy.rewardReady)}
        </span>
      )}
    </div>
  )
}

function FloorPanel({
  floor,
  capacity,
  showTakings,
  busy,
  onRefresh,
  onOpen,
  onCheckOut,
  onReEnter,
  onLend,
  canLend,
}: {
  floor: Floor | null
  capacity: number
  showTakings: boolean
  busy: boolean
  onRefresh: () => void
  onOpen: (memberId: string) => void
  onCheckOut: (v: FloorVisit) => void
  onReEnter: (v: FloorVisit) => void
  onLend: (v: FloorVisit) => void
  canLend: boolean
}) {
  const { tr } = useLanguage()
  const visits = floor?.visits ?? []
  const inside = visits.filter((v) => !v.checkedOutAt)
  const left = visits.filter((v) => v.checkedOutAt)
  const takings = floor?.takings ?? { cash: 0, transfer: 0, card: 0, total: 0 }
  const free = visits.filter((v) => v.entryType === 'reward').length
  const total = takings.total
  const pct = Math.min(100, Math.round((inside.length / capacity) * 100))

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">{tr(deskCopy.floorHeading)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr(deskCopy.capacity)}{' '}
            <span className="font-display text-xl font-extrabold text-foreground">{inside.length}</span> / {capacity}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {tr(deskCopy.refresh)}
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn('h-full rounded-full', pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-loading')}
          style={{ width: `${pct}%` }}
        />
      </div>

      {showTakings ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {tr(deskCopy.takings)}{' '}
          <span className="font-semibold text-foreground">
            {total.toLocaleString()} {tr(deskCopy.baht)}
          </span>
          {' · '}
          {tr(deskCopy.cash)} {takings.cash.toLocaleString()} · {tr(deskCopy.transfer)} {takings.transfer.toLocaleString()} ·{' '}
          {tr(deskCopy.card)} {takings.card.toLocaleString()} · {tr(deskCopy.freeCount)} {free}
        </p>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {tr(deskCopy.takingsAdminOnly)} · {tr(deskCopy.freeCount)} {free}
        </p>
      )}

      {visits.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{tr(deskCopy.nobodyYet)}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {inside.map((v) => (
            <FloorRow key={v.id} v={v} busy={busy} onOpen={onOpen} onCheckOut={onCheckOut} onReEnter={onReEnter} onLend={onLend} canLend={canLend} />
          ))}
          {left.length > 0 && (
            <li className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tr(deskCopy.leftToday)} {left.length} {tr(deskCopy.people)}
            </li>
          )}
          {left.map((v) => (
            <FloorRow key={v.id} v={v} busy={busy} onOpen={onOpen} onCheckOut={onCheckOut} onReEnter={onReEnter} onLend={onLend} canLend={canLend} />
          ))}
        </ul>
      )}
    </section>
  )
}

function FloorRow({
  v,
  busy,
  onOpen,
  onCheckOut,
  onReEnter,
  onLend,
  canLend,
}: {
  v: FloorVisit
  busy: boolean
  onOpen: (memberId: string) => void
  onCheckOut: (v: FloorVisit) => void
  onReEnter: (v: FloorVisit) => void
  onLend: (v: FloorVisit) => void
  canLend: boolean
}) {
  const { tr, lang } = useLanguage()
  return (
    <li className={cn('flex items-center gap-3 py-2.5 text-sm', v.checkedOutAt && 'text-muted-foreground')}>
      <span className="w-12 shrink-0 font-mono text-xs">{bangkokTime(v.checkedInAt)}</span>
      <button
        type="button"
        disabled={!v.memberId}
        onClick={() => v.memberId && onOpen(v.memberId)}
        className="min-w-0 flex-1 truncate text-left font-medium hover:text-primary"
      >
        {v.name}
        <span className="ml-2 font-mono text-xs text-muted-foreground">{formatMemberNo(v.memberNo)}</span>
        {v.loans && v.loans.length > 0 && !v.checkedOutAt && (
          <span className="block truncate text-xs font-normal text-amber-700 dark:text-amber-400">
            {tr(deskCopy.onLoan)}: {loanSummary(v.loans, lang)}
          </span>
        )}
      </button>
      {v.wristband && <span className="hidden shrink-0 text-xs sm:inline">#{v.wristband}</span>}
      <span className="hidden shrink-0 text-xs sm:inline">
        {v.entryType === 'reward' ? tr(deskCopy.free) : v.entryType === 'package' ? tr(deskCopy.packageLabel) : tr(deskCopy[v.paymentMethod ?? 'cash'])}
      </span>
      {v.checkedOutAt ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs">→ {bangkokTime(v.checkedOutAt)}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReEnter(v)}
            title={tr(deskCopy.reEnterHint)}
            className="w-24 rounded-full border border-accent/40 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-40"
          >
            {tr(deskCopy.reEnter)}
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          {canLend && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onLend(v)}
              title={tr(deskCopy.lendTitle)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/40 disabled:opacity-40"
            >
              {tr(deskCopy.lend)}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onCheckOut(v)}
            className={cn(
              'rounded-full border py-1.5 text-xs font-semibold disabled:opacity-40',
              v.loans?.length
                ? 'border-amber-500/60 px-3 text-amber-800 hover:bg-amber-500/10 dark:text-amber-300'
                : 'w-24 border-border text-foreground hover:border-primary/40',
            )}
          >
            {tr(v.loans?.length ? deskCopy.returnAndOut : deskCopy.checkOut)}
          </button>
        </span>
      )}
    </li>
  )
}
