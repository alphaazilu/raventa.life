'use client'

import { Download, ScrollText, Search } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { AUDIT_PATH, MEMBERS_PATH } from '@/lib/auth/roles'
import { AUDIT_DETAIL_KEYS, AUDIT_GROUPS, auditCopy as c, auditGroupOf, auditLabel, type AuditGroup } from '@/lib/console/copy'
import { detailPairs } from '@/lib/console/audit-format'
import type { AuditFilters, AuditPage } from '@/lib/console/audit'
import type { Period, Preset } from '@/lib/console/report-period'
import { formatMemberNo } from '@/lib/format-date'
import { cn } from '@/lib/utils'

// Back Office › System › Audit log (v0.43.1). Read only: filters are a plain
// GET form, so every view is a link (and the export uses the same query).

const PRESETS = ['today', 'yesterday', '7d', 'month', 'last_month'] as const satisfies readonly Preset[]
const GROUP_TONE: Record<AuditGroup, string> = {
  front: 'bg-primary/10 text-primary',
  cash: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  team: 'bg-secondary text-secondary-foreground',
  catalog: 'bg-secondary text-secondary-foreground',
  customers: 'bg-accent/15 text-accent',
  checklist: 'bg-secondary text-secondary-foreground',
  calendar: 'bg-secondary text-secondary-foreground',
  settings: 'bg-muted text-muted-foreground',
}

export function AuditView({
  period,
  filters,
  page,
  result,
  actors,
}: {
  period: Period
  filters: AuditFilters
  page: number
  result: AuditPage | null
  actors: { id: string; name: string }[]
}) {
  const { tr, lang } = useLanguage()
  const when = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Bangkok',
  })
  const t = filters.action ? `a:${filters.action}` : filters.group ? `g:${filters.group}` : ''

  // The query for a link: the current filters with some changed.
  const qs = (over: Record<string, string | number | null>) => {
    const base: Record<string, string | number | null> = {
      ...(period.preset === 'custom' ? { from: period.from, to: period.to } : { p: period.preset }),
      actor: filters.actor,
      t: t || null,
      q: filters.q || null,
      ...over,
    }
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries(base)) if (v !== null && v !== '' && !(k === 'page' && v === 1)) u.set(k, String(v))
    return u.toString()
  }
  const href = (over: Record<string, string | number | null>) => {
    const s = qs(over)
    return s ? `${AUDIT_PATH}?${s}` : AUDIT_PATH
  }
  const filtered = Boolean(filters.actor || t || filters.q)

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold md:text-3xl">
            <ScrollText className="h-6 w-6 text-primary" aria-hidden="true" />
            {tr(c.title)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{tr(c.intro)}</p>
        </div>
        <a
          href={`${AUDIT_PATH}/export?${qs({ page: null })}`}
          title={tr(c.exportNote)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold hover:bg-secondary"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {tr(c.export)}
        </a>
      </div>

      {/* Period */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <a
            key={p}
            href={href({ p, from: null, to: null, page: null })}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-semibold',
              period.preset === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary',
            )}
          >
            {tr(c[p])}
          </a>
        ))}
      </div>

      {/* Filters (GET) */}
      <form action={AUDIT_PATH} className="flex flex-wrap items-center gap-2 text-sm">
        <input type="date" name="from" defaultValue={period.from} aria-label={tr(c.colAt)} className="h-10 rounded-full border border-border bg-background px-3" />
        <span className="text-muted-foreground">{tr(c.fromTo)}</span>
        <input type="date" name="to" defaultValue={period.to} aria-label={tr(c.fromTo)} className="h-10 rounded-full border border-border bg-background px-3" />
        <select name="actor" defaultValue={filters.actor ?? ''} aria-label={tr(c.colActor)} className="h-10 max-w-[12rem] rounded-full border border-border bg-background px-3">
          <option value="">{tr(c.allActors)}</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="t" defaultValue={t} aria-label={tr(c.colAction)} className="h-10 max-w-[14rem] rounded-full border border-border bg-background px-3">
          <option value="">{tr(c.allActions)}</option>
          {(Object.keys(AUDIT_GROUPS) as AuditGroup[]).map((g) => (
            <optgroup key={g} label={tr(AUDIT_GROUPS[g].label)}>
              <option value={`g:${g}`}>
                {tr(c.wholeGroup)}: {tr(AUDIT_GROUPS[g].label)}
              </option>
              {Object.entries(AUDIT_GROUPS[g].actions).map(([code, label]) => (
                <option key={code} value={`a:${code}`}>
                  {tr(label)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder={tr(c.search)}
            aria-label={tr(c.search)}
            className="h-10 w-full rounded-full border border-border bg-background pr-3 pl-9"
          />
        </label>
        <button type="submit" className="h-10 rounded-full bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90">
          {tr(c.apply)}
        </button>
        {filtered && (
          <a href={href({ actor: null, t: null, q: null, page: null })} className="h-10 px-2 font-semibold leading-10 text-muted-foreground hover:text-foreground hover:underline">
            {tr(c.clear)}
          </a>
        )}
      </form>

      {!result ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr(c.failed)}
        </p>
      ) : result.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{tr(c.none)}</p>
      ) : (
        <>
          {/* Long list: scrolls in its frame, column names stay (CLAUDE.md §5). */}
          <div className="max-h-[70dvh] overflow-auto rounded-2xl border border-border">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-secondary text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 whitespace-nowrap">{tr(c.colAt)}</th>
                  <th className="px-3 py-2.5">{tr(c.colActor)}</th>
                  <th className="px-3 py-2.5">{tr(c.colAction)}</th>
                  <th className="px-3 py-2.5">{tr(c.colMember)}</th>
                  <th className="px-3 py-2.5">{tr(c.colDetail)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {result.rows.map((r) => {
                  const g = auditGroupOf(r.action)
                  const pairs = detailPairs(r.detail)
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">{when.format(new Date(r.at))}</td>
                      <td className="px-3 py-2.5">
                        {r.actorId ? (
                          <a href={`${MEMBERS_PATH}/${r.actorId}`} className="font-semibold hover:text-primary hover:underline">
                            {r.actorName ?? '—'}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">{tr(c.system)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', g ? GROUP_TONE[g] : 'bg-muted text-muted-foreground')}>
                          {tr(auditLabel(r.action))}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.memberId ? (
                          <a href={`${MEMBERS_PATH}/${r.memberId}`} className="hover:text-primary hover:underline">
                            <span className="font-semibold">{r.memberName ?? '—'}</span>
                            {r.memberNo && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{formatMemberNo(r.memberNo)}</span>}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {pairs.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                            {pairs.map(([k, v]) => (
                              <div key={k} className="flex min-w-0 gap-1">
                                <dt className="shrink-0 text-muted-foreground">{tr(AUDIT_DETAIL_KEYS[k] ?? { th: k, en: k })}:</dt>
                                <dd className="min-w-0 break-words font-medium">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm font-semibold">
            {page > 1 ? (
              <a href={href({ page: page - 1 })} className="rounded-full border border-border px-4 py-2 hover:bg-secondary">
                {tr(c.newer)}
              </a>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">{tr(c.page).replace('{n}', String(page))}</span>
            {result.hasMore ? (
              <a href={href({ page: page + 1 })} className="rounded-full border border-border px-4 py-2 hover:bg-secondary">
                {tr(c.older)}
              </a>
            ) : (
              <span />
            )}
          </div>
        </>
      )}
    </div>
  )
}
