'use client'

import { useState, useTransition } from 'react'
import { Package } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Spinner } from '@/components/ui/spinner'
import { acceptShareLink, type ShareInfo } from '@/app/account/package-actions'

const t = {
  title: { th: 'คุณ{n} แชร์แพ็กเกจให้คุณ', en: '{n} shared a package with you' },
  left: { th: 'เหลือ {n} ครั้ง (ใช้ร่วมกับเจ้าของ)', en: '{n} visits left (shared with the owner)' },
  accept: { th: 'รับแพ็กเกจ', en: 'Accept' },
  done: { th: 'รับแล้ว — ใช้เช็คอินที่เคาน์เตอร์ได้เลย', en: 'Done — use it at the counter' },
  toAccount: { th: 'ไปที่บัญชีของฉัน', en: 'Go to my account' },
  note: { th: 'ได้ Day Pass จากแพ็กเกจนี้ ไม่ได้แสตมป์สะสม · เจ้าของเอาคุณออกได้ทุกเมื่อ', en: 'Day Pass from this package, no stamps · the owner can remove you any time' },
}
const errors: Record<string, { th: string; en: string }> = {
  invalid: { th: 'ลิงก์ไม่ถูกต้อง', en: 'This link isn’t valid' },
  used: { th: 'ลิงก์นี้ถูกใช้ไปแล้ว — ขอลิงก์ใหม่จากเพื่อน', en: 'This link was already used — ask for a new one' },
  expired: { th: 'ลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่จากเพื่อน', en: 'This link has expired — ask for a new one' },
  not_shareable: { th: 'แพ็กเกจนี้แชร์ไม่ได้แล้ว (หมดครั้งหรือหมดอายุ)', en: 'This package can’t be shared any more' },
  own_package: { th: 'นี่คือแพ็กเกจของคุณเอง', en: 'This is your own package' },
  failed: { th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Something went wrong — try again' },
}

export function AcceptShare({ token, info, error }: { token: string; info: ShareInfo | null; error: string | null }) {
  const { tr } = useLanguage()
  const [pending, start] = useTransition()
  const [err, setErr] = useState(error)
  const [done, setDone] = useState(false)

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <Package className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        {info && (
          <>
            <h1 className="mt-3 font-display text-xl font-extrabold">{tr(t.title).replace('{n}', info.ownerName)}</h1>
            <p className="mt-2 text-lg font-semibold">{info.packageName}</p>
            {info.visitsLeft !== null && <p className="text-sm text-muted-foreground">{tr(t.left).replace('{n}', String(info.visitsLeft))}</p>}
          </>
        )}
        {err && <p className="mt-4 text-sm font-semibold text-destructive">{tr(errors[err] ?? errors.failed)}</p>}
        {done ? (
          <>
            <p className="mt-4 text-sm font-semibold text-accent">{tr(t.done)}</p>
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
              {pending && <Spinner className="h-4 w-4" />}
              {tr(t.accept)}
            </button>
          )
        )}
        <p className="mt-4 text-xs text-muted-foreground">{tr(t.note)}</p>
      </div>
    </div>
  )
}
