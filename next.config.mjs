import { readFileSync } from 'node:fs'

// Shown in the site footer. The version comes from package.json — bump it
// there with each release. The short commit hash is filled in by Vercel on
// every deploy (empty locally), so a footer screenshot always pins down
// exactly which build someone was looking at.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const commitSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)

// Content-Security-Policy: same-origin by default; explicit allowances only
// for what this site actually needs — Supabase (auth + data), Vercel
// Analytics, and the Google Maps embed on the contact section.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "frame-src https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Defense-in-depth against clickjacking; frame-ancestors above is the
  // modern equivalent but older browsers only respect this header.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_COMMIT_SHA: commitSha,
  },
  images: {
    unoptimized: true,
  },
  // v0.13: the Back Office moved from /admin to /console. Old links and
  // bookmarks (the counter tablet's included) keep working.
  async redirects() {
    return [
      { source: '/admin', destination: '/console', permanent: false },
      { source: '/admin/check-in', destination: '/console/desk', permanent: false },
      { source: '/admin/members/:id', destination: '/console/members/:id', permanent: false },
      { source: '/admin/:path*', destination: '/console', permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // The Back Office scans member QR codes with the camera (front desk,
      // tablet lock screen, pairing a device). Listed after the rule above so
      // this value wins for these pages.
      {
        source: '/console',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' }],
      },
      {
        source: '/console/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' }],
      },
    ]
  },
}

export default nextConfig
