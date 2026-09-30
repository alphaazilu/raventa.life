'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, Gift, LogOut, RotateCcw, Search, Undo2, UserRound } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { AvatarCircle } from '@/components/account/avatar'
import { QrScanner } from '@/components/admin/qr-scanner'
import { Spinner } from '@/components/ui/spinner'
import { deskCopy, deskErrors, fill } from '@/lib/check-in/copy'
import { bangkokTime, FLOOR_CAPACITY } from '@/lib/check-in/day'
import { formatMemberDate, formatMemberNo } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import {
  cancelVisit,
  checkIn,
  checkOut,
  getFloor,
  getMember,
  lookupByToken,
  searchMembers,
  type DeskMember,
  type DeskResult,
  type Floor,
  type FloorVisit,
  type MemberHit,
  type PaymentMethod,
} from '@/app/admin/check-in/actions'

type Panel =
  | { kind: 'empty' }
  | { kind: 'hits'; hits: MemberHit[] }
  | { kind: 'member'; member: DeskMember }

const FLOOR_REFRESH_MS = 30_000

export function CheckInDesk({
  staffName,
  isAdmin,
  initialFloor,
  initialError,
  initialMember = null,
}: {
  staffName: string
  isAdmin: boolean
  initialFloor: Floor | null
  initialError: string | null
  initialMember?: DeskMember | null
}) {
  const { tr } = useLanguage()
  const [panel, setPanel] = useState<Panel>(initialMember ? { kind: 'member', member: initialMember } : { kind: 'empty' })
  const [floor, setFloor] = useState<Floor | null>(initialFloor)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busy, startBusy] = useTransition()

  const errText = (code: string) => tr(deskErrors[code] ?? deskErrors.failed)

  const refreshFloor = useCallback(async () => {
    const res = await getFloor()
    if (res.ok) setFloor(res.data)
  }, [])

  useEffect(() => {
    const id = setInterval(refreshFloor, FLOOR_REFRESH_MS)
    return () => clearInterval(id)
  }, [refreshFloor])

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

  const panelRef = useRef<HTMLElement>(null)
  const showMember = (member: DeskMember) => {
    setPanel({ kind: 'member', member })
    // On a phone the panel sits below the scanner — bring it into view.
    if (window.matchMedia('(max-width: 767px)').matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  const handleCode = (text: string) => {
    if (busy) return
    const token = text.trim()
    if (!token.startsWith('RV1.')) {
      setError('qr_invalid')
      return
    }
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
        else setPanel({ kind: 'hits', hits })
      },
    )
  }

  const reset = () => {
    setPanel({ kind: 'empty' })
    setError(null)
    setQuery('')
  }

  const reloadMember = (id: string) => run(() => getMember(id), showMember)

  const member = panel.kind === 'member' ? panel.member : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={isAdmin ? '/admin' : '/account'}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {tr(isAdmin ? deskCopy.backToAdmin : deskCopy.backToAccount)}
          </Link>
          <h1 className="font-display text-2xl font-extrabold text-foreground md:text-3xl">{tr(deskCopy.title)}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          <UserRound className="mr-1 inline h-4 w-4 align-[-3px]" aria-hidden="true" />
          {staffName}
        </p>
      </header>

      {notice && (
        <div role="status" className="mt-4 rounded-2xl bg-accent/15 px-4 py-3 text-sm font-semibold text-accent">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {errText(error)}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold text-card-foreground">{tr(deskCopy.scanHeading)}</h2>
          <QrScanner onCode={handleCode} paused={busy || member !== null} />

          <form onSubmit={handleSearch} className="mt-4 flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr(deskCopy.searchPlaceholder)}
              aria-label={tr(deskCopy.searchPlaceholder)}
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy || !query.trim()}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {tr(deskCopy.searchButton)}
            </button>
          </form>
        </section>

        <section
          ref={panelRef}
          className="relative min-h-[320px] scroll-mt-4 rounded-2xl border border-border bg-card p-4 md:p-5"
        >
          {busy && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-card/60">
              <Spinner className="h-6 w-6 text-primary" />
            </div>
          )}
          {panel.kind === 'empty' && (
            <div className="flex h-full min-h-[280px] items-center justify-center text-center text-sm text-muted-foreground">
              {tr(deskCopy.emptyPanel)}
            </div>
          )}
          {panel.kind === 'hits' && (
            <HitList
              hits={panel.hits}
              onPick={(id) => run(() => getMember(id), showMember)}
              onBack={reset}
            />
          )}
          {member && (
            <MemberPanel
              member={member}
              busy={busy}
              onNext={reset}
              onCheckIn={(entryType, paymentMethod, wristband) =>
                run(
                  () => checkIn({ memberId: member.id, entryType, paymentMethod, wristband }),
                  (m) => {
                    showMember(m)
                    setNotice(`${tr(deskCopy.doneCheckIn)} · ${m.name}`)
                    void refreshFloor()
                  },
                )
              }
              onCheckOut={(visitId) =>
                run(
                  () => checkOut(visitId),
                  () => {
                    setNotice(`${tr(deskCopy.doneCheckOut)} · ${member.name}`)
                    reloadMember(member.id)
                    void refreshFloor()
                  },
                )
              }
              onCancel={(visitId, reason) =>
                run(
                  () => cancelVisit(visitId, reason),
                  () => {
                    setNotice(`${tr(deskCopy.doneCancel)} · ${member.name}`)
                    reloadMember(member.id)
                    void refreshFloor()
                  },
                )
              }
            />
          )}
        </section>
      </div>

      <FloorPanel
        floor={floor}
        busy={busy}
        onRefresh={() => startBusy(refreshFloor)}
        onOpen={(id) => run(() => getMember(id), showMember)}
        onCheckOut={(v) =>
          run(
            () => checkOut(v.id),
            () => {
              setNotice(`${tr(deskCopy.doneCheckOut)} · ${v.name}`)
              void refreshFloor()
              if (member && member.id === v.memberId) reloadMember(member.id)
            },
          )
        }
      />
    </div>
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

