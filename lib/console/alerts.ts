import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { countPendingLeave } from '@/lib/leave-server'
import { bangkokToday } from '@/lib/check-in/day'
import { isForgotten, listOpenEntries } from './time'
import { dayBounds, listPoints, listRounds, listScans } from './checklist'
import { slotsOn, slotState, withLivePoints } from '@/lib/checklist'
import { getCashRules } from './cash'
import { OPEN_TOO_LONG_HOURS } from '@/lib/cash'

// Things an admin should act on (v0.30): the numbers next to the side menu
// and the "To do" box on the overview. SERVER ONLY (service role); each
// part fails quietly to 0 so a missing table never breaks the console.

export type ConsoleAlerts = {
  pendingLeave: number // leave requests waiting (§25)
  forgotClockOut: number // entries open for more than 14 h (§16)
  checklistIssues: number // problems reported today (§29)
  checklistMissed: number // round windows today that ended incomplete (§29)
  unsetPay: number // team members with no daily/monthly pay type (§28)
  cashReview: number // closed drawers with a difference ≥ the alert size, not reviewed (§30)
  cashOpenLong: number // a drawer open (or counted, not confirmed) for over 16 h (§30)
}

const zero: ConsoleAlerts = { pendingLeave: 0, forgotClockOut: 0, checklistIssues: 0, checklistMissed: 0, unsetPay: 0, cashReview: 0, cashOpenLong: 0 }

async function checklistToday(): Promise<{ issues: number; missed: number }> {
  const today = bangkokToday()
  const [points, rounds] = await Promise.all([listPoints(), listRounds()])
  if (!points) return { issues: 0, missed: 0 }
  const { from, to } = dayBounds(today)
  const scans = await listScans(from, to)
  const now = Date.now()
  let missed = 0
  for (const r of withLivePoints(rounds.filter((x) => x.active), points)) {
    for (const s of slotsOn(r, today)) {
      const st = slotState(s, r, scans, now).status
      if (st === 'missed' || st === 'partial') missed += 1
    }
  }
  return { issues: scans.filter((s) => s.issue).length, missed }
}

async function unsetPay(): Promise<number> {
  const db = createAdminClient()
  const [team, pay] = await Promise.all([db.from('profiles').select('id').eq('role', 'staff'), db.from('staff_pay').select('staff_id')])
  if (team.error || pay.error) return 0 // before §28: nothing to set yet
  const set = new Set((pay.data ?? []).map((r) => r.staff_id as string))
  return (team.data ?? []).filter((p) => !set.has(p.id as string)).length
}

async function cashAlerts(): Promise<{ review: number; openLong: number }> {
  const rules = await getCashRules()
  if (!rules.setUp) return { review: 0, openLong: 0 }
  const db = createAdminClient()
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const [review, open] = await Promise.all([
    db.from('cash_sessions').select('id, diff').eq('status', 'closed').is('reviewed_at', null).gte('opened_at', since),
    db.from('cash_sessions').select('id').neq('status', 'closed').lt('opened_at', new Date(Date.now() - OPEN_TOO_LONG_HOURS * 3600_000).toISOString()),
  ])
  const limit = Math.max(1, rules.alert)
  return {
    review: review.error ? 0 : (review.data ?? []).filter((r) => Math.abs(Number(r.diff) || 0) >= limit).length,
    openLong: open.error ? 0 : (open.data ?? []).length,
  }
}

export const loadAlerts = cache(async (): Promise<ConsoleAlerts> => {
  const [pendingLeave, open, checklist, pay, cash] = await Promise.all([
    countPendingLeave().catch(() => 0),
    listOpenEntries().catch(() => []),
    checklistToday().catch(() => ({ issues: 0, missed: 0 })),
    unsetPay().catch(() => 0),
    cashAlerts().catch(() => ({ review: 0, openLong: 0 })),
  ])
  return {
    ...zero,
    pendingLeave,
    forgotClockOut: open.filter((e) => isForgotten(e)).length,
    checklistIssues: checklist.issues,
    checklistMissed: checklist.missed,
    unsetPay: pay,
    cashReview: cash.review,
    cashOpenLong: cash.openLong,
  }
})
