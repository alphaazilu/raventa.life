'use client'

import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'

type Sticker = { id: string; name: string; place: string | null; url: string; version: number }

const t = {
  title: { th: 'พิมพ์ QR จุดตรวจ', en: 'Print check-point QR' },
  hint: { th: 'พิมพ์แล้วตัดติดตามจุด · ถ้าออก QR ใหม่ แผ่นเดิมจะใช้ไม่ได้', en: 'Print, cut and stick at each point · a new QR retires the old sticker' },
  print: { th: 'พิมพ์', en: 'Print' },
  how: { th: 'พนักงาน: สแกนด้วยมือถือ (บัญชีพนักงาน)', en: 'Staff: scan with your phone (staff account)' },
  none: { th: 'ไม่มีจุดที่เปิดใช้งาน', en: 'No active points' },
}

// One A4 page holds four stickers (2 × 2); each cuts out on its own.
export function PrintStickers({ stickers }: { stickers: Sticker[] }) {
  const { tr } = useLanguage()
  const [images, setImages] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    ;(async () => {
      const QRCode = (await import('qrcode')).default
      const out: Record<string, string> = {}
      for (const s of stickers) out[s.id] = await QRCode.toDataURL(s.url, { errorCorrectionLevel: 'M', margin: 1, width: 600, color: { dark: '#1a1a1a', light: '#ffffff' } })
      if (alive) setImages(out)
    })()
    return () => {
      alive = false
    }
  }, [stickers])

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 print:max-w-none print:p-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{tr(t.title)}</h1>
          <p className="text-sm text-muted-foreground">{tr(t.hint)}</p>
        </div>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
          <Printer className="h-4 w-4" aria-hidden="true" />
          {tr(t.print)}
        </button>
      </div>
      {stickers.length === 0 && <p className="text-sm text-muted-foreground">{tr(t.none)}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-0">
        {stickers.map((s) => (
          <div key={s.id} className="flex break-inside-avoid flex-col items-center rounded-2xl border-2 border-dashed border-border bg-white p-6 text-center text-[#1a1a1a] print:h-[148mm] print:justify-center print:rounded-none">
            <p className="text-xs font-bold tracking-[0.3em] text-[#8D1821]">RAVENTA · CHECK POINT</p>
            <p className="mt-2 font-display text-3xl font-extrabold">{s.name}</p>
            {s.place && <p className="mt-1 text-sm text-neutral-600">{s.place}</p>}
            {images[s.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[s.id]} alt={s.name} className="mt-4 h-56 w-56" />
            ) : (
              <div className="mt-4 h-56 w-56 animate-pulse rounded-xl bg-neutral-100" />
            )}
            <p className="mt-3 text-xs text-neutral-600">{tr(t.how)}</p>
            <p className="mt-1 text-[10px] text-neutral-400">v{s.version}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
