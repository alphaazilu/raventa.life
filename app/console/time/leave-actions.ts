'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIME_PATH } from '@/lib/auth/roles'
import { datesOf } from '@/lib/leave'

// Admin: decide leave requests (§25). Approving marks every day of the
// request "day off" on the roster (replacing any shift planned there).

export type DecideResult = { ok: true } | { ok: false; error: string }

export async function decideLeave(id: string, approve: boolean, note?: string): Promise<DecideResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('leave_requests')
    .update({
      status: approve ? 'approved' : 'rejected',
      decided_by: ctx.userId,
      decided_at: now,
      decision_note: (note ?? '').trim().slice(0, 300) || null,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('staff_id, start_date, end_date, kind')
  if (error) return { ok: false, error: 'failed' }
  const req = data?.[0]
  if (!req) return { ok: false, error: 'not_pending' }

  if (approve) {
    const rows = datesOf(req.start_date, req.end_date).map((work_date) => ({
      staff_id: req.staff_id,
      work_date,
      template_id: null,
      day_off: true,
      updated_by: ctx.userId,
      updated_at: now,
    }))
    // Every shift planned on those days goes; each day becomes a day off.
    const { error: delErr } = await db
      .from('shift_assignments')
      .delete()
      .eq('staff_id', req.staff_id)
      .in('work_date', rows.map((r) => r.work_date))
    const { error: rosterErr } = delErr ? { error: delErr } : await db.from('shift_assignments').insert(rows)
    if (rosterErr) console.error('leave approve: roster update failed', rosterErr.message)
  }
  await db.from('staff_actions').insert({
    actor_id: ctx.userId,
    member_id: req.staff_id,
    action: approve ? 'leave_approve' : 'leave_reject',
    detail: { id, start: req.start_date, end: req.end_date, kind: req.kind, note: note ?? null },
  })
  revalidatePath(TIME_PATH)
  return { ok: true }
}

// A short-lived link to the attachment (doctor's note).
export async function leaveDocLink(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const db = createAdminClient()
  const { data } = await db.from('leave_requests').select('doc_path').eq('id', id).maybeSingle()
  if (!data?.doc_path) return { ok: false, error: 'failed' }
  const { data: signed } = await db.storage.from('leave-docs').createSignedUrl(data.doc_path, 600)
  return signed?.signedUrl ? { ok: true, url: signed.signedUrl } : { ok: false, error: 'failed' }
}
