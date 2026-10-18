'use client'

import { useEffect, useState } from 'react'
import { Camera, Check, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { QrScanner } from '@/components/admin/qr-scanner'
import { checkRefCode } from '@/app/login/referral-actions'
import { extractRefCode, REF_COOKIE, REF_RE, refCopy as c } from '@/lib/referral'
import { cn } from '@/lib/utils'

// "Referral code (optional)" on the sign-up forms (§36, v0.36): type a team
// member's code, or scan their referral QR with the camera. Posts `refCode`
// and `refVia` (code | qr) with the form. Starts from ?ref= (kept in a
// cookie through a Google/LINE round trip).

export function readRefCookie(): string {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${REF_COOKIE}=([^;]*)`))
    return m ? extractRefCode(decodeURIComponent(m[1])) : ''
  } catch {
    return ''
  }
}

export function ReferralField({ initial = '', inputClass }: { initial?: string; inputClass: string }) {
  const { tr } = useLanguage()
  const [code, setCode] = useState(initial)
  const [via, setVia] = useState<'code' | 'qr'>(initial ? 'qr' : 'code')
  const [who, setWho] = useState<{ code: string; name: string | null } | null>(null)
  const [scan, setScan] = useState(false)

  useEffect(() => {
    if (!initial) {
      const c = readRefCookie()
      if (c) {
        setCode(c)
        setVia('qr')
      }
    }
  }, [initial])

  const clean = extractRefCode(code)
  useEffect(() => {
    if (!REF_RE.test(clean)) return
    let alive = true
    const t = setTimeout(() => {
      void checkRefCode(clean).then((r) => alive && setWho({ code: clean, name: r?.firstName ?? null }))
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [clean])

  const status = !clean ? null : !REF_RE.test(clean) ? (clean.length >= 6 ? 'bad' : null) : who?.code !== clean ? 'checking' : who.name ? 'ok' : 'bad'

  return (
    <div>
      <label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground" htmlFor="refCode">
        {tr(c.label)}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="refCode"
          name="refCode"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, 12))
            setVia('code')
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="AB12CD"
          className={cn(inputClass, 'mt-0 flex-1 font-mono tracking-widest')}
        />
        <input type="hidden" name="refVia" value={via} />
        <button
          type="button"
          onClick={() => setScan(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-secondary"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          {tr(c.scan)}
        </button>
      </div>
      {status === 'ok' ? (
        <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {tr(c.found).replace('{name}', who!.name!)}
        </p>
      ) : status === 'bad' ? (
        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">{tr(c.notFound)}</p>
      ) : status === 'checking' ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{tr(c.checking)}</p>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">{tr(c.hint)}</p>
      )}

      {scan && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={tr(c.scanTitle)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="font-display text-base font-bold">{tr(c.scanTitle)}</p>
              <button type="button" onClick={() => setScan(false)} aria-label={tr(c.close)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mx-auto w-full max-w-[16rem]">
              <QrScanner
                round
                autoStart
                hint={null}
                paused={false}
                onCode={(text) => {
                  const got = extractRefCode(text)
                  if (!REF_RE.test(got)) return
                  setCode(got)
                  setVia('qr')
                  setScan(false)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
