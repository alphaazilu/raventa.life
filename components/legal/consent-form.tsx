'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { authCopy, consentCopy as c } from '@/lib/auth/copy'
import { acceptPolicies, type ConsentState } from '@/app/consent/actions'

// Asked again when the privacy policy / terms change (§54, v0.42.0). Same
// card as the sign-up forms; the policies open in a new tab.
export function ConsentForm({
  next,
  firstTime,
  privacyVersion,
  termsVersion,
  signOutAction,
}: {
  next: string
  firstTime: boolean
  privacyVersion: string
  termsVersion: string
  signOutAction: () => Promise<void>
}) {
  const { tr } = useLanguage()
  const [state, action, pending] = useActionState<ConsentState, FormData>(acceptPolicies, null)
  const [accept, setAccept] = useState(false)
  const link = 'font-medium text-primary underline-offset-2 hover:underline'

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16 md:py-24">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-extrabold text-foreground">{tr(c.title)}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(firstTime ? c.firstTime : c.intro)}</p>
        <ul className="mt-4 space-y-1.5 text-sm">
          <li>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className={link}>
              {tr(authCopy.acceptPrivacyPolicyLink)}
            </a>{' '}
            <span className="text-xs text-muted-foreground">
              · {tr(c.updated)} {privacyVersion}
            </span>
          </li>
          <li>
            <a href="/terms" target="_blank" rel="noopener noreferrer" className={link}>
              {tr(authCopy.acceptPrivacyTermsLink)}
            </a>{' '}
            <span className="text-xs text-muted-foreground">
              · {tr(c.updated)} {termsVersion}
            </span>
          </li>
        </ul>

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              name="accept"
              required
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary"
            />
            <span>
              {tr(authCopy.acceptPrivacyBefore)} {tr(authCopy.acceptPrivacyPolicyLink)} {tr(authCopy.acceptPrivacyAnd)} {tr(authCopy.acceptPrivacyTermsLink)}
            </span>
          </label>
          {state?.error && <p className="text-sm text-destructive">{tr(c[state.error])}</p>}
          <button
            type="submit"
            disabled={pending || !accept}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-busy={pending}
          >
            {pending && <Spinner />}
            {tr(c.accept)}
          </button>
        </form>
        <form action={signOutAction} className="mt-3 text-center">
          <button type="submit" className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline">
            {tr(c.signOut)}
          </button>
        </form>
      </div>
    </div>
  )
}
