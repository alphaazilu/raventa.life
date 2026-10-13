'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { listTopics, pendingVisit } from '@/lib/console/feedback'

// A member rates their latest visit (§32, v0.33). The visit is looked up
// again on the server: only their own, not cancelled, within 7 days, once.

export type FeedbackResult = { ok: true } | { ok: false; error: string }

export async function submitFeedback(input: { visitId: string; overall: number; scores: Record<string, number>; comment: string; contactMe: boolean }): Promise<FeedbackResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const overall = Number(input.overall)
  if (!Number.isInteger(overall) || overall < 1 || overall > 5) return { ok: false, error: 'bad_stars' }
  const visit = await pendingVisit(user.id)
  if (!visit || visit.visitId !== input.visitId) return { ok: false, error: 'no_visit' }
  const topics = (await listTopics()) ?? []
  const scores: Record<string, number> = {}
  for (const t of topics) {
    const v = Number(input.scores?.[t.key])
    if (Number.isInteger(v) && v >= 1 && v <= 5) scores[t.key] = v
  }
  const comment = String(input.comment ?? '').trim().slice(0, 1000) || null
  const { error } = await createAdminClient().from('feedback').insert({
    member_id: user.id,
    visit_id: visit.visitId,
    visit_date: visit.visitDate,
    overall,
    scores,
    comment,
    contact_me: Boolean(input.contactMe),
  })
  if (error) return { ok: false, error: error.code === '23505' ? 'already' : isMissingTable(error) ? 'not_set_up' : 'failed' }
  revalidatePath('/account')
  return { ok: true }
}
