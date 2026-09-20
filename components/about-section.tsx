'use client'

import Image from 'next/image'
import { useLanguage } from '@/components/language-provider'
import { t } from '@/lib/i18n'

export function AboutSection() {
  const { tr } = useLanguage()

  return (
    <section id="about" className="relative overflow-hidden bg-background py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2 md:gap-16 md:px-6">
        <div className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
            <Image
              src="/images/about-pool.png"
              alt={tr({ th: 'บ่อน้ำร้อนท่ามกลางธรรมชาติ', en: 'Hot pool surrounded by nature' })}
              fill
              sizes="(min-width: 768px) 40vw, 100vw"
              className="object-cover object-center"
            />
          </div>
          <div className="absolute -bottom-6 -right-4 hidden rounded-xl border border-border bg-card px-6 py-5 shadow-lg md:block">
            <p className="font-display text-3xl font-extrabold text-primary">8</p>
            <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground">
              {tr({ th: 'โซนบำบัด', en: 'Therapy Zones' })}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-brand text-primary uppercase">{tr(t.about.eyebrow)}</p>
          <h2 className="mt-4 text-balance font-display text-3xl font-extrabold leading-tight text-foreground md:text-4xl lg:text-5xl">
            {tr(t.about.heading)}
          </h2>
          <p className="mt-6 text-pretty leading-relaxed text-foreground/80">{tr(t.about.body1)}</p>
          <p className="mt-4 text-pretty leading-relaxed text-foreground/80">{tr(t.about.body2)}</p>

          <p className="mt-8 font-display text-sm font-semibold tracking-brand text-wood uppercase">
            {tr(t.about.quote)}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {t.about.pillars.map((pillar, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-secondary/50 px-4 py-2 text-sm font-medium text-secondary-foreground"
              >
                {tr(pillar)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
