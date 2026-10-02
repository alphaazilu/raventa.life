'use client'

import Link from 'next/link'
import { Tablet } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { consoleCopy as c } from '@/lib/console/copy'

// Staff opening the front desk on their own phone (not allowed in Settings).
export function DeskTabletOnly() {
  const { tr } = useLanguage()
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Tablet className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-extrabold">{tr(c.tabletOnlyTitle)}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(c.tabletOnlyBody)}</p>
      <Link href="/account" className="mt-6 inline-flex h-11 items-center rounded-full border border-border px-5 text-sm font-semibold">
        {tr(c.tabletOnlyBack)}
      </Link>
    </main>
  )
}
