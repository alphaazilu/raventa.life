'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppSettings } from '@/lib/console/settings'
import { bangkokToday } from '@/lib/check-in/day'
import { daysInclusive, isoAdd, LEAVE_KINDS, MAX_LEAVE_DAYS, SICK_BACKDATE_DAYS, type LeaveKind } from '@/lib/leave'
import { leaveBalance } from '@/lib/leave-server'

// Staff ask for days off from their phone (§25). Written with the service
// role after checking who is asking and the rules in Settings.

export type LeaveResult = { ok: true } | { ok: false; error: string; n?: number }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DOC_BUCKET = 'leave-docs'
const DOC_MAX = 4 * 1024 * 1024 - 64 * 1024 // under the 4 MB action limit (next.config)
const DOC_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}

async function me() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { id: user.id, role: (p?.role as string | undefined) ?? 'member' }
}

export async function requestLeave(form: FormData): Promise<LeaveResult> {
  const user = await me()
  if (!user || user.role !== 'staff') return { ok: false, error: 'not_staff' }

  const start = String(form.get('start') ?? '')
  const end = String(form.get('end') ?? '') || start
  const kind = String(form.get('kind') ?? '') as LeaveKind
  const reason = String(form.get('reason') ?? '').trim().slice(0, 300) || null
  const file = form.get('doc')

  if (!DATE.test(start) || !DATE.test(end) || end < start) return { ok: false, error: 'bad_dates' }
  const days = daysInclusive(start, end)
  if (days > MAX_LEAVE_DAYS) return { ok: false, error: 'too_long' }
  if (!LEAVE_KINDS.includes(kind)) return { ok: false, error: 'bad_dates' }

  const { leave: rules } = await getAppSettings()
  if (!rules.kinds[kind]) return { ok: false, error: 'kind_off' }
  const today = bangkokToday()
  if (kind === 'sick') {
    if (start < isoAdd(today, -SICK_BACKDATE_DAYS)) return { ok: false, error: 'sick_past' }
  } else if (start < isoAdd(today, rules.noticeDays)) {
    return start < today ? { ok: false, error: 'past' } : { ok: false, error: 'notice', n: rules.noticeDays }
  }

  const db = createAdminClient()
  const { data: clash, error: clashErr } = await db
    .from('leave_requests')
    .select('id')
    .eq('staff_id', user.id)
    .in('status', ['pending', 'approved'])
    .lte('start_date', end)
    .gte('end_date', start)
    .limit(1)
  if (clashErr) return { ok: false, error: clashErr.code === '42P01' ? 'not_set_up' : 'failed' }
  if (clash?.length) return { ok: false, error: 'overlap' }

  const quota = rules.quotas[kind]
  if (quota > 0) {
    const bal = await leaveBalance(user.id, start.slice(0, 4), rules)
    const left = quota - bal[kind].used
    if (days > left) return { ok: false, error: 'quota', n: Math.max(0, left) }
  }

  // Optional attachment (a doctor's note), kept private.
  let docPath: string | null = null
  if (file instanceof File && file.size > 0) {
    if (file.size > DOC_MAX) return { ok: false, error: 'file_big' }
    const ext = DOC_TYPES[file.type]
    if (!ext) return { ok: false, error: 'file_type' }
    docPath = `${user.id}/${randomUUID()}.${ext}`
    const { error } = await db.storage.from(DOC_BUCKET).upload(docPath, file, { contentType: file.type })
    if (error) return { ok: false, error: 'failed' }
  }

  const { error } = await db.from('leave_requests').insert({
    staff_id: user.id,
    start_date: start,
    end_date: end,
    days,
    kind,
    reason,
    doc_path: docPath,
  })
  if (error) {
    if (docPath) await db.storage.from(DOC_BUCKET).remove([docPath])
    return { ok: false, error: 'failed' }
  }
  revalidatePath('/account')
  return { ok: true }
}

// Withdraw a request that hasn't been decided yet.
export async function cancelLeave(id: string): Promise<LeaveResult> {
  const user = await me()
  if (!user) return { ok: false, error: 'not_staff' }
  const { data, error } = await createAdminClient()
    .from('leave_requests')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('staff_id', user.id)
    .eq('status', 'pending')
    .select('id')
  if (error) return { ok: false, error: 'failed' }
  if (!data?.length) return { ok: false, error: 'not_pending' }
  revalidatePath('/account')
  return { ok: true }
}
