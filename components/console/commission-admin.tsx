'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { catalogCopy as c } from '@/lib/console/copy'
import { cmCopy as t, cmErrors, COMMISSION_KINDS, rateLabel, type CommissionMode, type CommissionRule } from '@/lib/commission'
import type { Catalog } from '@/lib/console/catalog'
import { saveCommissionRule, setEarner } from '@/app/console/catalog/commission-actions'
import { TEAM_PATH } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'

// Products & prices › Commission (§33, v0.34): who earns, and the rates.

export type CommissionSetup = {
  earners: { id: string; name: string; role: string; enabled: boolean }[]
  rules: CommissionRule[]
}

const card = 'rounded-2xl border border-border bg-card p-4 md:p-5'

export function CommissionAdmin({
  catalog,
  setup,
  // Injected only by design previews.
  actions = { setEarner, saveCommissionRule },
}: {
  catalog: Catalog
  setup: CommissionSetup | null
  actions?: { setEarner: typeof setEarner; saveCommissionRule: typeof saveCommissionRule }
}) {
  const { tr, lang } = useLanguage()
  if (!setup) return <p className="mt-6 rounded-2xl bg-amber-500/15 p-5 text-sm font-semibold text-amber-800 dark:text-amber-300">{tr(t.notSetUp)}</p>
  const kindRule = new Map(setup.rules.filter((r) => r.kind).map((r) => [r.kind as string, r]))
  const productRule = new Map(setup.rules.filter((r) => r.productId).map((r) => [r.productId as string, r]))
  const products = [...catalog.products].sort((a, b) => Number(b.active) - Number(a.active))
  const perUnit = tr(t.perUnit)

  return (
    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className={card}>
        <h2 className="font-display text-lg font-bold">{tr(t.who)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{tr(t.whoHint)}</p>
        {setup.earners.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            <a href={TEAM_PATH} className="underline">
              {tr(t.noStaff)}
            </a>
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {setup.earners.map((p) => (
              <EarnerRow key={p.id} person={p} onSet={actions.setEarner} />
            ))}
          </ul>
        )}
        <p className="mt-4 rounded-xl bg-secondary px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">{tr(t.howItWorks)}</p>
      </section>

      <section className={card}>
        <h2 className="font-display text-lg font-bold">{tr(t.rates)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{tr(t.ratesHint)}</p>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr(t.kindDefaults)}</h3>
        <ul className="mt-1 divide-y divide-border">
          {COMMISSION_KINDS.map((k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-sm font-semibold">{tr(c[`kind_${k}`])}</span>
              <RateEditor rule={kindRule.get(k) ?? null} target={{ kind: k }} emptyLabel={tr(t.none)} save={actions.saveCommissionRule} />
            </li>
          ))}
        </ul>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr(t.perProduct)}</h3>
        <ul className="mt-1 divide-y divide-border">
          {products.map((p) => {
            const fallback = kindRule.get(p.kind)
            return (
              <li key={p.id} className={cn('flex flex-wrap items-center justify-between gap-2 py-2.5', !p.active && 'opacity-60')}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{lang === 'en' && p.nameEn ? p.nameEn : p.nameTh}</span>
                  <span className="block text-xs text-muted-foreground">
                    {tr(c[`kind_${p.kind}`])}
                    {!p.active && ` · ${tr(c.off)}`}
                  </span>
                </span>
                <RateEditor
                  rule={productRule.get(p.id) ?? null}
                  target={{ productId: p.id }}
                  emptyLabel={`${tr(t.useKind)}${fallback ? ` (${rateLabel(fallback.mode, fallback.value, perUnit)})` : ` (${tr(t.none)})`}`}
                  save={actions.saveCommissionRule}
                />
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function EarnerRow({ person, onSet }: { person: CommissionSetup['earners'][number]; onSet: typeof setEarner }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [on, setOn] = useState(person.enabled)
  const [error, setError] = useState<string | null>(null)
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{person.name}</span>
        <span className="block text-xs text-muted-foreground">
          {person.role === 'admin' ? 'Admin' : 'Staff'}
          {error && <span className="ml-1 font-semibold text-destructive">· {tr(cmErrors[error] ?? cmErrors.failed)}</span>}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${tr(t.on)} · ${person.name}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const next = !on
            setOn(next)
            setError(null)
            const r = await onSet(person.id, next)
            if (r.ok) router.refresh()
            else {
              setOn(!next)
              setError(r.error)
            }
          })
        }
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-bold transition-colors',
          on ? 'bg-accent text-white' : 'border border-border bg-background text-muted-foreground',
        )}
      >
        {pending ? <Spinner className="h-3.5 w-3.5" /> : on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        {tr(on ? t.on : t.off)}
      </button>
    </li>
  )
}

function RateEditor({
  rule,
  target,
  emptyLabel,
  save,
}: {
  rule: CommissionRule | null
  target: { productId: string } | { kind: string }
  emptyLabel: string
  save: typeof saveCommissionRule
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mode, setMode] = useState<CommissionMode | ''>(rule?.mode ?? '')
  const [value, setValue] = useState(rule ? String(rule.value) : '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const dirty = (mode || null) !== (rule?.mode ?? null) || (mode !== '' && Number(value) !== (rule?.value ?? NaN))

  const submit = () =>
    start(async () => {
      setError(null)
      setSaved(false)
      const r = await save({ ...target, mode: mode || null, value: Number(value) })
      if (r.ok) {
        setSaved(true)
        router.refresh()
      } else setError(r.error)
    })

  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      <select
        value={mode}
        onChange={(e) => {
          setMode(e.target.value as CommissionMode | '')
          setSaved(false)
        }}
        aria-label={tr(t.rates)}
        className="h-9 max-w-[14rem] rounded-full border border-border bg-background px-3 text-sm"
      >
        <option value="">{emptyLabel}</option>
        <option value="pct">{tr(t.pct)}</option>
        <option value="thb">{tr(t.thb)}</option>
      </select>
      {mode !== '' && (
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          max={mode === 'pct' ? 100 : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          aria-label={tr(mode === 'pct' ? t.pct : t.thb)}
          className="h-9 w-20 rounded-full border border-border bg-background px-3 text-right text-sm tabular-nums"
        />
      )}
      {dirty ? (
        <button
          type="button"
          disabled={pending || (mode !== '' && !(Number(value) > 0))}
          onClick={submit}
          className="inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
        >
          {pending && <Spinner className="h-3.5 w-3.5" />}
          {tr(t.save)}
        </button>
      ) : (
        saved && <span className="text-xs font-semibold text-accent">{tr(t.saved)}</span>
      )}
      {error && <span className="basis-full text-right text-xs font-semibold text-destructive">{tr(cmErrors[error] ?? cmErrors.failed)}</span>}
    </span>
  )
}
