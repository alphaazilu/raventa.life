'use client'

import Image from 'next/image'
import { useBrand } from '@/components/brand-provider'
import { BRAND } from '@/lib/brand/config'

// The full logo from Back Office › Settings › Brand (v0.39.0), falling back
// to /images/logo-full.png. An uploaded logo keeps its own proportions: the
// width/height here only set the intrinsic size; pages size it with CSS.
export function BrandFullLogo({ alt, className, priority }: { alt?: string; className?: string; priority?: boolean }) {
  const brand = useBrand()
  return (
    <Image
      src={brand.logoUrl}
      alt={alt ?? brand.name}
      width={BRAND.logos.full.width}
      height={BRAND.logos.full.height}
      priority={priority}
      className={className}
    />
  )
}
