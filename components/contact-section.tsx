'use client'

import { MapPin, Clock, Phone, Mail, ArrowRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { t } from '@/lib/i18n'

export function ContactSection() {
  const { tr } = useLanguage()

  const info = [
    { icon: MapPin, label: tr(t.contact.addressLabel), value: tr(t.contact.address) },
    { icon: Clock, label: tr(t.contact.hoursLabel), value: tr(t.contact.hours) },
    { icon: Phone, label: tr(t.contact.phoneLabel), value: '+66 38 000 000' },
    { icon: Mail, label: tr(t.contact.emailLabel), value: 'hello@raventa.co' },
  ]

  return (
    <section id="contact" className="bg-secondary/40 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-brand uppercase text-primary">{tr(t.contact.eyebrow)}</p>
          <h2 className="mt-4 text-balance font-display text-3xl font-extrabold leading-tight text-foreground md:text-4xl lg:text-5xl">
            {tr(t.contact.heading)}
          </h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-2">
          <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-8">
            <ul className="space-y-6">
              {info.map((item, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-pretty leading-relaxed text-card-foreground">{item.value}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 border-t border-border pt-6">
              <a
                href="tel:+6638000000"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {tr(t.contact.cta)}
                <ArrowRight className="h-4 w-4" />
              </a>
              <p className="mt-3 text-center text-xs text-muted-foreground">{tr(t.contact.note)}</p>
            </div>
          </div>

          <div className="min-h-[360px] overflow-hidden rounded-2xl border border-border">
            <iframe
              title={tr(t.contact.address)}
              src="https://www.google.com/maps?q=Rayong,Thailand&z=12&output=embed"
              className="h-full min-h-[360px] w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
