'use client'

import { useLanguage } from '@/components/language-provider'

type Bilingual = { th: string; en: string }
type Section = { heading: Bilingual; paragraphs: Bilingual[] }

export function LegalPage({
  heading,
  updated,
  sections,
}: {
  heading: Bilingual
  updated: Bilingual
  sections: Section[]
}) {
  const { tr } = useLanguage()

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <h1 className="font-display text-3xl font-extrabold text-foreground md:text-4xl">{tr(heading)}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{tr(updated)}</p>

      <div className="mt-10 space-y-10">
        {sections.map((section, i) => (
          <section key={i}>
            <h2 className="font-display text-xl font-bold text-foreground">{tr(section.heading)}</h2>
            <div className="mt-3 space-y-3">
              {section.paragraphs.map((p, j) => (
                <p key={j} className="text-sm leading-7 text-muted-foreground md:text-base md:leading-8">
                  {tr(p)}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <a
        href="/"
        className="mt-12 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline"
      >
        {tr({ th: '← กลับหน้าหลัก', en: '← Back to homepage' })}
      </a>
    </div>
  )
}
