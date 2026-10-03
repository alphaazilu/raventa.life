'use client'

import { useEffect, useMemo, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'

// A QR code as one SVG path (no canvas, no image URL — the site's
// security policy blocks blob: images, and a path scales crisply). The QR
// library is fetched when the code is first shown, not with the page.
type QrLib = typeof import('qrcode')
let qrLib: Promise<QrLib> | null = null

export function QrSvg({ text }: { text: string }) {
  const [lib, setLib] = useState<QrLib | null>(null)
  useEffect(() => {
    let alive = true
    // CommonJS module: the functions sit on .default once bundled.
    void (qrLib ??= import('qrcode').then((m) => ((m as { default?: QrLib }).default ?? m) as QrLib)).then((m) => alive && setLib(m))
    return () => {
      alive = false
    }
  }, [])
  const qr = useMemo(() => {
    if (!lib) return null
    const { modules } = lib.create(text, { errorCorrectionLevel: 'M' })
    let d = ''
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`
      }
    }
    return { size: modules.size, path: d }
  }, [lib, text])
  if (!qr) return <Spinner className="m-auto h-6 w-6 text-primary" />
  return (
    <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="h-full w-full" shapeRendering="crispEdges" aria-hidden="true">
      <path d={qr.path} fill="#1c1916" />
    </svg>
  )
}

