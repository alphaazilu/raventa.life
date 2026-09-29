'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { createClient } from '@/lib/supabase/client'
import { GoogleIcon, LineIcon } from '@/components/auth/oauth-buttons'
import { Spinner } from '@/components/ui/spinner'

export type LinkLineResult = 'linked' | 'already_used' | 'failed' | null

// Which ways this member can sign in, with a button to add LINE (the one
// most Thai members use, and the one that lets us reach them on LINE OA).
// Google is shown for information only — adding it is rarely wanted and
// another button would just confuse. Linking needs "Allow manual linking"
// on in Supabase → Authentication → Sign In / Providers.
export function LoginMethods({
  hasPassword,
  googleEmail,
  googleLinked,
  lineLinked,
  lineLinkResult,
}: {
  hasPassword: boolean
  googleEmail: string | null
  googleLinked: boolean
  lineLinked: boolean
  lineLinkResult: LinkLineResult
}) {
  const { tr } = useLanguage()
  const [pending, setPending] = useState(false)
  const [startError, setStartError] = useState(false)

  const handleLink = async () => {
    setPending(true)
    setStartError(false)
    const supabase = createClient()
    // Same callback as a normal sign-in; `link=line` tells it to send any
    // failure back here rather than to the login page.
    const next = encodeURIComponent('/account/settings?linked=line')
    const redirectTo = `${window.location.origin}/auth/callback?link=line&next=${next}`
    const { error } = await supabase.auth.linkIdentity({
      provider: 'custom:line',
      options: { redirectTo, scopes: 'openid profile' },
    })
    // Only reached when linking can't even start (e.g. manual linking is
    // switched off in Supabase) — otherwise the browser is already on LINE.
    if (error) {
      console.error('linkIdentity failed to start', error.message)
      setPending(false)
      setStartError(true)
    }
  }

  const message =
    lineLinkResult === 'linked'
      ? { text: tr(authCopy.lineLinkedSuccess), tone: 'text-accent' }
      : lineLinkResult === 'already_used'
        ? { text: tr(authCopy.lineLinkAlreadyUsed), tone: 'text-destructive' }
        : lineLinkResult === 'failed' || startError
          ? { text: tr(authCopy.lineLinkFailed), tone: 'text-destructive' }
          : null

  const on = 'text-accent font-semibold'
  const off = 'text-muted-foreground'

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-card-foreground">{tr(authCopy.loginMethodsHeading)}</h2>

      <MethodRow
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background">
            <Mail className="h-4 w-4 text-foreground" />
          </span>
        }
        label={tr(authCopy.loginMethodEmail)}
      >
        <span className={hasPassword ? on : off}>
          {hasPassword ? tr(authCopy.statusInUse) : tr(authCopy.statusNotSet)}
        </span>
      </MethodRow>

      <MethodRow
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white">
            <GoogleIcon className="h-4 w-4" />
          </span>
        }
        label={tr(authCopy.loginMethodGoogle)}
        sub={googleLinked ? googleEmail : null}
      >
        <span className={googleLinked ? on : off}>
          {googleLinked ? tr(authCopy.statusLinked) : tr(authCopy.statusNotLinked)}
        </span>
      </MethodRow>

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
            onClick={handleLink}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#05B34C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending && <Spinner className="h-3.5 w-3.5" />}
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
