'use client'

import Image from 'next/image'
import { Gift } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { formatMemberDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

const t = {
  label: { th: 'GIFT VOUCHER', en: 'GIFT VOUCHER' },
  from: { th: 'จากคุณ{n}', en: 'From {n}' },
  until: { th: 'ใช้ได้ถึง {d}', en: 'Use by {d}' },
  weekday: { th: 'เฉพาะวันธรรมดา', en: 'Weekdays only' },
  times: { th: 'ครั้ง', en: 'visits' },
  of: { th: 'จาก {n}', en: 'of {n}' },
  used: { th: 'ใช้แล้ว', en: 'Used' },
  expired: { th: 'หมดอายุ', en: 'Expired' },
}

export type VoucherState = 'ready' | 'used' | 'expired'

// Visits a friend handed this member (§23), shown as a gift: a ticket with
// a torn-off stub. Used on the member's account page and the page where the
// gift is accepted.
export function GiftVoucher({
  from,
  left,
  total,
  until,
  weekdayOnly,
  state = 'ready',
  className,
}: {
  from: string
  left: number
  total: number
  until: string | null
  weekdayOnly: boolean
  state?: VoucherState
  className?: string
}) {
  const { tr, lang } = useLanguage()
  const date = until ? formatMemberDate(`${until}T12:00:00+07:00`, lang, true) : null
  const ended = state !== 'ready'
  return (
    <div
      className={cn(
        'relative flex overflow-hidden rounded-2xl border border-border bg-white text-left text-foreground shadow-[0_10px_24px_rgba(46,70,54,0.12)]',
        ended && 'opacity-60 shadow-none',
        className,
      )}
    >
      <Image
        src="/images/logo-emblem.png"
        alt=""
        aria-hidden="true"
        width={405}
        height={404}
        className="pointer-events-none absolute -bottom-[30%] left-[38%] h-[150%] w-auto opacity-[0.06] select-none"
      />
      <div className="relative min-w-0 flex-1 px-4 py-4">
        <span className="font-display text-[10px] font-semibold tracking-[0.22em] text-primary">{tr(t.label)}</span>
        <p className="mt-1 font-display text-xl font-extrabold leading-tight">Day Pass</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-card-foreground">{tr(t.from).replace('{n}', from)}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {[date ? tr(t.until).replace('{d}', date) : null, weekdayOnly ? tr(t.weekday) : null].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* The stub, behind a perforated line with a notch top and bottom. */}
      <div className="relative flex w-24 shrink-0 flex-col items-center justify-center gap-0.5 border-l-2 border-dashed border-white/70 bg-primary px-2 text-primary-foreground">
        <Gift className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        <span className="font-display text-2xl font-extrabold leading-none">×{ended ? total : left}</span>
        <span className="text-[10px] font-semibold opacity-85">
          {tr(t.times)}
          {!ended && left < total && ` ${tr(t.of).replace('{n}', String(total))}`}
        </span>
      </div>
      <span aria-hidden="true" className="absolute -top-2 right-[5.5rem] h-4 w-4 rounded-full border border-border bg-background" />
      <span aria-hidden="true" className="absolute -bottom-2 right-[5.5rem] h-4 w-4 rounded-full border border-border bg-background" />

      {ended && (
        <span className="absolute top-1/2 right-28 -translate-y-1/2 -rotate-12 rounded-md border-2 border-muted-foreground px-2 py-0.5 font-display text-sm font-extrabold tracking-wider text-muted-foreground">
          {tr(state === 'used' ? t.used : t.expired)}
        </span>
      )}
    </div>
  )
}
