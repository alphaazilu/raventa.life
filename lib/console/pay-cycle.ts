// Pay periods (schema.sql §28, v0.28). Pure date maths, shared by the
// server and the screens. Dates are Bangkok calendar days "YYYY-MM-DD".

export const PAY_TYPES = ['monthly', 'daily'] as const
export type PayType = (typeof PAY_TYPES)[number]

export type DailyCycle = 'weekly' | 'half' | 'monthly'

export type PayCycleRules = {
  monthlyCutoffDay: number // 0 = last day of the month, else 1–28
  dailyCycle: DailyCycle
  dailyWeekEnd: number // weekly: the day the week ends, 0 = Sunday … 6 = Saturday
}

export const DEFAULT_PAY_CYCLE: PayCycleRules = { monthlyCutoffDay: 0, dailyCycle: 'half', dailyWeekEnd: 0 }

export type Range = { from: string; to: string }

const DAY = 86_400_000
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const plusDays = (d: string, n: number) => iso(ms(d) + n * DAY)
const pad = (n: number) => String(n).padStart(2, '0')

// Year and month (1–12) moved by `delta` months.
function shiftMonth(y: number, m: number, delta: number): [number, number] {
  const i = y * 12 + (m - 1) + delta
  return [Math.floor(i / 12), (i % 12) + 1]
}
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

function monthlyRange(date: string, cutoff: number): Range {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  if (!cutoff) return { from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) }
  if (day <= cutoff) {
    const [py, pm] = shiftMonth(y, m, -1)
    return { from: ymd(py, pm, cutoff + 1), to: ymd(y, m, cutoff) }
  }
  const [ny, nm] = shiftMonth(y, m, 1)
  return { from: ymd(y, m, cutoff + 1), to: ymd(ny, nm, cutoff) }
}

// The pay period of this type that contains `date`.
export function cycleOf(date: string, type: PayType, rules: PayCycleRules): Range {
  if (type === 'monthly' || rules.dailyCycle === 'monthly') return monthlyRange(date, rules.monthlyCutoffDay)
  if (rules.dailyCycle === 'half') {
    const y = Number(date.slice(0, 4))
    const m = Number(date.slice(5, 7))
    return Number(date.slice(8, 10)) <= 15 ? { from: ymd(y, m, 1), to: ymd(y, m, 15) } : { from: ymd(y, m, 16), to: ymd(y, m, lastDay(y, m)) }
  }
  // weekly
  const dow = new Date(ms(date)).getUTCDay()
  const to = plusDays(date, (rules.dailyWeekEnd - dow + 7) % 7)
  return { from: plusDays(to, -6), to }
}

// The period just before the one containing `date`.
export function previousCycle(date: string, type: PayType, rules: PayCycleRules): Range {
  return cycleOf(plusDays(cycleOf(date, type, rules).from, -1), type, rules)
}
