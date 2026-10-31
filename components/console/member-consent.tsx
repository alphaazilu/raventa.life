'use client'

import { ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { waiverStatusCopy as c } from '@/lib/console/copy'
import { formatMemberDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

// Member page (v0.43.1): what this member has agreed to (consent_records §54)
// — the privacy policy + terms, and the health waiver (who confirmed it).

type Row = { version: string | null; granted: boolean; at: string; source: string } | null

export function MemberConsent({
  pdpa,
  waiver,
  pdpaCurrent,
  waiverCurrent,
}: {
  pdpa: Row
  waiver: Row
  pdpaCurrent: string
  waiverCurrent: string
}) {
  const { tr, lang } = useLanguage()
  const when = (iso: string) => formatMemberDate(iso, lang, true) ?? iso
  const ok = 'bg-accent/15 text-accent'
  const warn = 'bg-amber-500/15 text-amber-800 dark:text-amber-300'

  const pdpaOk = Boolean(pdpa?.granted && (pdpa.version ?? '') >= pdpaCurrent)
  const waiverOk = Boolean(waiver?.granted && (waiver.version ?? '') >= waiverCurrent)

  const line = (label: { th: string; en: string }, isOk: boolean, status: { th: string; en: string }, r: Row, by?: { th: string; en: string }) => (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <span className="text-sm font-semibold">{tr(label)}</span>
      <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs">
        <span className={cn('rounded-full px-2 py-0.5 font-semibold', isOk ? ok : warn)}>{tr(status)}</span>
        {r && (
          <span className="text-muted-foreground">
            {when(r.at)}
            {r.version && ` · ${tr(c.version).replace('{v}', r.version)}`}
            {by && ` · ${tr(by)}`}
          </span>
        )}
      </span>
    </li>
  )

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card px-4 py-3">
      <h2 className="flex items-center gap-1.5 text-sm font-bold">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        {tr(c.heading)}
      </h2>
      <ul className="mt-1 divide-y divide-border">
        {line(c.pdpa, pdpaOk, pdpaOk ? c.pdpaOk : pdpa ? c.pdpaOld : c.pdpaNone, pdpa)}
        {line(c.waiver, waiverOk, waiverOk ? c.ok : waiver ? c.old : c.missing, waiver, waiver ? (waiver.source === 'self' ? c.self : c.desk) : undefined)}
      </ul>
    </section>
  )
}
