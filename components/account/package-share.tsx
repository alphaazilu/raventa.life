'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Mail, QrCode, Share2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { QrSvg } from '@/components/ui/qr-svg'
import { Spinner } from '@/components/ui/spinner'
import { createShareLink, revokeShare } from '@/app/account/package-actions'
import { packageLeft, pieceOpen, type MemberPackage } from '@/lib/packages'
import { bangkokToday } from '@/lib/check-in/day'
import { cn } from '@/lib/utils'

const t = {
  share: { th: 'ส่งเป็นของขวัญ', en: 'Send as a gift' },
  how: { th: 'ส่ง Day Pass 1 ครั้งเป็นของขวัญ ให้เพื่อนสแกน QR หรือส่งลิงก์ทางอีเมล — เพื่อนจะได้บัตร Gift Voucher ในบัญชีของเขา (ต้องเป็นสมาชิก สมัครฟรีได้จากลิงก์)', en: 'Gift a friend one Day Pass. Let them scan the QR or email the link — they get a gift voucher in their account (sign in or join for free)' },
  none: { th: 'ไม่มีครั้งเหลือให้แบ่งแล้ว', en: 'No visits left to give' },
  qr: { th: 'แสดง QR', en: 'Show QR' },
  qrNote: { th: 'ใช้ได้ {n} นาที ครั้งเดียว', en: 'Valid {n} min, once' },
  email: { th: 'อีเมลเพื่อน', en: 'Friend’s email' },
  send: { th: 'ส่ง', en: 'Send' },
  sent: { th: 'ส่งแล้ว — ลิงก์ใช้ได้ 7 วัน', en: 'Sent — the link works for 7 days' },
  friends: { th: 'ส่งให้แล้ว', en: 'Sent to' },
  pieceLeft: { th: 'ยังไม่ใช้ {n}/{t}', en: '{n} of {t} unused' },
  pieceUsed: { th: 'ใช้แล้ว', en: 'Used' },
  pieceExpired: { th: 'หมดอายุ', en: 'Expired' },
  remove: { th: 'ดึงคืน', en: 'Take back' },
  close: { th: 'ปิด', en: 'Close' },
  note: { th: 'หักจากแพ็กเกจของคุณเมื่อเพื่อนกดรับ · ดึงคืนได้ถ้าเพื่อนยังไม่ได้ใช้ · แสตมป์เฉพาะคุณ', en: 'Taken off your package when your friend accepts · take back unused visits any time · stamps go to you only' },
}
// Whole-package sharing (families, couples): friends join the package.
const w = {
  share: { th: 'แชร์ให้ครอบครัว/เพื่อนใช้ร่วม', en: 'Share with family or a friend' },
  how: { th: 'คนที่รับลิงก์จะใช้แพ็กเกจนี้ร่วมกับคุณ ให้สแกน QR หรือส่งลิงก์ทางอีเมล — ต้องเป็นสมาชิก (สมัครฟรีได้จากลิงก์)', en: 'Whoever accepts uses this package with you. Let them scan the QR, or email the link — they sign in or join for free' },
  none: { th: 'แพ็กเกจนี้ไม่มีครั้งเหลือแล้ว', en: 'No visits left on this package' },
  friends: { th: 'ใช้ร่วมกับ', en: 'Shared with' },
  remove: { th: 'เอาออก', en: 'Remove' },
  note: { th: 'ทุกคนใช้จากจำนวนครั้งเดียวกัน · แสตมป์เฉพาะคุณ', en: 'Everyone uses the same visits · stamps go to you only' },
}
const errors: Record<string, { th: string; en: string }> = {
  invalid_email: { th: 'อีเมลไม่ถูกต้อง', en: 'That email doesn’t look right' },
  limit: { th: 'สร้างลิงก์ครบจำนวนต่อวันแล้ว ลองพรุ่งนี้', en: 'Daily limit reached — try tomorrow' },
  not_shareable: { th: 'แพ็กเกจนี้แบ่งไม่ได้แล้ว', en: 'This package can’t be shared now' },
  nothing_left: { th: 'เพื่อนใช้ครบแล้ว ดึงคืนไม่ได้', en: 'Already used — nothing to take back' },
  send_failed: { th: 'ส่งอีเมลไม่สำเร็จ', en: 'Couldn’t send the email' },
  failed: { th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Something went wrong — try again' },
}

// Under one of the member's own shareable packages (§23).
export function PackageShare({ pkg }: { pkg: MemberPackage }) {
  const { tr } = useLanguage()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState<{ url: string; minutes: number } | null>(null)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const err = (code: string) => tr(errors[code] ?? errors.failed)
  const copy = pkg.shareWhole ? { ...t, ...w } : t
  const left = packageLeft(pkg)
  const canShare = left === null ? pkg.shareWhole : left > 0
  // Everyone it was shared with; gifts already used or expired stay listed
  // (no take-back button) so the owner sees where each visit went.
  const today = bangkokToday()
  const friends = pkg.sharedWith

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary">
        {pkg.shareWhole ? <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Gift className="h-3.5 w-3.5" aria-hidden="true" />}
        {tr(copy.share)}
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{tr(copy.how)}</p>
        <button type="button" onClick={() => setOpen(false)} aria-label={tr(t.close)} className="text-muted-foreground">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {!canShare && !qr ? (
        <p className="mt-3 text-sm font-semibold text-muted-foreground">{tr(copy.none)}</p>
      ) : qr ? (
        <div className="mt-3 flex flex-col items-center">
          <div className="h-48 w-48 rounded-xl bg-white p-2">
            <QrSvg text={qr.url} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{tr(t.qrNote).replace('{n}', String(qr.minutes))}</p>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null)
              const r = await createShareLink(pkg.id)
              if (r.ok) setQr(r.data)
              else setMsg({ ok: false, text: err(r.error) })
            })
          }
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? <Spinner className="h-4 w-4" /> : <QrCode className="h-4 w-4" aria-hidden="true" />}
          {tr(t.qr)}
        </button>
      )}

      {canShare && (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            setMsg(null)
            const r = await createShareLink(pkg.id, email)
            if (r.ok) {
              setEmail('')
              setMsg({ ok: true, text: tr(t.sent) })
            } else setMsg({ ok: false, text: err(r.error) })
          })
        }}
        className="mt-3 flex gap-2"
      >
        <span className="relative min-w-0 flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={tr(t.email)}
            aria-label={tr(t.email)}
            required
            className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-3 text-base outline-none focus:border-primary sm:text-sm"
          />
        </span>
        <button type="submit" disabled={pending || !email} className="h-10 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40">
          {tr(t.send)}
        </button>
      </form>
      )}
      {msg && <p className={cn('mt-2 text-xs font-semibold', msg.ok ? 'text-accent' : 'text-destructive')}>{msg.text}</p>}

      {friends.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground">{tr(copy.friends)}</p>
          <ul className="mt-1 divide-y divide-border">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0">
                  {f.name}
                  {f.kind === 'piece' && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {pieceOpen(f, today)
                        ? tr(t.pieceLeft)
                            .replace('{n}', String((f.total ?? 0) - (f.used ?? 0)))
                            .replace('{t}', String(f.total ?? 0))
                        : tr((f.used ?? 0) >= (f.total ?? 0) ? t.pieceUsed : t.pieceExpired)}
                    </span>
                  )}
                </span>
                {pieceOpen(f, today) && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await revokeShare(f.id, f.kind)
                      if (!r.ok) setMsg({ ok: false, text: err(r.error) })
                      setQr(null)
                      router.refresh()
                    })
                  }
                  className="text-xs font-semibold text-muted-foreground hover:text-destructive"
                >
                  {tr(copy.remove)}
                </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">{tr(copy.note)}</p>
    </div>
  )
}
