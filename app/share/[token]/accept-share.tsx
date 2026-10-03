'use client'

import { useState, useTransition } from 'react'
import { Gift, Package } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { GiftVoucher } from '@/components/gift-voucher'
import { formatMemberDate } from '@/lib/format-date'
import { acceptShareLink, type ShareInfo } from '@/app/account/package-actions'

const t = {
  // One-visit sharing: a gift.
  title: { th: 'คุณ{n} ส่งของขวัญให้คุณ', en: '{n} sent you a gift' },
  sub: { th: 'Day Pass 1 ครั้ง ที่ RAVENTA Wellness Retreat', en: 'One Day Pass at RAVENTA Wellness Retreat' },
  accept: { th: 'รับของขวัญ', en: 'Accept the gift' },
  done: { th: 'รับแล้ว! บัตรของขวัญอยู่ในบัญชีของคุณ — ยื่นบัตรสมาชิกที่เคาน์เตอร์ได้เลย', en: 'It’s yours! The voucher is in your account — just show your member card at the counter' },
  note: { th: 'ไม่ได้แสตมป์สะสมจากของขวัญ · ผู้ให้ดึงคืนได้ถ้ายังไม่ได้ใช้', en: 'Gift visits don’t earn stamps · the giver can take it back while unused' },
  // Whole-package sharing (family, couples).
  wTitle: { th: 'คุณ{n} ชวนใช้แพ็กเกจร่วมกัน', en: '{n} is sharing a package with you' },
  wLeft: { th: 'เหลือ {n} ครั้ง (ใช้ร่วมกับเจ้าของ)', en: '{n} visits left (shared with the owner)' },
  until: { th: 'ใช้ได้ถึง {d}', en: 'Use by {d}' },
  weekday: { th: 'เฉพาะวันธรรมดา', en: 'Weekdays only' },
  wAccept: { th: 'รับแพ็กเกจ', en: 'Accept' },
  wDone: { th: 'รับแล้ว — ใช้เช็คอินที่เคาน์เตอร์ได้เลย', en: 'Done — use it at the counter' },
  wNote: { th: 'ใช้เช็คอิน (Day Pass) จากแพ็กเกจนี้ ไม่ได้แสตมป์สะสม · เจ้าของเอาคุณออกได้ทุกเมื่อ', en: 'Day Pass visits from this package, no stamps · the owner can remove you any time' },
  toAccount: { th: 'ไปที่บัญชีของฉัน', en: 'Go to my account' },
}
const errors: Record<string, { th: string; en: string }> = {
  invalid: { th: 'ลิงก์ไม่ถูกต้อง', en: 'This link isn’t valid' },
  used: { th: 'ลิงก์นี้ถูกใช้ไปแล้ว — ขอลิงก์ใหม่จากเพื่อน', en: 'This link was already used — ask for a new one' },
  expired: { th: 'ลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่จากเพื่อน', en: 'This link has expired — ask for a new one' },
  not_shareable: { th: 'แพ็กเกจนี้ส่งต่อไม่ได้แล้ว (หมดครั้งหรือหมดอายุ)', en: 'This package can’t be shared any more' },
  own_package: { th: 'นี่คือแพ็กเกจของคุณเอง', en: 'This is your own package' },
  failed: { th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Something went wrong — try again' },
}

export function AcceptShare({ token, info, error }: { token: string; info: ShareInfo | null; error: string | null }) {
  const { tr, lang } = useLanguage()
  const [pending, start] = useTransition()
  const [err, setErr] = useState(error)
  const [done, setDone] = useState(false)
  const gift = info ? !info.whole : true
  const date = (d: string) => formatMemberDate(`${d}T12:00:00+07:00`, lang, true) ?? d

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        {gift ? (
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Gift className="h-7 w-7" aria-hidden="true" />
          </span>
        ) : (
          <Package className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        )}

        {info && gift && (
          <>
            <h1 className="mt-3 font-display text-2xl font-extrabold">{tr(t.title).replace('{n}', info.ownerName)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{tr(t.sub)}</p>
            <GiftVoucher
              className="mt-5"
              from={info.ownerName}
              left={1}
              total={1}
              until={info.until}
              weekdayOnly={info.weekdayOnly}
            />
          </>
        )}
        {info && !gift && (
          <>
            <h1 className="mt-3 font-display text-xl font-extrabold">{tr(t.wTitle).replace('{n}', info.ownerName)}</h1>
            <p className="mt-2 text-lg font-semibold">{info.packageName}</p>
            <p className="text-sm text-muted-foreground">
              {[
                info.visitsLeft !== null ? tr(t.wLeft).replace('{n}', String(info.visitsLeft)) : null,
                info.until ? tr(t.until).replace('{d}', date(info.until)) : null,
                info.weekdayOnly ? tr(t.weekday) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </>
        )}

        {err && <p className="mt-4 text-sm font-semibold text-destructive">{tr(errors[err] ?? errors.failed)}</p>}
        {done ? (
          <>
            <p className="mt-5 text-sm font-semibold text-accent">{tr(gift ? t.done : t.wDone)}</p>
            <a href="/account" className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground">
              {tr(t.toAccount)}
            </a>
          </>
        ) : (
          info &&
          !err && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await acceptShareLink(token)
                  if (r.ok) setDone(true)
                  else setErr(r.error)
                })
              }
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {pending ? <Spinner className="h-4 w-4" /> : gift && <Gift className="h-4 w-4" aria-hidden="true" />}
              {tr(gift ? t.accept : t.wAccept)}
            </button>
          )
        )}
        {info && <p className="mt-4 text-xs text-muted-foreground">{tr(gift ? t.note : t.wNote)}</p>}
      </div>
    </div>
  )
}
