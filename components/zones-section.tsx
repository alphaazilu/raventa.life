'use client'

import Image from 'next/image'
import { useLanguage } from '@/components/language-provider'
import { t, zones } from '@/lib/i18n'

export function ZonesSection() {
  const { tr } = useLanguage()

  return (
    <section id="zones" className="relative overflow-hidden bg-accent py-20 text-accent-foreground md:py-28">
      <div className="brand-rings pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-brand uppercase text-sand">{tr(t.zones.eyebrow)}</p>
          <h2 className="mt-4 text-balance font-display text-3xl font-extrabold leading-tight md:text-4xl lg:text-5xl">
            {tr(t.zones.heading)}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-accent-foreground/75">
            {tr(t.zones.intro)}
          </p>
          <a
            href="/quiz"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-sand/40 px-6 py-2.5 text-sm font-semibold text-sand transition-colors hover:bg-white/10"
          >
            {tr(t.nav.quiz)}
          </a>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {zones.map((zone) => (
            <article
              key={zone.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg"
            >
              {/* แบบ B: ครอปเฉพาะแถบภาพถ่าย (ประมาณ 14%–54% ของโปสเตอร์) ให้พ้นโลโก้ด้านบนและข้อความด้านล่าง */}
              <div className="relative aspect-video w-full overflow-hidden">
                <Image
                  src={zone.image}
                  alt={tr(zone.name)}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover object-[center_27%] transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
                  <span className="rounded-full bg-primary px-3 py-1 text-[0.65rem] font-semibold tracking-wide uppercase text-primary-foreground shadow">
                    {tr(zone.category)}
                  </span>
                  <span className="rounded-full bg-black/45 px-3 py-1 text-[0.7rem] font-semibold text-white backdrop-blur-sm">
                    {zone.meta}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <p className="font-display text-[0.7rem] font-semibold tracking-brand uppercase text-wood">
                  {zone.nameEn}
                </p>
                <h3 className="mt-1 font-display text-lg font-bold text-card-foreground">{tr(zone.name)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(zone.desc)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
