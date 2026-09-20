'use client'

import { Activity, HeartPulse, Brain, ShieldCheck, Moon, Sparkles, type LucideIcon } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { t, benefits, type BenefitKey } from '@/lib/i18n'

const icons: Record<BenefitKey, LucideIcon> = {
  circulation: Activity,
  recovery: HeartPulse,
  stress: Sparkles,
  immunity: ShieldCheck,
  sleep: Moon,
  clarity: Brain,
}

export function BenefitsSection() {
  const { tr } = useLanguage()

  return (
    <section id="benefits" className="bg-background py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-brand uppercase text-primary">{tr(t.benefits.eyebrow)}</p>
          <h2 className="mt-4 text-balance font-display text-3xl font-extrabold leading-tight text-foreground md:text-4xl lg:text-5xl">
            {tr(t.benefits.heading)}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            {tr(t.benefits.intro)}
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => {
            const Icon = icons[benefit.id]
            return (
              <div
                key={benefit.id}
                className="rounded-2xl border border-border bg-card p-7 transition-shadow hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-card-foreground">{tr(benefit.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tr(benefit.desc)}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
