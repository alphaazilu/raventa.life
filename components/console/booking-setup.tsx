'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Copy, Plus, Trash2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import {
  BOOKING_KINDS,
  bkCopy as c,
  bkErrors,
  kindHint,
  kindLabel,
  STEP_OPTIONS,
  typeName,
  WEEKDAYS,
  type BookingKind,
  type BookingType,
  type NoShowRules,
} from '@/lib/booking'
import { deleteBookingType, saveBookingType, saveNoShowRules, type TypeInput } from '@/app/console/bookings/actions'
import { cn } from '@/lib/utils'

// Bookings › Setup (admin): what can be booked, and the no-show rules.

const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'
const input = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary'
const label = 'mb-1 block text-xs font-semibold text-muted-foreground'

const DEFAULTS: Record<BookingKind, Partial<TypeInput>> = {
  service: { durationMin: 60, bufferMin: 15, capacity: 1, stepMin: 30, maxParty: 1 },
  class: { durationMin: 60, bufferMin: 0, capacity: 12, stepMin: 60, maxParty: 4 },
  entry: { durationMin: 180, bufferMin: 0, capacity: 20, stepMin: 60, maxParty: 6 },
  room: { durationMin: 90, bufferMin: 15, capacity: 1, stepMin: 30, maxParty: 6 },
}

const blank = (kind: BookingKind = 'service'): TypeInput => ({
  kind,
  nameTh: '',
  nameEn: '',
  description: '',
  durationMin: 60,
  bufferMin: 0,
  capacity: 1,
  stepMin: 30,
  productId: null,
  memberBooking: true,
  advanceDays: 14,
  minHours: 2,
  cancelHours: 3,
  maxParty: 1,
  active: true,
  sort: 0,
  resources: [],
  hours: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, start: '10:00', end: '20:00' })),
  ...DEFAULTS[kind],
})

const fromType = (t: BookingType): TypeInput => ({
  id: t.id,
  kind: t.kind,
  nameTh: t.nameTh,
  nameEn: t.nameEn,
  description: t.description ?? '',
  durationMin: t.durationMin,
  bufferMin: t.bufferMin,
  capacity: t.capacity,
  stepMin: t.stepMin,
  productId: t.productId,
  memberBooking: t.memberBooking,
  advanceDays: t.advanceDays,
  minHours: t.minHours,
  cancelHours: t.cancelHours,
  maxParty: t.maxParty,
  active: t.active,
  sort: t.sort,
  resources: t.resources.filter((r) => r.active).map((r) => ({ id: r.id, label: r.label, staffId: r.staffId, active: r.active })),
  hours: t.hours,
})

export function BookingSetup({
  types,
  rules,
  staff,
  products,
  // Injected only by design previews.
  api = { saveBookingType, deleteBookingType, saveNoShowRules },
}: {
  types: BookingType[]
  rules: NoShowRules
  staff: { id: string; name: string }[]
  products: { id: string; name: string; active: boolean }[]
  api?: { saveBookingType: typeof saveBookingType; deleteBookingType: typeof deleteBookingType; saveNoShowRules: typeof saveNoShowRules }
}) {
  const { tr, lang } = useLanguage()
  const [sel, setSel] = useState<string | 'new'>(types[0]?.id ?? 'new')
  const [fresh, setFresh] = useState(0)
  const current = types.find((t) => t.id === sel) ?? null

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col gap-5">
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{tr(c.types)}</h2>
            <button type="button" onClick={() => setSel('new')} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {tr(c.addType)}
            </button>
          </div>
          {types.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{tr(c.noTypes)}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {types.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSel(t.id)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left text-sm', sel === t.id ? 'bg-secondary' : 'hover:bg-secondary/50', !t.active && 'opacity-60')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{typeName(t, lang)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {tr(kindLabel[t.kind])} · {tr(c.min).replace('{n}', String(t.durationMin))}
                        {t.resources.filter((r) => r.active).length > 0 && ` · ${t.resources.filter((r) => r.active).length} ${tr(c.resources)}`}
                      </span>
                    </span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', t.active ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground')}>
                      {t.active ? tr(c.active) : '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <RulesForm rules={rules} save={api.saveNoShowRules} />
      </div>
      <TypeForm
        key={current?.id ?? `new-${fresh}`}
        initial={current ? fromType(current) : blank()}
        staff={staff}
        products={products}
        api={api}
        onSaved={(id) => {
          setSel(id)
          setFresh((n) => n + 1)
        }}
        onDeleted={() => setSel('new')}
      />
    </div>
  )
}

