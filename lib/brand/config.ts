// Everything that makes this deployment "RAVENTA" in one place (v0.38.33):
// names, brand colours, logos and contact details. The rest of the code
// reads these instead of repeating the values, so a later multi-tenant
// version can swap this object for one loaded per shop.
//
// Safe on both server and client (plain values, no secrets).
//
// v0.39.0: the name (TH/EN), colour, full logo and contact details can be
// changed by an admin (Back Office › Settings › Brand, schema.sql §53). The
// site reads them through lib/brand/settings.ts → useBrand(); the values
// here are the seed and the fallback when the database can't be read.
//
// Not covered here (can't import TS — keep in step by hand):
//   app/globals.css                  --brand / --brand-checkpoint (CSS variables)
//   public/console.webmanifest       name, short_name, icons
//   supabase/email-templates/*.html  Supabase Auth emails (pasted into the dashboard)

type L = { th: string; en: string }
type Logo = { src: string; width: number; height: number }

export const BRAND = {
  /** Short name used in copy: "Welcome to RAVENTA". */
  name: 'RAVENTA',
  /** Title-case form used in some English prose. */
  nameTitle: 'Raventa',
  /** Thai spelling. */
  nameTh: 'ราเวนต้า',
  fullName: 'RAVENTA Wellness Retreat',
  backOfficeName: 'RAVENTA Back Office',
  /** Home-screen app name on the counter tablet. */
  appShortName: 'RAVENTA BO',
  /** Lower-case prefix for downloaded files: raventa-feedback-….csv */
  slug: 'raventa',
  /** Public site — the fallback when the SITE_URL env var isn't set. */
  siteUrl: 'https://www.raventawellness.com',
  domain: 'raventawellness.com',

  colors: {
    /** RAVENTA RED. CSS uses var(--brand) (app/globals.css) — same value. */
    primary: '#8b1e2d',
    primaryForeground: '#f6f1e7',
    /** The red on printed check-point QR sheets. CSS: var(--brand-checkpoint). */
    checkpointPrint: '#8D1821',
    /** The dark band (footer, info boxes) — FOREST. CSS: var(--brand-accent). */
    accent: '#2e4636',
    /** Tiles and chips — SAGE. CSS: var(--brand-soft). */
    soft: '#eef4ec',
    /** Dark text, the other choice for text on a light brand colour. */
    ink: '#2b2521',
  },

  logos: {
    full: { src: '/images/logo-full.png', width: 1166, height: 620 },
    emblem: { src: '/images/logo-emblem.png', width: 405, height: 404 },
    wordmark: { src: '/images/logo-wordmark.png', width: 1166, height: 157 },
    /** Favicon + home-screen icon (v0.41: moved from app/icon.png, app/apple-icon.png) */
    icon: { src: '/images/app-icon.png', width: 512, height: 512 },
    appleIcon: { src: '/images/app-icon-180.png', width: 180, height: 180 },
  } satisfies Record<string, Logo>,

  /** Where the shop is (hero line, footer ©, page title). */
  city: { th: 'ระยอง', en: 'Rayong' } satisfies L,
  tagline: { th: 'NATURE MEETS MODERN WELLNESS', en: 'NATURE MEETS MODERN WELLNESS' } satisfies L,
  hours: { th: 'ทุกวัน 09:00 – 21:00 น.', en: 'Daily 9:00 AM – 9:00 PM' } satisfies L,
  visitNote: { th: 'Walk-in ได้ทุกวัน ไม่ต้องจองล่วงหน้า', en: 'Walk in any day, no booking needed.' } satisfies L,
  /** Map pin for the embedded map on the home page. */
  map: { lat: 12.6700258, lng: 101.189248 },

  contact: {
    phoneDisplay: '080-429-4264',
    phoneTel: '+66804294264',
    email: 'raventa.wellness@gmail.com',
    lineHref: 'https://line.me/R/ti/p/@630xxrfx',
    address: {
      th: 'ราเวนต้า 18 ถนนเลียบชายหาดสุชาดา ต.เนินพระ อ.เมืองระยอง จ.ระยอง 21150',
      en: 'RAVENTA, 18 Liab Chai Hat Suchada Road, Noen Phra, Mueang Rayong, Rayong 21150, Thailand',
    } satisfies L,
    googleMapsUrl:
      'https://www.google.com/maps/place/RAVENTA+WELLNESS+RETREAT/@12.6700258,101.189248,17z/data=!3m1!4b1!4m6!3m5!1s0x3102fb006e69d6a5:0xe047a17c77b8c405!8m2!3d12.6700258!4d101.189248!16s%2Fg%2F11nr4ft5_l',
    googleMapsEmbedUrl: 'https://www.google.com/maps?q=12.6700258,101.189248&z=17&output=embed',
  },
} as const
