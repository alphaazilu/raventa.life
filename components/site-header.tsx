'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu, X, Globe } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const links = [
  { href: '#about', key: 'about' as const },
  { href: '#zones', key: 'zones' as const },
  { href: '#benefits', key: 'benefits' as const },
  { href: '/quiz', key: 'quiz' as const },
  { href: '#contact', key: 'contact' as const },
]

export function SiteHeader() {
  const { tr, lang, toggle } = useLanguage()
  const pathname = usePathname()
  const isHome = pathname === '/'
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // On any page other than the homepage there is no dark hero behind the
  // header, so force the solid/dark-text style regardless of scroll position.
  const solid = scrolled || !isHome

  // Hash-only links only work while already on the homepage; elsewhere they
  // need to point back to "/" first so they actually navigate home.
  const resolveHref = (href: string) => (href.startsWith('#') && !isHome ? `/${href}` : href)
  const homeHref = isHome ? '#top' : '/'

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        solid ? 'bg-background/90 backdrop-blur-md border-b border-border shadow-sm' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:h-20 md:px-6">
        <a href={homeHref} className="flex items-center gap-3">
          <Image
            src="/images/logo-icon.png"
            alt="RAVENTA Wellness Center"
            width={44}
            height={44}
            className="h-10 w-10 rounded-md object-cover md:h-11 md:w-11"
            priority
          />
          <span
            className={cn(
              'font-display text-lg font-bold tracking-wide transition-colors md:text-xl',
              solid ? 'text-primary' : 'text-white',
            )}
          >
            RAVENTA
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.key}
              href={resolveHref(link.href)}
              className={cn(
                'text-sm font-medium transition-colors hover:text-primary',
                solid ? 'text-foreground/80' : 'text-white/90',
              )}
            >
              {tr(t.nav[link.key])}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-label="Switch language"
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              solid
                ? 'border-border text-foreground/80 hover:border-primary hover:text-primary'
                : 'border-white/40 text-white hover:bg-white/10',
            )}
          >
            <Globe className="h-3.5 w-3.5" />
            <span className={lang === 'th' ? 'text-primary' : solid ? 'text-foreground' : 'text-white'}>TH</span>
            <span className="opacity-40">/</span>
            <span className={lang === 'en' ? 'text-primary' : solid ? 'text-foreground' : 'text-white'}>EN</span>
          </button>

          <a
            href={resolveHref('#contact')}
            className="hidden rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 md:inline-flex"
          >
            {tr(t.nav.book)}
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            className={cn('md:hidden', solid ? 'text-foreground' : 'text-white')}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-4 py-4">
            {links.map((link) => (
              <a
                key={link.key}
                href={resolveHref(link.href)}
                onClick={() => setOpen(false)}
                className="border-b border-border/60 py-3 text-sm font-medium text-foreground/80 last:border-0"
              >
                {tr(t.nav[link.key])}
              </a>
            ))}
            <a
              href={resolveHref('#contact')}
              onClick={() => setOpen(false)}
              className="mt-4 rounded-full bg-primary px-5 py-3 text-center text-sm font-semibold text-primary-foreground"
            >
              {tr(t.nav.book)}
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