function TypeForm({
  initial,
  staff,
  products,
  api,
  onSaved,
  onDeleted,
}: {
  initial: TypeInput
  staff: { id: string; name: string }[]
  products: { id: string; name: string; active: boolean }[]
  api: { saveBookingType: typeof saveBookingType; deleteBookingType: typeof deleteBookingType }
  onSaved: (id: string) => void
  onDeleted: () => void
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [f, setF] = useState<TypeInput>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const set = (p: Partial<TypeInput>) => {
    setF((x) => ({ ...x, ...p }))
    setSaved(false)
  }
  const numIn = (k: keyof TypeInput, lo: number, hi: number, step = 1) => (
    <input
      type="number"
      min={lo}
      max={hi}
      step={step}
      value={String(f[k] as number)}
      onChange={(e) => set({ [k]: e.target.value === '' ? 0 : Number(e.target.value) } as Partial<TypeInput>)}
      className={input}
    />
  )
  const hasRes = f.resources.length > 0

  return (
    <section className={card}>
      <h2 className="font-display text-lg font-bold">{f.id ? f.nameTh || '—' : tr(c.addType)}</h2>

      {!f.id && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {BOOKING_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setF({ ...blank(k), nameTh: f.nameTh, nameEn: f.nameEn, description: f.description })}
              className={cn('rounded-xl border px-3 py-2 text-left', f.kind === k ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}
            >
              <span className="block text-sm font-semibold">{tr(kindLabel[k])}</span>
              <span className="block text-[11px] text-muted-foreground">{tr(kindHint[k])}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label>
          <span className={label}>{tr(c.nameTh)}</span>
          <input value={f.nameTh} maxLength={60} onChange={(e) => set({ nameTh: e.target.value })} className={input} />
        </label>
        <label>
          <span className={label}>{tr(c.nameEn)}</span>
          <input value={f.nameEn} maxLength={60} onChange={(e) => set({ nameEn: e.target.value })} className={input} />
        </label>
        <label className="sm:col-span-2">
          <span className={label}>{tr(c.description)}</span>
          <textarea rows={2} value={f.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <label>
          <span className={label}>{tr(c.duration)}</span>
          {numIn('durationMin', 10, 720, 5)}
        </label>
        <label>
          <span className={label}>{tr(c.step)}</span>
          <select value={f.stepMin} onChange={(e) => set({ stepMin: Number(e.target.value) })} className={input}>
            {STEP_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>{tr(hasRes ? c.capacityRes : c.capacity)}</span>
          {numIn('capacity', 1, 500)}
        </label>
        <label>
          <span className={label}>{tr(c.buffer)}</span>
          {numIn('bufferMin', 0, 120, 5)}
        </label>
        <label>
          <span className={label}>{tr(c.maxParty)}</span>
          {numIn('maxParty', 1, 20)}
        </label>
        <label>
          <span className={label}>{tr(c.product)}</span>
          <select value={f.productId ?? ''} onChange={(e) => set({ productId: e.target.value || null })} className={input}>
            <option value="">{tr(c.noProduct)}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.active ? '' : ' (—)'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* People / rooms */}
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr(c.resources)}</h3>
      <p className="text-xs text-muted-foreground">{tr(c.resourcesHint)}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {f.resources.map((r, i) => (
          <li key={r.id ?? `n${i}`} className="flex items-center gap-2">
            <input
              value={r.label}
              maxLength={40}
              placeholder={tr(c.resourceLabel)}
              onChange={(e) => set({ resources: f.resources.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
              className={input}
            />
            <select
              value={r.staffId ?? ''}
              onChange={(e) => {
                const id = e.target.value || null
                const nm = staff.find((s) => s.id === id)?.name
                set({ resources: f.resources.map((x, j) => (j === i ? { ...x, staffId: id, label: x.label || nm || '' } : x)) })
              }}
              aria-label={tr(c.linkStaff)}
              className={cn(input, 'max-w-[11rem]')}
            >
              <option value="">{tr(c.linkStaff)} —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => set({ resources: f.resources.filter((_, j) => j !== i) })} aria-label={tr(c.remove)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => set({ resources: [...f.resources, { label: '', staffId: null, active: true }] })} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <Plus className="h-4 w-4" aria-hidden="true" />
        {tr(c.addResource)}
      </button>

      {/* Hours */}
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr(c.hours)}</h3>
      <p className="text-xs text-muted-foreground">{tr(c.hoursHint)}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const rows = f.hours.map((h, i) => ({ h, i })).filter((x) => x.h.weekday === wd)
          return (
            <li key={wd} className="flex flex-wrap items-center gap-2">
              <span className="w-8 text-sm font-semibold">{tr(WEEKDAYS[wd])}</span>
              {rows.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
              {rows.map(({ h, i }) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <input type="time" value={h.start} onChange={(e) => set({ hours: f.hours.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
                  <span className="text-muted-foreground">–</span>
                  <input type="time" value={h.end} onChange={(e) => set({ hours: f.hours.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
                  <button type="button" onClick={() => set({ hours: f.hours.filter((_, j) => j !== i) })} aria-label={tr(c.remove)} className="p-1 text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => set({ hours: [...f.hours, { weekday: wd, start: rows.at(-1)?.h.end ?? '10:00', end: '20:00' }] })} aria-label={tr(c.addHours)} title={tr(c.addHours)} className="p-1 text-primary">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
      {f.hours.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const first = f.hours.filter((h) => h.weekday === (f.hours[0]?.weekday ?? 1))
            set({ hours: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => first.map((h) => ({ ...h, weekday }))) })
          }}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {tr(c.copyHours)}
        </button>
      )}

      {/* Member booking */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3">
          <input type="checkbox" checked={f.memberBooking} onChange={(e) => set({ memberBooking: e.target.checked })} className="h-4 w-4" />
          {tr(c.memberBooking)}
        </label>
        <label>
          <span className={label}>{tr(c.advance)}</span>
          {numIn('advanceDays', 0, 180)}
        </label>
        <label>
          <span className={label}>{tr(c.minHours)}</span>
          {numIn('minHours', 0, 72, 0.5)}
        </label>
        <label>
          <span className={label}>{tr(c.cancelHours)}</span>
          {numIn('cancelHours', 0, 168, 0.5)}
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3">
          <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} className="h-4 w-4" />
          {tr(c.active)}
        </label>
      </div>

      {error && <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{tr(bkErrors[error] ?? bkErrors.failed)}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await api.saveBookingType({ ...f, resources: f.resources.filter((x) => x.label.trim()) })
              if (r.ok) {
                setSaved(true)
                router.refresh()
                if (!f.id) onSaved(r.data.id)
              } else setError(r.error)
            })
          }
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {pending && <Spinner className="h-4 w-4" />}
          {tr(c.save)}
        </button>
        {saved && <span className="text-sm font-semibold text-accent">{tr(c.saved)}</span>}
        {f.id && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await api.deleteBookingType(f.id as string)
                if (r.ok) {
                  router.refresh()
                  onDeleted()
                } else setError(r.error)
              })
            }
            className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {tr(c.remove)}
          </button>
        )}
      </div>
    </section>
  )
}

function RulesForm({ rules, save }: { rules: NoShowRules; save: typeof saveNoShowRules }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [r, setR] = useState(rules)
  const [msg, setMsg] = useState<string | null>(null)
  const field = (k: keyof NoShowRules, l: { th: string; en: string }, step = 1, hint?: { th: string; en: string }) => (
    <label>
      <span className={label}>
        {tr(l)}
        {hint && <span className="font-normal"> ({tr(hint)})</span>}
      </span>
      <input
        type="number"
        step={step}
        min={0}
        value={String(r[k])}
        onChange={(e) => {
          setR({ ...r, [k]: Number(e.target.value) })
          setMsg(null)
        }}
        className={input}
      />
    </label>
  )
  return (
    <section className={card}>
      <h2 className="font-display text-lg font-bold">{tr(c.rules)}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{tr(c.rulesHint)}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {field('lateMin', c.ruleLate)}
        {field('windowDays', c.ruleWindow)}
        {field('warn', c.ruleWarn, 0.5, c.zeroOff)}
        {field('block', c.ruleBlock, 0.5, c.zeroOff)}
        {field('blockDays', c.ruleBlockDays)}
        {field('lateCancelWeight', c.ruleLateCancel, 0.25)}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const x = await save(r)
              setMsg(x.ok ? 'saved' : x.error)
              if (x.ok) router.refresh()
            })
          }
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {pending && <Spinner className="h-4 w-4" />}
          {tr(c.save)}
        </button>
        {msg && (
          <span className={cn('text-sm font-semibold', msg === 'saved' ? 'text-accent' : 'text-destructive')}>{msg === 'saved' ? tr(c.saved) : tr(bkErrors[msg] ?? bkErrors.failed)}</span>
        )}
      </div>
    </section>
  )
}
