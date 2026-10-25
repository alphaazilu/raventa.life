import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'

// Quiz "contact me" leads (§52, v0.38.19; Back Office page v0.38.31).
// SERVER ONLY (service role) — every caller checks it's an admin first.

export type QuizLead = {
  id: string
  name: string | null
  contact: string
  contactType: 'phone' | 'email' | 'line' | 'other'
  goals: string[]
  journeySummary: string | null
  totalMinutes: number | null
  adjustments: string[]
  memberId: string | null
  createdAt: string
  handledAt: string | null
  handledBy: string | null
}

/** The short version the bell shows. */
export type LeadPreview = Pick<QuizLead, 'id' | 'name' | 'contact' | 'contactType' | 'goals' | 'totalMinutes' | 'createdAt'>

const COLS = 'id, name, contact, contact_type, goals, journey_summary, total_minutes, adjustments, member_id, created_at, handled_at, handled_by'

function toLead(r: Record<string, unknown>, names: Map<string, string>): QuizLead {
  const t = r.contact_type as string
  return {
    id: r.id as string,
    name: (r.name as string | null) || null,
    contact: r.contact as string,
    contactType: t === 'phone' || t === 'email' || t === 'line' ? t : 'other',
    goals: (r.goals as string[] | null) ?? [],
    journeySummary: (r.journey_summary as string | null) || null,
    totalMinutes: r.total_minutes == null ? null : Number(r.total_minutes),
    adjustments: (r.adjustments as string[] | null) ?? [],
    memberId: (r.member_id as string | null) ?? null,
    createdAt: r.created_at as string,
    handledAt: (r.handled_at as string | null) ?? null,
    handledBy: r.handled_by ? (names.get(r.handled_by as string) ?? null) : null,
  }
}

// Open leads (newest first) or the handled ones (latest 200). null = §52 not run.
export async function listLeads(status: 'open' | 'done'): Promise<QuizLead[] | null> {
  const db = createAdminClient()
  let q = db.from('quiz_leads').select(COLS)
  q = status === 'open' ? q.is('handled_at', null).order('created_at', { ascending: false }) : q.not('handled_at', 'is', null).order('handled_at', { ascending: false })
  const { data, error } = await q.limit(200)
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  const ids = [...new Set(rows.map((r) => r.handled_by as string | null).filter((x): x is string => Boolean(x)))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: people } = await db.from('profiles').select('id, first_name, last_name, email').in('id', ids)
    for (const p of people ?? []) names.set(p.id as string, [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '')
  }
  return rows.map((r) => toLead(r, names))
}

export async function countOpenLeads(): Promise<number> {
  const { count, error } = await createAdminClient().from('quiz_leads').select('id', { count: 'exact', head: true }).is('handled_at', null)
  if (error) return 0
  return count ?? 0
}

export async function recentOpenLeads(limit = 5): Promise<LeadPreview[]> {
  const { data, error } = await createAdminClient()
    .from('quiz_leads')
    .select('id, name, contact, contact_type, goals, total_minutes, created_at')
    .is('handled_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const l = toLead(r, new Map())
    return { id: l.id, name: l.name, contact: l.contact, contactType: l.contactType, goals: l.goals, totalMinutes: l.totalMinutes, createdAt: l.createdAt }
  })
}
