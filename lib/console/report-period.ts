import { bangkokToday } from '@/lib/check-in/day'
import { addDays } from './report-calc'

// The period a report covers, from the page's query string. Presets or an
// explicit from/to (inclusive, Bangkok days); at most a year at a time.

export type Preset = 'today' | 'yesterday' | '7d' | 'month' | 'last_month' | 'custom'
export type Period = { from: string; to: string; preset: Preset }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 366

export function resolvePeriod(q: { p?: string; from?: string; to?: string }): Period {
  const today = bangkokToday()
  const monthStart = `${today.slice(0, 7)}-01`
  switch (q.p) {
    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: y, to: y, preset: 'yesterday' }
    }
    case '7d':
      return { from: addDays(today, -6), to: today, preset: '7d' }
    case 'month':
      return { from: monthStart, to: today, preset: 'month' }
    case 'last_month': {
      const end = addDays(monthStart, -1)
      return { from: `${end.slice(0, 7)}-01`, to: end, preset: 'last_month' }
    }
  }
  if (q.from && ISO.test(q.from)) {
    let from = q.from
    let to = q.to && ISO.test(q.to) ? q.to : from
    if (to < from) [from, to] = [to, from]
    if (to > today) to = today < from ? from : today
    if (addDays(from, MAX_DAYS - 1) < to) to = addDays(from, MAX_DAYS - 1)
    return { from, to, preset: 'custom' }
  }
  return { from: today, to: today, preset: 'today' }
}
