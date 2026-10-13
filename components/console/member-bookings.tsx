'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useLanguage } from '@/components/language-provider'
import { formatMemberDate } from '@/lib/format-date'
import { BOOKINGS_PATH } from '@/lib/auth/roles'
import { bkCopy as c, bkkHm, statusLabel, type Booking, type NoShowRules, type NoShowStatus } from '@/lib/booking'
import { pardonMember } from '@/app/console/bookings/actions'
import { NoShowNote, statusClass } from '@/components/console/bookings-view'
import { cn } from '@/lib/utils'

// Back Office › Members › one member: their bookings and no-show record (§34).
export function MemberBookings({ memberId, list, noShow, rules }: { memberId: string; list: Booking[]; noShow: NoShowStatus | null; rules: NoShowRules }) {
  const { tr, lang } = useLanguage()
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!list.length && !noShow?.score) return null
  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg font-bold">{tr(c.title)}</h2>
      {noShow && noShow.score > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          <NoShowNote s={noShow} rules={rules} />
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => void ((await pardonMember(memberId)).ok && router.refresh()))}
            className="self-start text-xs font-semibold text-primary underline"
          >
            {tr(c.pardon)}
          </button>
        </div>
      )}
      <ul className="mt-2 divide-y divide-border">
        {list.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <Link href={`${BOOKINGS_PATH}?d=${b.day}`} className="min-w-0 hover:underline">
              <span className="block truncate font-semibold">{tr(b.typeName)}</span>
              <span className="block text-xs text-muted-foreground">
                {formatMemberDate(`${b.day}T12:00:00+07:00`, lang, true)} · {bkkHm(b.start)}
                {b.lateCancel ? ` · ${tr(c.lateCancel)}` : ''}
              </span>
            </Link>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', statusClass[b.status])}>{b.movedTo ? tr(c.moved) : tr(statusLabel[b.status])}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
