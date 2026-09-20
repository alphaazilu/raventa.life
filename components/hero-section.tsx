'use client'

import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { t } from '@/lib/i18n'

export function HeroSection() {
  const { tr } = useLanguage()

  return (
    <section id="top" className="relative min-h-screen w-full overflow-hidden">
      <Image
        src="/images/hero-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/75" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-end px-4 pb-24 pt-32 text-center md:justify-center md:pb-32">
        <p className="mb-5 text-xs font-semibold tracking-brand text-white/85 uppercase md:text-sm">
          {tr(t.hero.eyebrow)}
        </p>
        <h1 className="text-balance font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
          {tr(t.hero.title)}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/90 md:text-lg">
          {tr(t.hero.subtitle)}
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {tr(t.hero.ctaPrimary)}
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#zones"
            className="inline-flex items-center gap-2 rounded-full border border-white/50 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            {tr(t.hero.ctaSecondary)}
          </a>
        </div>

        <p className="mt-12 text-[0.7rem] font-medium tracking-brand text-white/70 uppercase md:text-xs">
          {tr(t.hero.tagline)}
        </p>
      </div>
    </section>
  )
}
