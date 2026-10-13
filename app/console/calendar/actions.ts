'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { getConsoleSession } from '@/lib/console/session'
import { CALENDAR_PATH, CONSOLE_PATH, isAdmin } from '@/lib/auth/roles'
import { daysBetween, KINDS, REPEATS, VISIBILITY, type CalKind, type Repeat, type Visibility } from '@/lib/calendar'

// Calendar (§31, v0.32). Admins add and change anything; staff add team
// notes and change only their own. Changes are logged in staff_actions.

export type CalResult = { ok: true; id?: string } | { ok: false; error: string }

export type CalInput = {
  id?: string
  kind: CalKind
  title: string
  titleEn?: string
  body?: string
  bodyEn?: string
  internalNote?: string
  place?: string
  startsOn: string
  endsOn: string
  startTime?: string | null
  endTime?: string | null
  visibility: Visibility
  staffIds?: string[]
  repeat: Repeat
  repeatUntil?: string | null
}

const UUID = /^[0-9a-f-]{36}$/i
const ISO = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const fail = (error: { code?: string } | null): CalResult => ({ ok: false, error: isMissingTable(error) ? 'not_set_up' : 'failed' })
const text = (v: unknown, max: number) => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || null
}
const done = () => {
  revalidatePath(CALENDAR_PATH)
  revalidatePath(CONSOLE_PATH)
  revalidatePath('/account')
  revalidatePath('/events')
  revalidatePath('/')
}

async function who(): Promise<{ userId: string; admin: boolean } | { error: string }> {
  const { user, role } = await getConsoleSession()
  if (!user || (role !== 'staff' && !isAdmin(role))) return { error: 'not_allowed' }
  return { userId: user.id, admin: isAdmin(role) }
}

export async function saveItem(input: CalInput): Promise<CalResult> {
  const ctx = await who()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const title = text(input.title, 100)
  if (!title) return { ok: false, error: 'bad_title' }
  if (!ISO.test(input.startsOn) || !ISO.test(input.endsOn) || input.endsOn < input.startsOn || daysBetween(input.startsOn, input.endsOn) > 92) {
    return { ok: false, error: 'bad_dates' }
  }
  const startTime = input.startTime && TIME.test(input.startTime) ? input.startTime : null
  const endTime = startTime && input.endTime && TIME.test(input.endTime) ? input.endTime : null
  if ((input.startTime && !startTime) || (startTime && endTime && input.startsOn === input.endsOn && endTime <= startTime)) return { ok: false, error: 'bad_times' }
  let kind = KINDS.includes(input.kind) ? input.kind : 'note'
  let visibility = VISIBILITY.includes(input.visibility) ? input.visibility : 'team'
  let staffIds = (input.staffIds ?? []).filter((s) => UUID.test(s)).slice(0, 50)
  // Staff: team notes only.
  if (!ctx.admin) {
    kind = 'note'
    visibility = 'team'
    staffIds = []
  }
  if (visibility === 'staff' && staffIds.length === 0) return { ok: false, error: 'need_staff' }
  if (visibility !== 'staff') staffIds = []
  const repeat = REPEATS.includes(input.repeat) ? input.repeat : 'none'
  const repeatUntil = repeat !== 'none' && input.repeatUntil && ISO.test(input.repeatUntil) && input.repeatUntil >= input.startsOn ? input.repeatUntil : null

  const row = {
    kind,
    title,
    title_en: text(input.titleEn, 100),
    body: text(input.body, 1000),
    body_en: text(input.bodyEn, 1000),
    internal_note: text(input.internalNote, 1000),
    place: text(input.place, 120),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    start_time: startTime,
    end_time: endTime,
    visibility,
    staff_ids: staffIds,
    repeat,
    repeat_until: repeatUntil,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  }
  const db = createAdminClient()
  if (input.id) {
    if (!UUID.test(input.id)) return { ok: false, error: 'failed' }
    const { data: cur, error: e0 } = await db.from('calendar_items').select('created_by').eq('id', input.id).maybeSingle()
    if (e0) return fail(e0)
    if (!cur) return { ok: false, error: 'failed' }
    if (!ctx.admin && cur.created_by !== ctx.userId) return { ok: false, error: 'not_allowed' }
    const { error } = await db.from('calendar_items').update(row).eq('id', input.id)
    if (error) return fail(error)
    await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'calendar_update', detail: { id: input.id, title } })
    done()
    return { ok: true, id: input.id }
  }
  const { data, error } = await db
    .from('calendar_items')
    .insert({ ...row, created_by: ctx.userId })
    .select('id')
    .single()
  if (error) return fail(error)
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'calendar_add', detail: { id: data.id, title } })
  done()
  return { ok: true, id: data.id as string }
}

export async function deleteItem(id: string): Promise<CalResult> {
  const ctx = await who()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'failed' }
  const db = createAdminClient()
  const { data: cur, error: e0 } = await db.from('calendar_items').select('created_by, title').eq('id', id).maybeSingle()
  if (e0) return fail(e0)
  if (!cur) return { ok: true }
  if (!ctx.admin && cur.created_by !== ctx.userId) return { ok: false, error: 'not_allowed' }
  const { error } = await db.from('calendar_items').delete().eq('id', id)
  if (error) return fail(error)
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'calendar_delete', detail: { id, title: cur.title } })
  done()
  return { ok: true }
}
