// Dates shown to members, in Thailand's time zone. Thai uses the Buddhist
// year (2569), which th-TH gives by default. English is built as
// "29 Sep 2026" by hand, since browsers differ on "Sep" vs "Sept".
export function formatMemberDate(iso: string | null, lang: 'th' | 'en', withDay: boolean): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  if (lang === 'th') {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: withDay ? 'numeric' : undefined,
      month: 'short',
      year: 'numeric',
    }).format(date)
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return [withDay ? get('day') : '', get('month'), get('year')].filter(Boolean).join(' ')
}
