'use client'

import { MapPin, Clock, Phone, Mail, ArrowRight, ExternalLink } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { t } from '@/lib/i18n'

const PHONE_DISPLAY = '080-429-4264'
const PHONE_TEL = '+66804294264'
const EMAIL = 'raventa.wellness@gmail.com'
const GOOGLE_MAPS_URL =
  'https://www.google.com/maps/place/RAVENTA+WELLNESS+RETREAT/@12.6700258,101.189248,17z/data=!3m1!4b1!4m6!3m5!1s0x3102fb006e69d6a5:0xe047a17c77b8c405!8m2!3d12.6700258!4d101.189248!16s%2Fg%2F11nr4ft5_l'
const GOOGLE_MAPS_EMBED_URL = 'https://www.google.com/maps?q=12.6700258,101.189248&z=17&output=embed'

export function ContactSection() {
  const { tr } = useLanguage()

  const info = [
    { icon: MapPin, label: tr(t.contact.addressLabel), value: tr(t.contact.address), href: GOOGLE_MAPS_URL, external: true },
    { icon: Clock, label: tr(t.contact.hoursLabel), value: tr(t.contact.hours) },
    { icon: Phone, label: tr(t.contact.phoneLabel), value: PHONE_DISPLAY, href: `tel:${PHONE_TEL}` },
    { icon: Mail, label: tr(t.contact.emailLabel), value: EMAIL, href: `mailto:${EMAIL}` },
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
                    {item.href ? (
                      <a
                        href={item.href}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noopener noreferrer' : undefined}
                        className="mt-1 inline-block text-pretty leading-relaxed text-card-foreground underline-offset-2 hover:text-primary hover:underline"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="mt-1 text-pretty leading-relaxed text-card-foreground">{item.value}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 border-t border-border pt-6">
              <a
                href={`tel:${PHONE_TEL}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {tr(t.contact.cta)}
                <ArrowRight className="h-4 w-4" />
              </a>
              <p className="mt-3 text-center text-xs text-muted-foreground">{tr(t.contact.note)}</p>
            </div>
          </div>

          <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-border">
            <iframe
              title={tr(t.contact.address)}
              src={GOOGLE_MAPS_EMBED_URL}
              className="h-full min-h-[360px] w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a
              href={GOOGLE_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-card px-4 py-2 text-xs font-semibold text-card-foreground shadow-md transition-colors hover:text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {tr({ th: 'เปิดใน Google Maps', en: 'Open in Google Maps' })}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
