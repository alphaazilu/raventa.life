'use client'

import { useLanguage } from '@/components/language-provider'
import { authCopy } from '@/lib/auth/copy'
import { MemberCard } from '@/components/account/member-card'
import { LinkRow } from '@/components/account/account-view'

// The member page people open at the counter: just the card (and its
// check-in QR). Phone, email and the rest sit one tap away on the settings
// page, so nobody glancing at the screen sees them.
export function AccountHome({
  name,
  memberNo,
  avatarUrl,
  joinedAt,
  openCardOnLoad,
}: {
  name: string
  memberNo: string | null
  avatarUrl: string | null
  joinedAt: string | null
  openCardOnLoad: boolean
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

      <nav className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
        <LinkRow href="/account/settings">{tr(authCopy.settingsLink)}</LinkRow>
      </nav>
    </div>
  )
}
