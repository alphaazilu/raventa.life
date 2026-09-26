'use client'

import { useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { createClient } from '@/lib/supabase/client'

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" {...props}>
      <path
        fill="#4285F4"
        d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.31Z"
      />
      <path
        fill="#34A853"
        d="M10 20c2.7 0 4.96-.89 6.61-2.42l-3.23-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H1.07v2.59A10 10 0 0 0 10 20Z"
      />
      <path fill="#FBBC05" d="M4.41 11.92a6 6 0 0 1 0-3.84V5.49H1.07a10 10 0 0 0 0 9.02l3.34-2.59Z" />
      <path
        fill="#EA4335"
        d="M10 3.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 10 0a10 10 0 0 0-8.93 5.49l3.34 2.59C5.2 5.72 7.4 3.96 10 3.96Z"
      />
    </svg>
  )
}

function LineIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 2.5C6.2 2.5 1.5 6.3 1.5 11c0 4.2 3.7 7.7 8.8 8.4.3.1.8.2.9.5.1.3.1.7 0 1l-.2.9c0 .3-.2 1 .9.6 1.1-.5 6-3.5 8.2-6.1 1.5-1.6 2.3-3.3 2.3-5.3 0-4.7-4.7-8.5-10.4-8.5Z"
      />
      <path
        fill="#06C755"
        d="M6.3 13.7h-2a.5.5 0 0 1-.5-.5V9.1a.5.5 0 0 1 1 0v3.6h1.5a.5.5 0 0 1 0 1Zm1.9-.5a.5.5 0 0 1-1 0V9.1a.5.5 0 0 1 1 0v4.1Zm4.8 0a.5.5 0 0 1-.9.3l-2.1-2.8v2.5a.5.5 0 0 1-1 0V9.1a.5.5 0 0 1 .9-.3l2.1 2.8V9.1a.5.5 0 0 1 1 0v4.1Zm3.3-2.6a.5.5 0 0 1 0 1h-1.5v1.1h1.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5V9.1c0-.3.2-.5.5-.5h2a.5.5 0 0 1 0 1h-1.5v1h1.5Z"
      />
    </svg>
  )
}

// 'custom:line' is the identifier the LINE provider was created under in
// Supabase (Authentication → Sign In / Providers). LINE only shares
// openid + profile here — no email — so LINE accounts arrive with no email
// and no phone, and /complete-profile collects the rest (including the
// one-account-per-phone check).
type OAuthProvider = 'google' | 'custom:line'

const PROVIDER_SCOPES: Partial<Record<OAuthProvider, string>> = {
  'custom:line': 'openid profile',
}

export function OAuthButtons({ next }: { next: string }) {
  const { tr } = useLanguage()
  const [loading, setLoading] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleOAuth = async (provider: OAuthProvider) => {
    setError(null)
    setLoading(provider)
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, scopes: PROVIDER_SCOPES[provider] },
    })
    if (oauthError) {
      setLoading(null)
      setError(oauthError.message)
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        type="button"
        onClick={() => handleOAuth('google')}
        disabled={loading !== null}
        className="flex w-full items-center justify-center gap-2.5 rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleIcon className="h-4 w-4 shrink-0" />
        {tr(authCopy.google)}
      </button>
      {/* LINE's own button colours: #06C755 base, darker on hover. */}
      <button
        type="button"
        onClick={() => handleOAuth('custom:line')}
        disabled={loading !== null}
        className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#06C755] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#05B34C] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LineIcon className="h-5 w-5 shrink-0 text-white" />
        {tr(authCopy.line)}
      </button>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  )
}
