'use server'

import { revalidatePath } from 'next/cache'
import { requirePermissions } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { CONSOLE_PATH, FEEDBACK_PATH } from '@/lib/auth/roles'
import { MAX_TOPICS } from '@/lib/feedback'

// Admin: member feedback (§32, v0.33). Logged in staff_actions.

export type FbResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f-]{36}$/i
const KEY = /^[a-z0-9_]{2,30}$/
const fail = (error: { code?: string } | null): FbResult => ({ ok: false, error: isMissingTable(error) ? 'not_set_up' : 'failed' })
const done = () => {
  revalidatePath(FEEDBACK_PATH)
  revalidatePath(CONSOLE_PATH)
}

export async function markHandled(id: string, note: string): Promise<FbResult> {
  const ctx = await requirePermissions('access:storefront.feedback')
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'failed' }
  const text = String(note ?? '').trim().slice(0, 500) || null
  const db = createAdminClient()
  const { data, error } = await db.from('feedback').update({ handled_at: new Date().toISOString(), handled_by: ctx.userId, handled_note: text }).eq('id', id).select('id')
  if (error) return fail(error)
  if (!data?.length) return { ok: false, error: 'failed' }
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'feedback_handled', detail: { id, note: text } })
  done()
  return { ok: true }
}

// The rating topics: rename, reorder, turn on/off, add (never deleted, so
// old answers keep their label).
export async function saveTopics(list: { key?: string; label: string; labelEn?: string; active: boolean }[]): Promise<FbResult> {
  const ctx = await requirePermissions('access:storefront.feedback')
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!Array.isArray(list) || list.length > 20) return { ok: false, error: 'bad_topics' }
  const rows = list.map((t, i) => ({
    key: t.key && KEY.test(t.key) ? t.key : `t${Date.now().toString(36)}${i}`,
    label: String(t.label ?? '').trim().slice(0, 40),
    label_en: String(t.labelEn ?? '').trim().slice(0, 40) || null,
    sort: i + 1,
    is_active: Boolean(t.active),
  }))
  if (rows.some((r) => !r.label) || rows.filter((r) => r.is_active).length > MAX_TOPICS) return { ok: false, error: 'bad_topics' }
  const db = createAdminClient()
  const { error } = await db.from('feedback_topics').upsert(rows, { onConflict: 'key' })
  if (error) return fail(error)
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'feedback_topics', detail: { topics: rows.map((r) => `${r.label}${r.is_active ? '' : ' (off)'}`) } })
  done()
  return { ok: true }
}
