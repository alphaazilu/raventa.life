'use client'

import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'

export function AccountView({
  email,
  role,
  signOutAction,
}: {
  email: string
  role: string
  signOutAction: () => Promise<void>
}) {
  const { tr } = useLanguage()

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-3xl font-extrabold text-foreground md:text-4xl">
        {tr(authCopy.accountHeading)}
      </h1>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          {tr(authCopy.emailFieldLabel)}
        </p>
        <p className="mt-1 text-card-foreground">{email}</p>

        <p className="mt-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          {tr(authCopy.roleFieldLabel)}
        </p>
        <p className="mt-1 text-card-foreground">{role === 'admin' ? tr(authCopy.roleAdmin) : tr(authCopy.roleCustomer)}</p>

        {role === 'admin' && (
          <a
            href="/admin"
            className="mt-4 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            {tr(authCopy.goToAdmin)}
          </a>
        )}
      </div>

      <form action={signOutAction} className="mt-6">
        <button
          type="submit"
          className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          {tr(authCopy.signOutButton)}
        </button>
      </form>
    </div>
  )
}
