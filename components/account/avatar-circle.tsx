'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

// Round profile picture. Shows the photo if there is one, otherwise the
// first letter of the name on the brand colour. Also falls back to the
// letter if the photo link has stopped working (e.g. an old LINE picture).
export function AvatarCircle({
  src,
  name,
  className,
}: {
  src: string | null
  name: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  // Skip Thai leading vowels (เ แ โ ใ ไ) so "เอก" shows "อ", not "เ".
  const initial = (name.trim().replace(/^[เแโใไ]+/, '')[0] ?? '?').toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-display font-bold text-primary-foreground',
        className,
      )}
      aria-hidden="true"
    >
      {src && !broken ? (
        // Plain <img>: the photo is a short-lived signed link (or a LINE/
        // Google URL), which Next's image optimiser has no use for here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initial
      )}
    </span>
  )
}