function MemberPanel({
  member,
  busy,
  onNext,
  onCheckIn,
  onCheckOut,
  onCancel,
}: {
  member: DeskMember
  busy: boolean
  onNext: () => void
  onCheckIn: (entryType: 'paid' | 'reward', method: PaymentMethod | null, wristband: string) => void
  onCheckOut: (visitId: string) => void
  onCancel: (visitId: string, reason: string) => void
}) {
  const { tr, lang } = useLanguage()
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [wristband, setWristband] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')

  // New member on the panel → clear the form.
  useEffect(() => {
    setMethod(null)
    setWristband('')
    setCancelling(false)
    setReason('')
  }, [member.id, member.today?.id])

  const since = formatMemberDate(member.joinedAt, lang, false)
  const visit = member.today
  const rewardReady = (member.stamps?.rewardsAvailable ?? 0) > 0

  return (
    <div>
      <div className="flex items-start gap-4">
        <AvatarCircle src={member.avatarUrl} name={member.name} className="h-20 w-20 text-2xl md:h-24 md:w-24" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-bold text-card-foreground md:text-2xl">{member.name}</p>
          <p className="mt-0.5 font-mono text-sm tracking-wider text-primary">{formatMemberNo(member.memberNo)}</p>
          {since && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tr(deskCopy.memberSince)} {since}
            </p>
          )}
          {member.role !== 'customer' && (
            <span className="mt-1.5 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
              {tr(member.role === 'admin' ? deskCopy.roleAdmin : deskCopy.roleStaff)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:border-primary/40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {tr(deskCopy.nextGuest)}
        </button>
      </div>

      {member.stamps && <StampRow progress={member.stamps.progress} rewardReady={rewardReady} />}

      {member.isSelf ? (
        <p className="mt-5 rounded-2xl bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
          {tr(deskCopy.selfWarning)}
        </p>
      ) : visit ? (
        <div className="mt-5">
          <div
            className={cn(
              'rounded-2xl px-4 py-3 text-sm',
              visit.checkedOutAt ? 'bg-secondary text-secondary-foreground' : 'bg-accent/15 text-card-foreground',
            )}
          >
            <p className="font-semibold">
              {visit.checkedOutAt ? tr(deskCopy.visitedToday) : tr(deskCopy.inStoreNow)}
            </p>
            <p className="mt-1 text-muted-foreground">
              {tr(deskCopy.checkedInAt)} {bangkokTime(visit.checkedInAt)}
              {visit.checkedOutAt && ` · ${tr(deskCopy.checkedOutAt)} ${bangkokTime(visit.checkedOutAt)}`}
              {visit.wristband && ` · ${tr(deskCopy.wristband)} ${visit.wristband}`}
              {' · '}
              {visit.entryType === 'reward'
                ? tr(deskCopy.free)
                : `${visit.price.toLocaleString()} ${tr(deskCopy.baht)} (${tr(deskCopy[visit.paymentMethod ?? 'cash'])})`}
            </p>
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
              <p className="mt-2 text-xs text-muted-foreground">{tr(deskCopy.cancelHint)}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() => onCancel(visit.id, reason)}
                  className="h-11 flex-1 rounded-full bg-destructive text-sm font-semibold text-white disabled:opacity-40"
                >
                  {tr(deskCopy.cancelConfirm)}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelling(false)}
                  className="h-11 flex-1 rounded-full border border-border text-sm font-semibold"
                >
                  {tr(deskCopy.cancelBack)}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {!visit.checkedOutAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onCheckOut(visit.id)}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-40"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {tr(deskCopy.checkOut)}
                </button>
              )}
              <button
                type="button"
                onClick={() => setCancelling(true)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border px-5 text-sm font-semibold text-muted-foreground hover:text-destructive"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                {tr(deskCopy.cancelVisit)}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <div className="flex items-baseline justify-between rounded-2xl bg-secondary px-4 py-3">
            <span className="text-sm text-secondary-foreground">
              {tr(deskCopy.dayPassToday)} ({tr(member.weekend ? deskCopy.weekend : deskCopy.weekday)})
            </span>
            <span className="font-display text-2xl font-extrabold text-foreground">
              {member.priceToday.toLocaleString()} <span className="text-sm font-semibold">{tr(deskCopy.baht)}</span>
            </span>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tr(deskCopy.paymentMethod)}
          </p>
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

          <input
            value={wristband}
            onChange={(e) => setWristband(e.target.value)}
            placeholder={tr(deskCopy.wristbandPlaceholder)}
            aria-label={tr(deskCopy.wristband)}
            inputMode="numeric"
            maxLength={20}
            className="mt-3 h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />

          <button
            type="button"
            disabled={busy || !method}
            onClick={() => onCheckIn('paid', method, wristband)}
            className="mt-4 h-14 w-full rounded-full bg-primary text-base font-bold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {method ? fill(tr(deskCopy.checkInPaid), { price: member.priceToday.toLocaleString() }) : tr(deskCopy.chooseMethod)}
          </button>

          {rewardReady && (
            <button
              type="button"
              disabled={busy || member.weekend}
              onClick={() => onCheckIn('reward', null, wristband)}
              className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-accent text-sm font-semibold text-accent disabled:border-border disabled:text-muted-foreground"
            >
              <Gift className="h-4 w-4" aria-hidden="true" />
              {member.weekend ? tr(deskCopy.rewardWeekdayOnly) : tr(deskCopy.useReward)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StampRow({ progress, rewardReady }: { progress: number; rewardReady: boolean }) {
  const { tr } = useLanguage()
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr(deskCopy.stamps)}</span>
      <span className="flex gap-1" aria-label={`${progress}/10`}>
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn('h-3.5 w-3.5 rounded-full', i < progress ? 'bg-primary' : 'border border-border bg-background')}
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
  busy,
  onRefresh,
  onOpen,
  onCheckOut,
}: {
  floor: Floor | null
  busy: boolean
  onRefresh: () => void
  onOpen: (memberId: string) => void
  onCheckOut: (v: FloorVisit) => void
}) {
  const { tr } = useLanguage()
  const visits = floor?.visits ?? []
  const inside = visits.filter((v) => !v.checkedOutAt)
  const left = visits.filter((v) => v.checkedOutAt)
  const takings = { cash: 0, transfer: 0, card: 0 }
  let free = 0
  for (const v of visits) {
    if (v.entryType === 'reward') free++
    else if (v.paymentMethod) takings[v.paymentMethod] += v.price
  }
  const total = takings.cash + takings.transfer + takings.card
  const pct = Math.min(100, Math.round((inside.length / FLOOR_CAPACITY) * 100))

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">{tr(deskCopy.floorHeading)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr(deskCopy.capacity)}{' '}
            <span className="font-display text-xl font-extrabold text-foreground">{inside.length}</span> / {FLOOR_CAPACITY}
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
          className={cn('h-full rounded-full', pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {tr(deskCopy.takings)}{' '}
        <span className="font-semibold text-foreground">
          {total.toLocaleString()} {tr(deskCopy.baht)}
        </span>
        {' · '}
        {tr(deskCopy.cash)} {takings.cash.toLocaleString()} · {tr(deskCopy.transfer)} {takings.transfer.toLocaleString()} ·{' '}
        {tr(deskCopy.card)} {takings.card.toLocaleString()} · {tr(deskCopy.freeCount)} {free}
      </p>

      {visits.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{tr(deskCopy.nobodyYet)}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {inside.map((v) => (
            <FloorRow key={v.id} v={v} busy={busy} onOpen={onOpen} onCheckOut={onCheckOut} />
          ))}
          {left.length > 0 && (
            <li className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tr(deskCopy.leftToday)} {left.length} {tr(deskCopy.people)}
            </li>
          )}
          {left.map((v) => (
            <FloorRow key={v.id} v={v} busy={busy} onOpen={onOpen} onCheckOut={onCheckOut} />
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
}: {
  v: FloorVisit
  busy: boolean
  onOpen: (memberId: string) => void
  onCheckOut: (v: FloorVisit) => void
}) {
  const { tr } = useLanguage()
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
      </button>
      {v.wristband && <span className="hidden shrink-0 text-xs sm:inline">#{v.wristband}</span>}
      <span className="hidden shrink-0 text-xs sm:inline">
        {v.entryType === 'reward' ? tr(deskCopy.free) : tr(deskCopy[v.paymentMethod ?? 'cash'])}
      </span>
      {v.checkedOutAt ? (
        <span className="w-24 shrink-0 text-right font-mono text-xs">→ {bangkokTime(v.checkedOutAt)}</span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCheckOut(v)}
          className="w-24 shrink-0 rounded-full border border-border py-1.5 text-xs font-semibold text-foreground hover:border-primary/40 disabled:opacity-40"
        >
          {tr(deskCopy.checkOut)}
        </button>
      )}
    </li>
  )
}
