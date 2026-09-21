'use client'

import Image from 'next/image'
import { useLanguage } from '@/components/language-provider'
import { t } from '@/lib/i18n'

const links = [
  { href: '#about', key: 'about' as const },
  { href: '#zones', key: 'zones' as const },
  { href: '#benefits', key: 'benefits' as const },
  { href: '#contact', key: 'contact' as const },
]

export function SiteFooter() {
  const { tr } = useLanguage()

  return (
    <footer className="bg-accent text-accent-foreground">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <div className="flex flex-col items-center gap-8 text-center">
          <Image
            src="/images/logo-icon.png"
            alt="RAVENTA Wellness Center"
            width={64}
            height={64}
            className="h-16 w-16 rounded-xl object-cover"
          />
          <div>
            <p className="font-display text-2xl font-extrabold tracking-wide">RAVENTA</p>
            <p className="mt-2 text-xs font-medium tracking-brand uppercase text-sand/80">{tr(t.footer.tagline)}</p>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {links.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className="text-sm font-medium text-accent-foreground/80 transition-colors hover:text-white"
              >
                {tr(t.nav[link.key])}
              </a>
            ))}
          </nav>

          <p className="font-display text-lg font-semibold italic text-sand">{tr(t.footer.return)}</p>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-center text-xs text-accent-foreground/60">
          <nav className="flex items-center gap-x-6">
            <a href="/privacy" className="transition-colors hover:text-white">
              {tr(t.footer.privacyLink)}
            </a>
            <a href="/terms" className="transition-colors hover:text-white">
              {tr(t.footer.termsLink)}
            </a>
          </nav>
          <p>
            &copy; {new Date().getFullYear()} RAVENTA Wellness Center, Rayong. {tr(t.footer.rights)}
          </p>
        </div>
      </div>
    </footer>
  )
}
