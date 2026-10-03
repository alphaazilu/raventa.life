'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, QrCode, Share2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { QrSvg } from '@/components/ui/qr-svg'
import { Spinner } from '@/components/ui/spinner'
import { createShareLink, revokeShare } from '@/app/account/package-actions'
import type { MemberPackage } from '@/lib/packages'
import { cn } from '@/lib/utils'

const t = {
  share: { th: 'แชร์ให้เพื่อน', en: 'Share with a friend' },
  how: { th: 'ให้เพื่อนสแกน QR ด้วยกล้องมือถือ หรือส่งลิงก์ทางอีเมล — เพื่อนต้องเป็นสมาชิก (สมัครฟรีได้จากลิงก์)', en: 'Let your friend scan the QR, or email them the link — they sign in or join for free' },
  qr: { th: 'แสดง QR', en: 'Show QR' },
  qrNote: { th: 'ใช้ได้ {n} นาที ครั้งเดียว', en: 'Valid {n} min, once' },
  email: { th: 'อีเมลเพื่อน', en: 'Friend’s email' },
  send: { th: 'ส่ง', en: 'Send' },
  sent: { th: 'ส่งแล้ว — ลิงก์ใช้ได้ 7 วัน', en: 'Sent — the link works for 7 days' },
  friends: { th: 'เพื่อนที่ใช้ได้', en: 'Friends on this package' },
  remove: { th: 'เอาออก', en: 'Remove' },
  close: { th: 'ปิด', en: 'Close' },
  note: { th: 'ทุกคนใช้จากจำนวนครั้งเดียวกัน · แสตมป์เฉพาะคุณ', en: 'Everyone uses the same visits · stamps go to you only' },
}
const errors: Record<string, { th: string; en: string }> = {
  invalid_email: { th: 'อีเมลไม่ถูกต้อง', en: 'That email doesn’t look right' },
  limit: { th: 'สร้างลิงก์ครบจำนวนต่อวันแล้ว ลองพรุ่งนี้', en: 'Daily limit reached — try tomorrow' },
  not_shareable: { th: 'แพ็กเกจนี้แชร์ไม่ได้แล้ว', en: 'This package can’t be shared now' },
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

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary">
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
        {tr(t.share)}
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{tr(t.how)}</p>
        <button type="button" onClick={() => setOpen(false)} aria-label={tr(t.close)} className="text-muted-foreground">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {qr ? (
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
      {msg && <p className={cn('mt-2 text-xs font-semibold', msg.ok ? 'text-accent' : 'text-destructive')}>{msg.text}</p>}

      {pkg.sharedWith.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground">{tr(t.friends)}</p>
          <ul className="mt-1 divide-y divide-border">
            {pkg.sharedWith.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-1.5 text-sm">
                {f.name}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await revokeShare(f.id)
                      if (!r.ok) setMsg({ ok: false, text: err(r.error) })
                      router.refresh()
                    })
                  }
                  className="text-xs font-semibold text-muted-foreground hover:text-destructive"
                >
                  {tr(t.remove)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">{tr(t.note)}</p>
    </div>
  )
}
