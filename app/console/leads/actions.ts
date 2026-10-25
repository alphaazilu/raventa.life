'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { CONSOLE_PATH, LEADS_PATH } from '@/lib/auth/roles'

// Admin: quiz "contact me" leads (§52). Logged in staff_actions.

export type LeadActionResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f-]{36}$/i

export async function setLeadHandled(id: string, handled: boolean): Promise<LeadActionResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'failed' }
  const db = createAdminClient()
  const patch = handled ? { handled_at: new Date().toISOString(), handled_by: ctx.userId } : { handled_at: null, handled_by: null }
  const { data, error } = await db.from('quiz_leads').update(patch).eq('id', id).select('id')
  if (error) return { ok: false, error: isMissingTable(error) ? 'not_set_up' : 'failed' }
  if (!data?.length) return { ok: false, error: 'failed' }
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: handled ? 'quiz_lead_handled' : 'quiz_lead_reopened', detail: { id } })
  revalidatePath(LEADS_PATH)
  revalidatePath(CONSOLE_PATH, 'layout')
  return { ok: true }
}
