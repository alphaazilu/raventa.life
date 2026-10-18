'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { UserPlus } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { cmCopy as t, cmErrors } from '@/lib/commission'
import type { MemberReferral as Data } from '@/lib/console/referral'
import { setMemberReferral } from '@/app/console/members/referral-actions'

// Members › one member: who referred them (§36, v0.36). Changeable by an
// admin until the referral is paid (the first bill with items that have a rate).
export function MemberReferral({
  memberId,
  data,
  team,
  save = setMemberReferral,
}: {
  memberId: string
  data: Data
  team: { id: string; name: string }[]
  save?: typeof setMemberReferral
}) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const via = data.via && data.referrerId ? tr(t[`via_${data.via}`]) : null

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold">{tr(t.referredBy)}</h2>
            <p className="text-sm">
              {data.name ? <span className="font-semibold">{data.name}</span> : <span className="text-muted-foreground">{tr(t.referredNone)}</span>}
              {via && <span className="text-xs text-muted-foreground"> · {via}</span>}
            </p>
            <p className="text-xs text-muted-foreground">{data.paid ? tr(t.refPaid) : data.locked ? tr(t.refOld) : tr(t.refWaiting)}</p>
          </div>
        </div>
        {!data.locked && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="h-9 rounded-full border border-border px-3.5 text-xs font-semibold hover:bg-secondary">
            {tr(t.refChange)}
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <select
            autoFocus
            defaultValue={data.referrerId ?? ''}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value
              setError(null)
              start(async () => {
                const r = await save(memberId, v || null)
                if (r.ok) {
                  setEditing(false)
                  router.refresh()
                } else setError(r.error)
              })
            }}
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">{tr(t.referredNone)}</option>
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {pending && <Spinner className="h-4 w-4 text-primary" />}
        </div>
      )}
      {error && <p className="mt-1.5 text-xs font-semibold text-destructive">{tr(cmErrors[error] ?? cmErrors.failed)}</p>}
    </section>
  )
}
