import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { LanguageProvider } from '@/components/language-provider'
import './globals.css'

// Self-hosted variable fonts (Sora, Noto Sans Thai) — avoids a next/font/google
// build-time fetch to fonts.googleapis.com, which some networks/sandboxes block.
// Files are the official Google Fonts variable TTFs, placed in app/fonts/.
const sora = localFont({
  src: '../app/fonts/Sora-Variable.ttf',
  weight: '100 800',
  variable: '--font-sora',
  display: 'swap',
})

const notoSansThai = localFont({
  src: '../app/fonts/NotoSansThai-Variable.ttf',
  weight: '100 900',
  variable: '--font-noto',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'RAVENTA Wellness Center | Contrast Therapy · Sauna · Rayong',
  description:
    'RAVENTA Wellness Center, Rayong — Contrast therapy, hot pools, cold plunge, sauna, steam room and sun bath. Recover, Rebalance, Revive. Return to your best self.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#8b1e2d',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="th" className={`light ${sora.variable} ${notoSansThai.variable} bg-background`}>
      <body className="font-sans antialiased">
        <LanguageProvider>{children}</LanguageProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
