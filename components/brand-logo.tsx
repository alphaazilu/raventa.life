'use client'

import Image from 'next/image'
import { useLanguage } from '@/components/language-provider'
import { useBrand } from '@/components/brand-provider'
import { BRAND } from '@/lib/brand/config'
import { cn } from '@/lib/utils'

// Logos from Back Office › Settings › Brand (v0.39 full logo; v0.41 the
// emblem and the word logo), falling back to the files in /images. An
// uploaded logo keeps its own proportions: width/height here only set the
// intrinsic size; pages size it with CSS.

type P = { alt?: string; className?: string; priority?: boolean }

export function BrandFullLogo({ alt, className, priority }: P) {
  const brand = useBrand()
  return <Image src={brand.logoUrl} alt={alt ?? brand.name} width={BRAND.logos.full.width} height={BRAND.logos.full.height} priority={priority} className={className} />
}

/** The round mark. alt defaults to "" (it sits next to the word logo). */
export function BrandEmblem({ alt = '', className, priority }: P) {
  const brand = useBrand()
  // object-contain: an uploaded mark that isn't square isn't stretched
  return <Image src={brand.emblemUrl} alt={alt} width={BRAND.logos.emblem.width} height={BRAND.logos.emblem.height} priority={priority} className={cn(className, 'object-contain')} />
}

export function BrandWordmark({ alt, className, priority }: P) {
  const brand = useBrand()
  return <Image src={brand.wordmarkUrl} alt={alt ?? brand.name} width={BRAND.logos.wordmark.width} height={BRAND.logos.wordmark.height} priority={priority} className={className} />
}

/** The tagline in the visitor's language (loading screen, hero, footer). */
export function BrandTagline() {
  const { tr } = useLanguage()
  const brand = useBrand()
  return <>{tr(brand.tagline)}</>
}

// Social links: drawn here (the icon set has no brand logos).
const SOCIAL_PATHS: Record<'facebook' | 'instagram' | 'tiktok', string> = {
  facebook: 'M14 8.5V6.8c0-.8.5-1 1-1h2V2.2h-2.8C11.2 2.2 10.4 4.4 10.4 6v2.5H8v3.6h2.4V22H14v-9.9h2.7l.4-3.6H14z',
  instagram:
    'M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3zm0 7.8a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2zM17 5.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM20.9 7.3c-.1-1.5-.4-2.8-1.5-3.9S17 2 15.5 1.9C14 1.8 9.9 1.8 8.5 1.9 7 2 5.7 2.3 4.6 3.4S3.1 5.8 3 7.3c-.1 1.5-.1 5.9 0 7.4.1 1.5.4 2.8 1.6 3.9s2.4 1.5 3.9 1.5c1.5.1 5.6.1 7.1 0 1.5-.1 2.8-.4 3.9-1.5s1.5-2.4 1.5-3.9c.1-1.5.1-5.9 0-7.4zm-2 9.3a3 3 0 0 1-1.7 1.7c-1.2.5-4 .4-5.2.4s-4.1.1-5.2-.4a3 3 0 0 1-1.7-1.7c-.5-1.2-.4-4-.4-5.2s-.1-4.1.4-5.2A3 3 0 0 1 6.7 4.5c1.2-.5 4-.4 5.2-.4s4.1-.1 5.2.4a3 3 0 0 1 1.7 1.7c.5 1.2.4 4 .4 5.2s.1 4.1-.4 5.2z',
  tiktok: 'M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 5 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.3-1.6z',
}
const SOCIAL_LABEL = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' } as const

/** Round icon links to the socials that are set (nothing when none are). */
export function BrandSocials({ className, linkClassName }: { className?: string; linkClassName?: string }) {
  const brand = useBrand()
  const items = (Object.keys(SOCIAL_PATHS) as (keyof typeof SOCIAL_PATHS)[]).filter((k) => brand.socials[k])
  if (items.length === 0) return null
  return (
    <div className={className}>
      {items.map((k) => (
        <a key={k} href={brand.socials[k]!} target="_blank" rel="noreferrer" aria-label={SOCIAL_LABEL[k]} title={SOCIAL_LABEL[k]} className={linkClassName}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d={SOCIAL_PATHS[k]} />
          </svg>
        </a>
      ))}
    </div>
  )
}
