'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, MapPin } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { formatMemberDate } from '@/lib/format-date'
import { submitScan, type OpenResult } from '@/app/account/checklist-actions'
import { checklistCopy as c, checklistErrors, hhmm, type Answer } from '@/lib/checklist'
import { cn } from '@/lib/utils'

type Opened = Extract<OpenResult, { ok: true }>

// What a staff member fills in at one check point after scanning it (v0.29):
// a big tap target per tick, numbers with the expected range, a note, and
// "report a problem".
export function PointForm({ opened, onSaved }: { opened: Opened; onSaved: (flags: string[]) => void }) {
  const { tr, lang } = useLanguage()
  const { point, last } = opened
  const [values, setValues] = useState<Record<string, Answer['value']>>({})
  const [raw, setRaw] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [issue, setIssue] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      setError(null)
      const answers: Answer[] = point.items.map((it) => ({ id: it.id, label: it.label, value: values[it.id] ?? null }))
      const r = await submitScan(opened.code, answers, note, issue)
      if (!r.ok) setError(r.error)
      else onSaved(r.flags)
    })

  const lastText = last
    ? tr(c.lastScan)
        .replace('{t}', `${formatMemberDate(last.at, lang, true) ?? ''} ${hhmm(Date.parse(last.at))}`)
        .replace('{n}', last.by)
    : null

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-xl font-extrabold">{point.name}</h2>
      {point.place && (
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {point.place}
        </p>
      )}
      {lastText && <p className="mt-1 text-xs text-muted-foreground">{lastText}</p>}

      <div className="mt-4 space-y-2">
        {point.items.length === 0 && <p className="rounded-xl bg-secondary px-3 py-2.5 text-sm text-muted-foreground">{tr(c.noItems)}</p>}
        {point.items.map((it) => {
          if (it.kind === 'check') {
            const on = values[it.id] === true
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setValues({ ...values, [it.id]: !on })}
                aria-pressed={on}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left text-[15px] font-semibold transition-colors',
                  on ? 'border-accent bg-accent/10' : 'border-border',
                )}
              >
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-accent bg-accent text-white' : 'border-border')}>
                  {on && <Check className="h-4 w-4" aria-hidden="true" />}
                </span>
                {it.label}
              </button>
            )
          }
          if (it.kind === 'number') {
            const v = values[it.id]
            const out = typeof v === 'number' && ((it.min != null && v < it.min) || (it.max != null && v > it.max))
            return (
              <label key={it.id} className={cn('block rounded-xl border-2 px-3 py-2.5', out ? 'border-amber-500' : 'border-border')}>
                <span className="text-[15px] font-semibold">{it.label}</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={raw[it.id] ?? ''}
                    onChange={(e) => {
                      const s = e.target.value.replace(/[^\d.-]/g, '')
                      setRaw({ ...raw, [it.id]: s })
                      const n = s === '' || s === '-' ? null : Number(s)
                      setValues({ ...values, [it.id]: n !== null && Number.isFinite(n) ? n : null })
                    }}
                    className="h-11 w-32 rounded-xl border border-border bg-background px-3 text-lg tabular-nums outline-none focus:border-primary"
                  />
                  {it.unit && <span className="text-sm text-muted-foreground">{it.unit}</span>}
                </span>
                {(it.min != null || it.max != null) && (
                  <span className={cn('mt-1 block text-xs', out ? 'font-semibold text-amber-700' : 'text-muted-foreground')}>
                    {out ? `${tr(c.outOfRange)} · ` : ''}
                    {tr(c.range)
                      .replace('{a}', it.min != null ? String(it.min) : '…')
                      .replace('{b}', it.max != null ? String(it.max) : '…')}
                  </span>
                )}
              </label>
            )
          }
          return (
            <label key={it.id} className="block rounded-xl border-2 border-border px-3 py-2.5">
              <span className="text-[15px] font-semibold">{it.label}</span>
              <input
                value={(values[it.id] as string | null) ?? ''}
                maxLength={200}
                onChange={(e) => setValues({ ...values, [it.id]: e.target.value })}
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary"
              />
            </label>
          )
        })}
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-muted-foreground">{tr(c.note)}</span>
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      <button
        type="button"
        onClick={() => setIssue(!issue)}
        aria-pressed={issue}
        className={cn(
          'mt-3 flex w-full items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-left',
          issue ? 'border-destructive bg-destructive/5 text-destructive' : 'border-border',
        )}
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>
          <span className="block text-sm font-bold">{tr(c.issue)}</span>
          <span className={cn('block text-xs', issue ? 'text-destructive/80' : 'text-muted-foreground')}>{tr(c.issueHint)}</span>
        </span>
      </button>

      {error && <p className="mt-3 text-sm font-semibold text-destructive">{tr(checklistErrors[error] ?? checklistErrors.failed)}</p>}

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
      >
        {pending ? <Spinner className="h-5 w-5" /> : <Check className="h-5 w-5" aria-hidden="true" />}
        {tr(c.save)}
      </button>
    </div>
  )
}

export function SavedNote({ flags }: { flags: string[] }) {
  const { tr } = useLanguage()
  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center">
      <Check className="mx-auto h-8 w-8 text-accent" aria-hidden="true" />
      <p className="mt-1 font-display text-lg font-extrabold">{tr(c.saved)}</p>
      {flags.length > 0 && (
        <p className="mt-1 text-xs font-semibold text-amber-700">{flags.map((f) => tr((c as Record<string, { th: string; en: string }>)[`flag_${f}`] ?? { th: f, en: f })).join(' · ')}</p>
      )}
    </div>
  )
}
