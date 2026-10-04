import { createClient } from '@/lib/supabase/server'
import { bangkokHour, bangkokToday } from '@/lib/check-in/day'
import { getFloor, type FloorVisit } from './desk/actions'
import { countPendingLeave } from '@/lib/leave-server'

// Today at a glance for the admin dashboard (/console). Everything is read
// with the admin's own session, so RLS still applies.

export type DashboardData = {
  date: string
  inside: number
  checkIns: number
  paid: number
  free: number
  takings: { cash: number; transfer: number; card: number; total: number }
  newMembersToday: number
  membersTotal: number
  hourly: { hour: number; count: number }[]
  recent: FloorVisit[]
  pendingLeave: number // leave requests waiting (§25)
  error: string | null
}

export async function loadDashboard(): Promise<DashboardData> {
  const supabase = await createClient()
  const date = bangkokToday()
  // Midnight in Bangkok (UTC+7, no DST).
  const dayStart = new Date(`${date}T00:00:00+07:00`).toISOString()

  const [floor, totalRes, newRes, pendingLeave] = await Promise.all([
    getFloor(),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', dayStart),
    countPendingLeave(),
  ])

  const visits = floor.ok ? floor.data.visits : []
  // Bills plus older check-ins without one (see getFloor).
  const takings = floor.ok ? floor.data.takings : { cash: 0, transfer: 0, card: 0, total: 0 }
  let free = 0
  const byHour = new Map<number, number>()
  for (const v of visits) {
    if (v.entryType === 'reward') free++
    const h = bangkokHour(v.checkedInAt)
    byHour.set(h, (byHour.get(h) ?? 0) + 1)
  }

  // A steady working-day window, stretched if anyone came earlier/later.
  const hours = [...byHour.keys()]
  const first = Math.min(9, ...hours)
  const last = Math.max(20, ...hours)
  const hourly = []
  for (let h = first; h <= last; h++) hourly.push({ hour: h, count: byHour.get(h) ?? 0 })

  return {
    date,
    inside: visits.filter((v) => !v.checkedOutAt).length,
    checkIns: visits.length,
    paid: visits.length - free,
    free,
    takings,
    newMembersToday: newRes.count ?? 0,
    membersTotal: totalRes.count ?? 0,
    hourly,
    recent: visits.slice(0, 6),
    pendingLeave,
    error: floor.ok ? null : floor.error,
  }
}
