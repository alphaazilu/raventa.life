'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, QrCode, ScanLine, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { QrScanner } from '@/components/admin/qr-scanner'
import { PointForm, SavedNote } from '@/components/checklist/point-form'
import { openPoint, type OpenResult } from '@/app/account/checklist-actions'
import { checklistCopy as c, checklistErrors, hhmm, slotsOn, slotState, type CheckRound, type CheckScan, type SlotState } from '@/lib/checklist'
import { cn } from '@/lib/utils'

type Pt = { id: string; name: string; place: string | null }
type Opened = Extract<OpenResult, { ok: true }>

export const statusTone: Record<SlotState['status'], string> = {
  done: 'bg-accent/15 text-accent',
  open: 'bg-primary text-primary-foreground',
  upcoming: 'bg-secondary text-muted-foreground',
  partial: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  missed: 'bg-destructive/10 text-destructive',
}

// Staff phone (v0.29): scan button on top, then today's rounds — the one due
// now opened up with its points ticked off as anyone scans them.
export function MyChecklist({
  today,
  setUp,
  points,
  rounds,
  scans,
  meId,
}: {
  today: string
  setUp: boolean
  points: Pt[]
  rounds: CheckRound[]
  scans: CheckScan[]
  meId: string
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const [mode, setMode] = useState<'list' | 'scan' | 'form' | 'saved'>('list')
  const [opened, setOpened] = useState<Opened | null>(null)
  const [flags, setFlags] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const pmap = useMemo(() => new Map(points.map((p) => [p.id, p])), [points])

  const onCode = (text: string) =>
    start(async () => {
      setError(null)
      const r = await openPoint(text)
      if (!r.ok) return setError(r.error)
      setOpened(r)
      setMode('form')
    })

  const timed = rounds.filter((r) => r.kind !== 'anytime')
  const anytime = rounds.filter((r) => r.kind === 'anytime')
  const rows = timed
    .map((r) => ({ round: r, slots: slotsOn(r, today).map((s) => slotState(s, r, scans, now)) }))
    .filter((x) => x.slots.length > 0)
  const mineToday = scans.filter((s) => s.staffId === meId).length

  if (!setUp) return <p className="rounded-2xl bg-amber-500/15 p-4 text-sm font-semibold text-amber-800">{tr(c.notSetUp)}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold">{tr(c.today)}</h1>
        {mineToday > 0 && <span className="text-sm text-muted-foreground">✓ {mineToday}</span>}
      </div>

      {mode === 'list' && (
        <button
          type="button"
          onClick={() => {
            setError(null)
            setMode('scan')
          }}
          className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-sm"
        >
          <ScanLine className="h-6 w-6" aria-hidden="true" />
          {tr(c.scan)}
        </button>
      )}

      {mode === 'scan' && (
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{tr(c.scanHint)}</span>
            <button type="button" onClick={() => setMode('list')} aria-label="close" className="rounded-full p-1 text-muted-foreground hover:bg-secondary">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="relative">
            <QrScanner onCode={onCode} paused={pending} autoStart hint={null} />
            {pending && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/60">
                <Spinner className="h-8 w-8 text-primary" />
              </div>
            )}
          </div>
          {error && <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{tr(checklistErrors[error] ?? checklistErrors.failed)}</p>}
        </div>
      )}

      {mode === 'form' && opened && (
        <>
          <PointForm
            opened={opened}
            onSaved={(f) => {
              setFlags(f)
              setMode('saved')
              router.refresh()
            }}
          />
          <button type="button" onClick={() => setMode('list')} className="w-full py-2 text-sm font-semibold text-muted-foreground">
            {tr(c.back)}
          </button>
        </>
      )}

      {mode === 'saved' && (
        <>
          <SavedNote flags={flags} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('list')} className="h-12 rounded-full border border-border text-sm font-semibold">
              {tr(c.back)}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setMode('scan')
              }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              {tr(c.scanAgain)}
            </button>
          </div>
        </>
      )}

      {mode === 'list' && (
        <>
          {rows.length === 0 && anytime.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tr(c.nothing)}</p>}
          {rows.map(({ round, slots }) => (
            <RoundCard key={round.id} round={round} slots={slots} pmap={pmap} />
          ))}
          {anytime.map((r) => (
            <AnytimeCard key={r.id} round={r} scans={scans} pmap={pmap} />
          ))}
        </>
      )}
    </div>
  )
}

function RoundCard({ round, slots, pmap }: { round: CheckRound; slots: SlotState[]; pmap: Map<string, Pt> }) {
  const { tr } = useLanguage()
  // Opened: the slot due now, else the next one, else the last of the day.
  const focus = slots.find((s) => s.status === 'open') ?? slots.find((s) => s.status === 'upcoming') ?? slots[slots.length - 1]
  const [pick, setPick] = useState<number | null>(null)
  const shown = pick !== null ? slots.find((s) => s.start === pick) ?? focus : focus
  const left = round.pointIds.filter((p) => pmap.has(p) && !shown.done[p]).length

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">{round.name}</h2>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', statusTone[shown.status])}>
          {shown.status === 'open' && left ? tr(c.left).replace('{n}', String(left)) : tr(c[shown.status])}
        </span>
      </div>
      {slots.length > 1 && (
        <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1">
          {slots.map((s) => (
            <button
              key={s.start}
              type="button"
              onClick={() => setPick(s.start)}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-offset-1',
                statusTone[s.status],
                s.start === shown.start && 'ring-2 ring-foreground',
              )}
            >
              {hhmm(s.start)}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {hhmm(shown.start)}–{hhmm(shown.end)}
      </p>
      <ul className="mt-2 divide-y divide-border">
        {round.pointIds
          .filter((id) => pmap.has(id))
          .map((id) => {
            const s = shown.done[id]
            return (
              <li key={id} className="flex items-center gap-3 py-2">
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', s ? 'border-accent bg-accent text-white' : 'border-border')}>
                  {s && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-semibold', s && 'text-muted-foreground')}>{pmap.get(id)!.name}</span>
                  {s ? (
                    <span className="block text-xs text-muted-foreground">
                      {hhmm(Date.parse(s.at))} · {s.staffName}
                      {s.issue && <b className="ml-1 text-destructive">· {tr(c.flag_issue)}</b>}
                    </span>
                  ) : (
                    pmap.get(id)!.place && <span className="block text-xs text-muted-foreground">{pmap.get(id)!.place}</span>
                  )}
                </span>
              </li>
            )
          })}
      </ul>
    </section>
  )
}

function AnytimeCard({ round, scans, pmap }: { round: CheckRound; scans: CheckScan[]; pmap: Map<string, Pt> }) {
  const { tr } = useLanguage()
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
        <h2 className="text-base font-bold">{round.name}</h2>
        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          {tr(c.anytime)}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-border">
          {round.pointIds
            .filter((id) => pmap.has(id))
            .map((id) => {
              const last = scans.find((s) => s.pointId === id)
              return (
                <li key={id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-semibold">{pmap.get(id)!.name}</span>
                  <span className="text-xs text-muted-foreground">{last ? `${hhmm(Date.parse(last.at))} · ${last.staffName}` : '—'}</span>
                </li>
              )
            })}
        </ul>
      )}
    </section>
  )
}
