import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { countPendingLeave } from '@/lib/leave-server'
import { bangkokToday } from '@/lib/check-in/day'
import { isForgotten, listOpenEntries } from './time'
import { dayBounds, listPoints, listRounds, listScans } from './checklist'
import { slotsOn, slotState, withLivePoints } from '@/lib/checklist'

// Things an admin should act on (v0.30): the numbers next to the side menu
// and the "To do" box on the overview. SERVER ONLY (service role); each
// part fails quietly to 0 so a missing table never breaks the console.

export type ConsoleAlerts = {
  pendingLeave: number // leave requests waiting (§25)
  forgotClockOut: number // entries open for more than 14 h (§16)
  checklistIssues: number // problems reported today (§29)
  checklistMissed: number // round windows today that ended incomplete (§29)
  unsetPay: number // team members with no daily/monthly pay type (§28)
}

const zero: ConsoleAlerts = { pendingLeave: 0, forgotClockOut: 0, checklistIssues: 0, checklistMissed: 0, unsetPay: 0 }

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

export const loadAlerts = cache(async (): Promise<ConsoleAlerts> => {
  const [pendingLeave, open, checklist, pay] = await Promise.all([
    countPendingLeave().catch(() => 0),
    listOpenEntries().catch(() => []),
    checklistToday().catch(() => ({ issues: 0, missed: 0 })),
    unsetPay().catch(() => 0),
  ])
  return {
    ...zero,
    pendingLeave,
    forgotClockOut: open.filter((e) => isForgotten(e)).length,
    checklistIssues: checklist.issues,
    checklistMissed: checklist.missed,
    unsetPay: pay,
  }
})
