import { bangkokToday } from '@/lib/check-in/day'
import { resolvePeriod } from './report-period'
import { cycleOf, plusDays, previousCycle, PAY_TYPES, type PayCycleRules, type PayType, type Range } from './pay-cycle'

// The period of the time report (v0.28): this or the last pay period of the
// chosen pay type, a calendar month, or explicit dates.

const ISO = /^\d{4}-\d{2}-\d{2}$/

export type TimePreset = 'cycle' | 'last_cycle' | 'month' | 'last_month' | 'custom'
export type PayTab = PayType | 'none'
export type TimePeriod = Range & { preset: TimePreset; pay: PayTab; cycle: Range; lastCycle: Range }

export function resolveTimePeriod(q: { p?: string; from?: string; to?: string; pay?: string }, rules: PayCycleRules): TimePeriod {
  const pay: PayTab = (PAY_TYPES as readonly string[]).includes(q.pay ?? '') ? (q.pay as PayType) : q.pay === 'none' ? 'none' : 'monthly'
  const today = bangkokToday()
  const type: PayType = pay === 'none' ? 'monthly' : pay
  const cycle = cycleOf(today, type, rules)
  const lastCycle = previousCycle(today, type, rules)
  const base = { pay, cycle, lastCycle }
  if (q.p === 'last_cycle') return { ...lastCycle, preset: 'last_cycle', ...base }
  if (q.p === 'month' || q.p === 'last_month') {
    const r = resolvePeriod({ p: q.p })
    // "this month" runs to the month's end, so planned shifts show too
    const to = q.p === 'month' ? cycleOf(today, 'monthly', { ...rules, monthlyCutoffDay: 0 }).to : r.to
    return { from: r.from, to, preset: q.p, ...base }
  }
  if (q.from && ISO.test(q.from)) {
    // Unlike sales, a later end is fine: planned shifts show as "upcoming".
    let from = q.from
    let to = q.to && ISO.test(q.to) ? q.to : from
    if (to < from) [from, to] = [to, from]
    if (plusDays(from, 92) < to) to = plusDays(from, 92)
    return { from, to, preset: 'custom', ...base }
  }
  return { ...cycle, preset: 'cycle', ...base }
}
