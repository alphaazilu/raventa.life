'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { createClient } from '@/lib/supabase/client'
import { GoogleIcon, LineIcon } from '@/components/auth/oauth-buttons'
import { Spinner } from '@/components/ui/spinner'
import { EmailLoginSetup } from '@/components/account/email-login-setup'

export type LinkProvider = 'line' | 'google'
export type LinkResult = { provider: LinkProvider; result: 'linked' | 'already_used' | 'failed' } | null

const LINK_MESSAGES = {
  line: {
    linked: authCopy.lineLinkedSuccess,
    already_used: authCopy.lineLinkAlreadyUsed,
    failed: authCopy.lineLinkFailed,
  },
  google: {
    linked: authCopy.googleLinkedSuccess,
    already_used: authCopy.googleLinkAlreadyUsed,
    failed: authCopy.googleLinkFailed,
  },
} as const

// Ways this member can sign in, each with a way to add it:
// - Email & password: verify an email (LINE members), then set a password
//   (components/account/email-login-setup).
// - Google / LINE: linkIdentity, which needs "Allow manual linking" on in
//   Supabase → Authentication → Sign In / Providers. Google refuses to sign
//   in inside LINE's in-app browser, so there we explain instead.
export function LoginMethods({
  authEmail,
  profileEmail,
  hasPassword,
  googleEmail,
  googleLinked,
  lineLinked,
  linkResult,
  inLineApp,
  openEmailSetup,
}: {
  authEmail: string | null
  profileEmail: string | null
  hasPassword: boolean
  googleEmail: string | null
  googleLinked: boolean
  lineLinked: boolean
  linkResult: LinkResult
  inLineApp: boolean
  openEmailSetup: boolean
}) {
  const { tr } = useLanguage()
  const [pending, setPending] = useState<LinkProvider | null>(null)
  const [startError, setStartError] = useState<LinkProvider | null>(null)
  const [emailSetupOpen, setEmailSetupOpen] = useState(openEmailSetup && !hasPassword)

  const handleLink = async (provider: LinkProvider) => {
    setPending(provider)
    setStartError(null)
    const supabase = createClient()
    // Same callback as a normal sign-in; `link=` tells it to send any
    // failure back here rather than to the login page.
    const next = encodeURIComponent(`/account/settings?linked=${provider}`)
    const redirectTo = `${window.location.origin}/auth/callback?link=${provider}&next=${next}`
    const { error } = await supabase.auth.linkIdentity(
      provider === 'line'
        ? { provider: 'custom:line', options: { redirectTo, scopes: 'openid profile' } }
        : { provider: 'google', options: { redirectTo } },
    )
    // Only reached when linking can't even start (e.g. manual linking is
    // switched off in Supabase) — otherwise the browser is already away.
    if (error) {
      console.error('linkIdentity failed to start', provider, error.message)
      setPending(null)
      setStartError(provider)
    }
  }

  const message = startError
    ? { text: tr(LINK_MESSAGES[startError].failed), tone: 'text-destructive' }
    : linkResult
      ? {
          text: tr(LINK_MESSAGES[linkResult.provider][linkResult.result]),
          tone: linkResult.result === 'linked' ? 'text-accent' : 'text-destructive',
        }
      : null

  const on = 'text-accent font-semibold'
  const smallBtn =
    'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div id="login-methods" className="scroll-mt-24">
      <h2 className="mb-1 text-base font-semibold text-card-foreground">{tr(authCopy.loginMethodsHeading)}</h2>

      <MethodRow
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
            <Mail className="h-4 w-4 text-foreground" />
          </span>
        }
        label={tr(authCopy.loginMethodEmail)}
        sub={authEmail}
        last={false}
      >
        {hasPassword ? (
          <span className={on}>{tr(authCopy.statusInUse)}</span>
        ) : emailSetupOpen ? null : (
          <button
            type="button"
            onClick={() => setEmailSetupOpen(true)}
            className={`${smallBtn} bg-primary text-primary-foreground hover:opacity-90`}
          >
            {tr(authEmail ? authCopy.passwordSetupButton : authCopy.emailSetupButton)}
          </button>
        )}
      </MethodRow>
      {emailSetupOpen && !hasPassword && (
        <EmailLoginSetup
          authEmail={authEmail}
          suggestedEmail={profileEmail ?? ''}
          onClose={() => setEmailSetupOpen(false)}
        />
      )}

      <MethodRow
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white">
            <GoogleIcon className="h-4 w-4" />
          </span>
        }
        label={tr(authCopy.loginMethodGoogle)}
        sub={googleLinked ? googleEmail : null}
      >
        {googleLinked ? (
          <span className={on}>{tr(authCopy.statusLinked)}</span>
        ) : inLineApp ? (
          <span className="text-muted-foreground">{tr(authCopy.statusNotLinked)}</span>
        ) : (
          <button
            type="button"
            onClick={() => handleLink('google')}
            disabled={pending !== null}
            className={`${smallBtn} border border-border bg-white text-foreground hover:border-primary/40`}
          >
            {pending === 'google' && <Spinner className="h-3.5 w-3.5" />}
            {tr(authCopy.googleLinkShort)}
          </button>
        )}
      </MethodRow>

      {!googleLinked && inLineApp && (
        <p className="-mt-1 pb-3 text-xs leading-relaxed text-muted-foreground">{tr(authCopy.googleOpenInBrowser)}</p>
      )}

      <MethodRow
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#06C755]">
            <LineIcon className="h-5 w-5 text-white" />
          </span>
        }
        label={tr(authCopy.loginMethodLine)}
        last
      >
        {lineLinked ? (
          <span className={on}>{tr(authCopy.statusLinked)}</span>
        ) : (
          <button
            type="button"
            onClick={() => handleLink('line')}
            disabled={pending !== null}
            className={`${smallBtn} bg-[#06C755] text-white hover:bg-[#05B34C]`}
          >
            {pending === 'line' && <Spinner className="h-3.5 w-3.5" />}
            {tr(authCopy.lineLinkShort)}
          </button>
        )}
      </MethodRow>

      {!lineLinked && <p className="pb-3 text-xs leading-relaxed text-muted-foreground">{tr(authCopy.lineLinkHint)}</p>}
      {message && <p className={`pb-3 text-sm ${message.tone}`}>{message.text}</p>}
    </div>
  )
}

function MethodRow({
  icon,
  label,
  sub,
  last,
  children,
}: {
  icon: React.ReactNode
  label: string
  sub?: string | null
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-3 text-sm ${last ? '' : 'border-b border-border'}`}>
      <span className="flex min-w-0 items-center gap-3">
        {icon}
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-card-foreground">{label}</span>
          {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
        </span>
      </span>
      <span className="shrink-0 text-right">{children}</span>
    </div>
  )
}
