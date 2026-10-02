import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { bangkokToday } from '@/lib/check-in/day'

// Time clock (supabase/schema.sql §16, Vault R2/R4). SERVER ONLY — the
// tables are service-role only; every caller checks who is asking first.

export type TimeEntry = {
  id: string
  staffId: string
  name: string
  clockIn: string
  clockOut: string | null
  inMethod: 'card' | 'password' | 'admin'
  outMethod: 'button' | 'admin' | 'card' | null
  edited: boolean
}

// Shared with the time screen (client-safe): see shift-math.ts.
export { isForgotten, minutesOf } from './shift-math'

// Monday (Bangkok) of the week containing `isoDate` (YYYY-MM-DD).
export function weekStart(isoDate = bangkokToday()): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// "2026-10-02T08:05" typed in Bangkok time → ISO instant.
export function bangkokLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  const t = Date.parse(`${local}:00+07:00`)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

// ISO instant → "2026-10-02T08:05" in Bangkok time, for datetime-local inputs.
export function isoToBangkokLocal(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600 * 1000).toISOString().slice(0, 16)
}

type Row = {
  id: string
  staff_id: string
  clock_in: string
  clock_out: string | null
  in_method: TimeEntry['inMethod']
  out_method: TimeEntry['outMethod']
  created_at: string
  updated_at: string
}

async function namesFor(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, first_name, last_name, email')
    .in('id', ids)
  const out: Record<string, string> = {}
  for (const p of data ?? []) {
    out[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—'
  }
  return out
}

function toEntry(r: Row, names: Record<string, string>): TimeEntry {
  return {
    id: r.id,
    staffId: r.staff_id,
    name: names[r.staff_id] ?? '—',
    clockIn: r.clock_in,
    clockOut: r.clock_out,
    inMethod: r.in_method,
    outMethod: r.out_method,
    edited: r.updated_at !== r.created_at,
  }
}

const COLS = 'id, staff_id, clock_in, clock_out, in_method, out_method, created_at, updated_at'

export const getOpenEntry = cache(async (staffId: string): Promise<TimeEntry | null> => {
  const { data, error } = await createAdminClient()
    .from('time_entries')
    .select(COLS)
    .eq('staff_id', staffId)
    .is('clock_out', null)
    .maybeSingle()
  if (error || !data) return null
  return toEntry(data as Row, {})
})

// Clock in if not already in. Safe to call on every console visit: the
// one-open-entry index makes a race harmless.
export async function clockInIfNeeded(staffId: string, deviceId: string, method: 'card' | 'password'): Promise<void> {
  if (await getOpenEntry(staffId)) return
  const { error } = await createAdminClient()
    .from('time_entries')
    .insert({ staff_id: staffId, clock_in: new Date().toISOString(), device_id: deviceId, in_method: method })
  if (error && error.code !== '23505') console.error('clockInIfNeeded failed', error)
}

// Entries that started in [from, to) Bangkok dates, plus any still open.
export async function listEntries(from: string, to: string, staffId?: string): Promise<TimeEntry[]> {
  const admin = createAdminClient()
  let q = admin
    .from('time_entries')
    .select(COLS)
    .gte('clock_in', `${from}T00:00:00+07:00`)
    .lt('clock_in', `${to}T00:00:00+07:00`)
    .order('clock_in', { ascending: false })
    .limit(2000)
  if (staffId) q = q.eq('staff_id', staffId)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const names = await namesFor([...new Set(rows.map((r) => r.staff_id))])
  return rows.map((r) => toEntry(r, names))
}

export async function listOpenEntries(): Promise<TimeEntry[]> {
  const { data, error } = await createAdminClient()
    .from('time_entries')
    .select(COLS)
    .is('clock_out', null)
    .order('clock_in', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const names = await namesFor([...new Set(rows.map((r) => r.staff_id))])
  return rows.map((r) => toEntry(r, names))
}

// Staff (and admins) who can appear on the time sheet.
export async function listStaff(): Promise<{ id: string; name: string }[]> {
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, first_name, last_name, email, role')
    .in('role', ['staff', 'admin'])
  return (data ?? [])
    .map((p) => ({ id: p.id as string, name: [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
}
