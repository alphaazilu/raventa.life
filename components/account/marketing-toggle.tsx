'use client'

import { useState, useTransition } from 'react'
import { useLanguage } from '@/components/language-provider'
import { consentCopy as c } from '@/lib/auth/copy'
import { marketingConsentText } from '@/lib/legal/content'
import { formatMemberDate } from '@/lib/format-date'
import { setMarketingConsent } from '@/app/consent/actions'
import { cn } from '@/lib/utils'

// My account › Settings: the marketing opt-in (§54, v0.42.0). Each flip is a
// new consent record (withdrawing is as easy as giving it).
export function MarketingToggle({ initial }: { initial: { granted: boolean; at: string | null } }) {
  const { tr, lang } = useLanguage()
  const [state, setState] = useState(initial)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()
  const since = state.at ? formatMemberDate(state.at, lang, true) : null

  const flip = () =>
    start(async () => {
      const next = !state.granted
      const res = await setMarketingConsent(next)
      setFailed(!res.ok)
      if (res.ok) setState({ granted: next, at: res.at ?? null })
    })

  return (
    <div className="pb-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-card-foreground">{tr(c.marketingHeading)}</h2>
        <button
          type="button"
          role="switch"
          aria-checked={state.granted}
          aria-label={tr(c.marketingHeading)}
          disabled={pending}
          onClick={flip}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60',
            state.granted ? 'border-primary bg-primary' : 'border-border bg-secondary',
          )}
        >
          <span
            className={cn('inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform', state.granted ? 'translate-x-5' : 'translate-x-0.5')}
            aria-hidden="true"
          />
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{tr(marketingConsentText)}</p>
      <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
        {tr(state.granted ? c.marketingOn : c.marketingOff)}
        {since && <span className="font-normal"> · {tr(c.marketingSince).replace('{d}', since)}</span>}
      </p>
      {failed && <p className="mt-1.5 text-xs text-destructive">{tr(c.failed)}</p>}
    </div>
  )
}
