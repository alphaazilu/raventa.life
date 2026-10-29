import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { LanguageProvider } from '@/components/language-provider'
import { BrandProvider } from '@/components/brand-provider'
import './globals.css'
import { getBrandInfo } from '@/lib/brand/settings'
import { BRAND } from '@/lib/brand/config'
import { DEFAULT_BRAND, HEX_COLOR } from '@/lib/brand/info'

// Self-hosted variable fonts (Sora, Noto Sans Thai) — avoids a next/font/google
// build-time fetch to fonts.googleapis.com, which some networks/sandboxes block.
// Files are the official Google Fonts variable fonts, converted to WOFF2
// (half the size of the TTFs) and placed in app/fonts/.
const sora = localFont({
  src: '../app/fonts/Sora-Variable.woff2',
  weight: '100 800',
  variable: '--font-sora',
  display: 'swap',
})

const notoSansThai = localFont({
  src: '../app/fonts/NotoSansThai-Variable.woff2',
  weight: '100 900',
  variable: '--font-noto',
  display: 'swap',
})

// Title, description, share picture and icons follow the brand settings
// (v0.39 / v0.41); the defaults give exactly the old values.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  const icon = brand.iconUrl
  return {
    title: brand.seoTitle,
    description: brand.seoDescription,
    generator: 'v0.app',
    icons: icon
      ? { icon: [{ url: icon }], apple: [{ url: icon }] }
      : {
          icon: [{ url: BRAND.logos.icon.src, sizes: '512x512', type: 'image/png' }],
          apple: [{ url: BRAND.logos.appleIcon.src, sizes: '180x180', type: 'image/png' }],
        },
    ...(brand.ogImageUrl ? { openGraph: { title: brand.seoTitle, description: brand.seoDescription, images: [{ url: brand.ogImageUrl }] } } : {}),
  }
}

// Brand colour from the database (schema.sql §53, v0.39.0), falling back to
// lib/brand/config.ts.
export async function generateViewport(): Promise<Viewport> {
  const brand = await getBrandInfo()
  return { colorScheme: 'light', themeColor: brand.color }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const brand = await getBrandInfo()
  // The brand colours are set in app/globals.css; override only the ones the
  // admin changed (each a validated #rrggbb — never raw input in the style tag).
  const overrides = (
    [
      ['--brand', brand.color, DEFAULT_BRAND.color],
      ['--brand-foreground', brand.fgColor, DEFAULT_BRAND.fgColor],
      ['--brand-accent', brand.accentColor, DEFAULT_BRAND.accentColor],
      ['--brand-soft', brand.softColor, DEFAULT_BRAND.softColor],
    ] as const
  ).filter(([, v, d]) => v !== d && HEX_COLOR.test(v))
  const brandCss = overrides.length ? `:root{${overrides.map(([k, v]) => `${k}:${v}`).join(';')}}` : null
  return (
    <html lang="th" className={`light ${sora.variable} ${notoSansThai.variable} bg-background`}>
      <body className="font-sans antialiased">
        {brandCss && <style>{brandCss}</style>}
        <BrandProvider value={brand}>
          <LanguageProvider>{children}</LanguageProvider>
        </BrandProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
