// The spa's calendar runs on Bangkok time, whatever timezone the server
// (Vercel: UTC) or the tablet is set to.
export const SPA_TIMEZONE = 'Asia/Bangkok'

// Display-only ceiling for "people in the spa now" (see R1 §5 — proposed
// 40; not enforced by the database yet).
export const FLOOR_CAPACITY = 40

export function bangkokToday(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: SPA_TIMEZONE }).format(now)
}

export function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

export function bangkokTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: SPA_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
}

// 0–23 in Bangkok time.
export function bangkokHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: SPA_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)),
  )
}
