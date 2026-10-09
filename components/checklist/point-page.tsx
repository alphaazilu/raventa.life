'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { PointForm, SavedNote } from '@/components/checklist/point-form'
import type { OpenResult } from '@/app/account/checklist-actions'
import { checklistCopy as c, checklistErrors } from '@/lib/checklist'
import { MY_CHECKLIST_PATH } from '@/lib/auth/roles'

// /cp/<code>: the point opened from the phone's own camera app.
export function PointPage({ opened }: { opened: OpenResult }) {
  const { tr } = useLanguage()
  const [saved, setSaved] = useState<string[] | null>(null)
  const back = (
    <Link
      href={MY_CHECKLIST_PATH}
      className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold"
    >
      <ListChecks className="h-4 w-4" aria-hidden="true" />
      {tr(c.back)}
    </Link>
  )
  if (!opened.ok) {
    return (
      <>
        <p role="alert" className="rounded-2xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">
          {tr(checklistErrors[opened.error] ?? checklistErrors.failed)}
        </p>
        {opened.error !== 'not_staff' && back}
      </>
    )
  }
  return (
    <>
      {saved ? <SavedNote flags={saved} /> : <PointForm opened={opened} onSaved={setSaved} />}
      {back}
    </>
  )
}
