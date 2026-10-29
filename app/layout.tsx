import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { LanguageProvider } from '@/components/language-provider'
import { BrandProvider } from '@/components/brand-provider'
import './globals.css'
import { getBrandInfo } from '@/lib/brand/settings'
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

// The site name in the default title follows the brand settings (§53).
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `${brand.fullName} | Contrast Therapy · Sauna · Rayong`,
    description: `${brand.fullName}, Rayong — Contrast therapy, hot pools, cold plunge, sauna, steam room and sun bath. Recover, Rebalance, Revive. Return to your best self.`,
    generator: 'v0.app',
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
  // --brand is set in app/globals.css; override it only when the admin chose
  // another colour (validated #rrggbb — never raw input into the style tag).
  const brandCss = brand.color !== DEFAULT_BRAND.color && HEX_COLOR.test(brand.color) ? `:root{--brand:${brand.color}}` : null
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
