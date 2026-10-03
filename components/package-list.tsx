'use client'

import { Gift, Package } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { deskCopy, fill } from '@/lib/check-in/copy'
import { formatMemberDate } from '@/lib/format-date'
import { isGift, packageAlive, packageLeft, pieceOpen, type MemberPackage } from '@/lib/packages'
import { bangkokToday } from '@/lib/check-in/day'
import { cn } from '@/lib/utils'

// A member's packages: name, visits left, until when. The desk marks the
// one today's check-in would use; history views show ended ones faded.
export function PackageList({
  packages,
  useToday = null,
  heading = false,
  extra,
  className,
}: {
  packages: MemberPackage[]
  useToday?: string | null
  heading?: boolean
  // Extra controls under a package (the member's share panel).
  extra?: (k: MemberPackage) => React.ReactNode
  className?: string
}) {
  const { tr, lang } = useLanguage()
  if (packages.length === 0) return null
  const today = bangkokToday()
  const date = (d: string | null) => formatMemberDate(d ? `${d}T12:00:00+07:00` : null, lang, true) ?? '—'
  return (
    <div className={className}>
    {heading && <h2 className="mb-2 font-display text-xl font-extrabold text-foreground">{tr(deskCopy.packages)}</h2>}
    <ul className="space-y-2">
      {packages.map((k) => {
        const left = packageLeft(k)
        const friends = k.sharedWith.filter((f) => pieceOpen(f, today))
        const ended = !packageAlive(k, today)
        return (
          <li
            key={k.id}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-sm',
              useToday === k.id ? 'border-accent bg-accent/10' : 'border-border bg-card',
              ended && 'opacity-55',
            )}
          >
            {isGift(k) ? (
              <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              {/* A gift carries the giver's package name ("10 Day Pass"); show
                  it as one gift visit, not as a package of 10. */}
              <span className="block font-semibold text-card-foreground">{isGift(k) ? tr(deskCopy.pkgGiftTitle) : k.name}</span>
              <span className="block text-xs text-muted-foreground">
                {left === null ? tr(deskCopy.pkgUnlimited) : fill(tr(deskCopy.pkgLeft), { n: left })}
                {' · '}
                {k.startsOn ? fill(tr(deskCopy.pkgUntil), { d: date(k.expiresOn) }) : fill(tr(deskCopy.pkgNotStarted), { d: date(k.activateBy) })}
                {k.weekdayOnly && ` · ${tr(deskCopy.pkgWeekdayOnly)}`}
              </span>
              {!k.isOwner && (
                <span className="block text-xs font-semibold text-accent">
                  {isGift(k)
                    ? fill(tr(deskCopy.pkgGiftFrom), { n: k.ownerName ?? '—', p: k.name })
                    : fill(tr(deskCopy.pkgSharedFromWhole), { n: k.ownerName ?? '—' })}
                </span>
              )}
              {k.isOwner && friends.length > 0 && (
                <span className="block text-xs text-muted-foreground">
                  {fill(tr(k.shareWhole ? deskCopy.pkgSharedWithWhole : deskCopy.pkgSharedWith), {
                    n: friends
                      .map((f) => (f.kind === 'piece' ? `${f.name} (${fill(tr(deskCopy.pkgLeft), { n: (f.total ?? 0) - (f.used ?? 0) })})` : f.name))
                      .join(', '),
                  })}
                </span>
              )}
              {extra?.(k)}
            </span>
          </li>
        )
      })}
    </ul>
    </div>
  )
}
