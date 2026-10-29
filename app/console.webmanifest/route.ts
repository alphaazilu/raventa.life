import { getBrandInfo } from '@/lib/brand/settings'
import { appShortName, backOfficeName } from '@/lib/brand/info'

// The counter tablet's "Add to Home Screen" app (was public/console.webmanifest
// until v0.41.3): name and icon follow the brand settings. The defaults give
// exactly the old file. An uploaded icon (Settings › Brand: square PNG,
// ≥512px) replaces the built-in pair; it isn't marked maskable since it may
// not leave the safe zone.
// Rendered per request (the brand row itself is cached), so a brand save
// shows up without a rebuild.
export const dynamic = 'force-dynamic'

export async function GET() {
  const brand = await getBrandInfo()
  const icons = brand.iconUrl
    ? [{ src: brand.iconUrl, sizes: '512x512', type: 'image/png', purpose: 'any' }]
    : [
        { src: '/images/console-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/console-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ]
  const manifest = {
    name: backOfficeName(brand),
    short_name: appShortName(brand),
    description: `${brand.fullName} — Back Office`,
    id: '/console',
    start_url: '/tablet',
    scope: '/',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'th',
    icons,
  }
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=0, must-revalidate' },
  })
}
