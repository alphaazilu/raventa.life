'use client'

import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { MemberCard } from '@/components/account/member-card'
import { LinkRow } from '@/components/account/account-view'
import { canUseDesk, DESK_PATH } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'
import { Gift } from 'lucide-react'

// The member page people open at the counter: just the card (and its
// check-in QR). Phone, email and the rest sit one tap away on the settings
// page, so nobody glancing at the screen sees them.
export function AccountHome({
  name,
  memberNo,
  avatarUrl,
  joinedAt,
  openCardOnLoad,
  stamps,
  role,
}: {
  name: string
  memberNo: string | null
  avatarUrl: string | null
  joinedAt: string | null
  openCardOnLoad: boolean
  stamps: { progress: number; rewardsAvailable: number } | null
  role: string
}) {
  const { tr } = useLanguage()
  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-16 md:pt-6">
      <h1 className="font-display text-3xl font-extrabold text-foreground md:text-4xl">
        {tr(authCopy.accountHeading)}
      </h1>

      <div className="mt-8">
        <MemberCard name={name} memberNo={memberNo} avatarUrl={avatarUrl} joinedAt={joinedAt} autoOpen={openCardOnLoad} />
      </div>

      {stamps && <StampCard progress={stamps.progress} rewardsAvailable={stamps.rewardsAvailable} />}

      <nav className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
        {canUseDesk(role) && <LinkRow href={DESK_PATH}>{tr(authCopy.deskLinkLabel)}</LinkRow>}
        <LinkRow href="/account/settings">{tr(authCopy.settingsLink)}</LinkRow>
      </nav>
    </div>
  )
}

// 1 stamp per paid visit (max one a day); 10 = a free weekday Day Pass.
// Counted from check-ins by staff, so there's nothing to forget to collect.
function StampCard({ progress, rewardsAvailable }: { progress: number; rewardsAvailable: number }) {
  const { tr } = useLanguage()
  return (
    <section className="mt-6 rounded-2xl border border-border bg-secondary px-5 py-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-card-foreground">{tr(authCopy.stampCardHeading)}</h2>
        <span className="font-display text-lg font-extrabold text-foreground">{progress}/10</span>
      </div>
      <div className="mt-3 grid grid-cols-10 gap-1.5" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'aspect-square rounded-full',
              i < progress ? 'bg-primary' : 'border border-dashed border-border bg-background',
            )}
          />
        ))}
      </div>
      {rewardsAvailable > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-accent">
          <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
          {tr(authCopy.stampCardReward)}
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{tr(authCopy.stampCardHint)}</p>
      )}
    </section>
  )
}
