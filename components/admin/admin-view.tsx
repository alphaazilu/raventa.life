'use client'

import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'

export function AdminView({ email }: { email: string }) {
  const { tr } = useLanguage()

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-xs font-semibold tracking-brand uppercase text-primary">{tr(authCopy.adminWelcome)}</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-foreground md:text-4xl">
        {tr(authCopy.adminHeading)}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">{email}</p>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-sm leading-relaxed text-card-foreground">
        {tr(authCopy.adminPlaceholder)}
      </div>

      <a
        href="/"
        className="mt-6 inline-block text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {tr(authCopy.backHome)}
      </a>
    </div>
  )
}
