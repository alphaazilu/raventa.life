import { addDays } from '@/lib/date'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { bangkokToday } from '@/lib/check-in/day'
import { FEEDBACK_DAYS, type FeedbackRow, type FeedbackTopic, type PendingVisit } from '@/lib/feedback'

// Member feedback (§32, v0.33). SERVER ONLY (service role).


// All topics (admin) or the active ones (member form). null = §32 not run.
export const listTopics = cache(async (all = false): Promise<FeedbackTopic[] | null> => {
  let q = createAdminClient().from('feedback_topics').select('key, label, label_en, sort, is_active').order('sort')
  if (!all) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  return (data ?? []).map((t) => ({ key: t.key as string, label: t.label as string, labelEn: (t.label_en as string | null) || null, sort: Number(t.sort), active: Boolean(t.is_active) }))
})

// The member's latest visit that can still be rated: not cancelled, over
// (checked out, or from an earlier day), within FEEDBACK_DAYS, not rated.
export async function pendingVisit(memberId: string): Promise<PendingVisit | null> {
  const db = createAdminClient()
  const today = bangkokToday()
  const { data: visits, error } = await db
    .from('visits')
    .select('id, visit_date, checked_out_at')
    .eq('member_id', memberId)
    .is('cancelled_at', null)
    .gte('visit_date', addDays(today, -FEEDBACK_DAYS))
    .order('visit_date', { ascending: false })
    .limit(5)
  if (error || !visits?.length) return null
  const done = visits.filter((v) => v.checked_out_at || (v.visit_date as string) < today)
  if (!done.length) return null
  const { data: rated, error: e2 } = await db.from('feedback').select('visit_id').in('visit_id', done.map((v) => v.id as string))
  if (e2) return null // §32 not run
  const taken = new Set((rated ?? []).map((r) => r.visit_id as string))
  const v = done.find((x) => !taken.has(x.id as string))
  return v ? { visitId: v.id as string, visitDate: v.visit_date as string } : null
}

export async function getReviewUrl(): Promise<string | null> {
  const { data, error } = await createAdminClient().from('app_settings').select('*').eq('id', 1).maybeSingle()
  if (error || !data) return null
  return (data.google_review_url as string | null) || null
}

// Answers between two days (by the day they were sent), newest first.
export async function listFeedback(from: string, to: string, limit = 1000): Promise<FeedbackRow[] | null> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('feedback')
    .select('*')
    .gte('created_at', `${from}T00:00:00+07:00`)
    .lt('created_at', `${addDays(to, 1)}T00:00:00+07:00`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  const rows = data ?? []
  const ids = [...new Set(rows.flatMap((r) => [r.member_id, r.handled_by]).filter(Boolean) as string[])]
  const { data: people } = ids.length
    ? await db.from('profiles').select('id, first_name, last_name, email, member_no').in('id', ids)
    : { data: [] as Record<string, unknown>[] }
  const who = new Map((people ?? []).map((p) => [p.id as string, p]))
  const name = (id: unknown) => {
    const p = id ? who.get(id as string) : undefined
    return p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || '—' : '—'
  }
  return rows.map((r) => ({
    id: r.id as string,
    memberId: (r.member_id as string | null) ?? null,
    memberName: name(r.member_id),
    memberNo: r.member_id ? ((who.get(r.member_id as string)?.member_no as string | null) ?? null) : null,
    visitDate: r.visit_date as string,
    overall: Number(r.overall),
    scores: (r.scores as Record<string, number>) ?? {},
    comment: (r.comment as string | null) || null,
    contactMe: Boolean(r.contact_me),
    createdAt: r.created_at as string,
    handledAt: (r.handled_at as string | null) ?? null,
    handledBy: r.handled_by ? name(r.handled_by) : null,
    handledNote: (r.handled_note as string | null) || null,
  }))
}

// Not yet handled: 1–2 stars or "please contact me" (To do box).
export async function countFollowUp(): Promise<number> {
  const { data, error } = await createAdminClient().from('feedback').select('overall, contact_me').is('handled_at', null).or('overall.lte.2,contact_me.eq.true')
  if (error) return 0
  return (data ?? []).length
}
