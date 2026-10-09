'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTable } from '@/lib/console/db-errors'
import { CHECKLIST_PATH, MY_CHECKLIST_PATH } from '@/lib/auth/roles'
import { MAX_ITEMS, MAX_POINTS_PER_ROUND, newItemId, type ChecklistItem, type ItemKind, type RoundKind } from '@/lib/checklist'

// Admin: Back Office › Checklists › Set up (§29, v0.29). Service role after
// an admin check; changes are logged in staff_actions.

export type ChecklistResult = { ok: true; id?: string } | { ok: false; error: string }

const UUID = /^[0-9a-f-]{36}$/i
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const KINDS: ItemKind[] = ['check', 'number', 'text']
const fail = (error: { code?: string } | null): ChecklistResult => ({ ok: false, error: isMissingTable(error) ? 'not_set_up' : 'failed' })
const done = () => {
  revalidatePath(CHECKLIST_PATH)
  revalidatePath(MY_CHECKLIST_PATH)
}
const num = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

function cleanItems(raw: unknown): ChecklistItem[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) return null
  const out: ChecklistItem[] = []
  const seen = new Set<string>()
  for (const r of raw as Partial<ChecklistItem>[]) {
    const label = String(r?.label ?? '').trim().slice(0, 60)
    const kind = KINDS.includes(r?.kind as ItemKind) ? (r!.kind as ItemKind) : null
    if (!label || !kind) return null
    let id = String(r?.id ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 12) || newItemId()
    while (seen.has(id)) id = newItemId()
    seen.add(id)
    const item: ChecklistItem = { id, label, kind }
    if (kind === 'number') {
      item.unit = String(r?.unit ?? '').trim().slice(0, 10) || null
      item.min = num(r?.min)
      item.max = num(r?.max)
      if (item.min != null && item.max != null && item.min > item.max) [item.min, item.max] = [item.max, item.min]
    }
    out.push(item)
  }
  return out
}

export async function savePoint(input: { id?: string | null; name: string; place?: string | null; items: ChecklistItem[]; active: boolean }): Promise<ChecklistResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const name = String(input.name ?? '').trim().slice(0, 60)
  if (!name) return { ok: false, error: 'need_name' }
  const items = cleanItems(input.items)
  if (!items) return { ok: false, error: 'bad_items' }
  const row = { name, place: String(input.place ?? '').trim().slice(0, 120) || null, items, is_active: Boolean(input.active), updated_at: new Date().toISOString() }
  const db = createAdminClient()
  let id = input.id && UUID.test(input.id) ? input.id : null
  if (id) {
    const { error } = await db.from('checklist_points').update(row).eq('id', id)
    if (error) return fail(error)
  } else {
    const { count } = await db.from('checklist_points').select('id', { count: 'exact', head: true })
    const { data, error } = await db.from('checklist_points').insert({ ...row, sort: count ?? 0 }).select('id').single()
    if (error) return fail(error)
    id = data.id as string
  }
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'checklist_point', detail: { id, name, items: items.length, active: row.is_active } })
  done()
  return { ok: true, id }
}

// A new sticker: the old QR stops working (lost, or someone kept a photo).
export async function reissuePoint(id: string): Promise<ChecklistResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'failed' }
  const db = createAdminClient()
  const { data: p, error: e } = await db.from('checklist_points').select('code_version').eq('id', id).maybeSingle()
  if (e || !p) return fail(e)
  const { error } = await db
    .from('checklist_points')
    .update({ code_version: Number(p.code_version) + 1, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return fail(error)
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'checklist_reissue', detail: { id, version: Number(p.code_version) + 1 } })
  done()
  return { ok: true, id }
}

// Only points never scanned can go (the log keeps the rest); otherwise
// switch them off.
export async function deletePoint(id: string): Promise<ChecklistResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'failed' }
  const db = createAdminClient()
  const { count } = await db.from('checklist_scans').select('id', { count: 'exact', head: true }).eq('point_id', id)
  if (count) return { ok: false, error: 'in_use' }
  const { data: rounds } = await db.from('checklist_rounds').select('id, point_ids').contains('point_ids', [id])
  for (const r of rounds ?? []) {
    await db
      .from('checklist_rounds')
      .update({ point_ids: (r.point_ids as string[]).filter((x) => x !== id) })
      .eq('id', r.id)
  }
  const { error } = await db.from('checklist_points').delete().eq('id', id)
  if (error) return fail(error)
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'checklist_point_delete', detail: { id } })
  done()
  return { ok: true }
}

export async function saveRound(input: {
  id?: string | null
  name: string
  kind: RoundKind
  start: string | null
  end: string | null
  everyMinutes: number | null
  days: number[]
  pointIds: string[]
  active: boolean
}): Promise<ChecklistResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const name = String(input.name ?? '').trim().slice(0, 60)
  if (!name) return { ok: false, error: 'need_name' }
  const kind: RoundKind = ['daily', 'every', 'anytime'].includes(input.kind) ? input.kind : 'daily'
  const timed = kind !== 'anytime'
  if (timed && (!TIME.test(input.start ?? '') || !TIME.test(input.end ?? '') || input.start === input.end)) return { ok: false, error: 'bad_time' }
  const every = kind === 'every' ? Math.round(Number(input.everyMinutes)) : null
  if (kind === 'every' && !(every! >= 30 && every! <= 720)) return { ok: false, error: 'bad_time' }
  const days = [...new Set((input.days ?? []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
  if (timed && days.length === 0) return { ok: false, error: 'need_days' }
  const pointIds = [...new Set((input.pointIds ?? []).filter((p) => UUID.test(p)))].slice(0, MAX_POINTS_PER_ROUND)
  if (pointIds.length === 0) return { ok: false, error: 'need_points' }
  const row = {
    name,
    kind,
    start_time: timed ? input.start : null,
    end_time: timed ? input.end : null,
    every_minutes: every,
    days: timed ? days : [0, 1, 2, 3, 4, 5, 6],
    point_ids: pointIds,
    is_active: Boolean(input.active),
    updated_at: new Date().toISOString(),
  }
  const db = createAdminClient()
  let id = input.id && UUID.test(input.id) ? input.id : null
  if (id) {
    const { error } = await db.from('checklist_rounds').update(row).eq('id', id)
    if (error) return fail(error)
  } else {
    const { count } = await db.from('checklist_rounds').select('id', { count: 'exact', head: true })
    const { data, error } = await db.from('checklist_rounds').insert({ ...row, sort: count ?? 0 }).select('id').single()
    if (error) return fail(error)
    id = data.id as string
  }
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'checklist_round', detail: { id, ...row } })
  done()
  return { ok: true, id }
}

// Rounds hold no history (the scans belong to points), so they can go.
export async function deleteRound(id: string): Promise<ChecklistResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'failed' }
  const db = createAdminClient()
  const { error } = await db.from('checklist_rounds').delete().eq('id', id)
  if (error) return fail(error)
  await db.from('staff_actions').insert({ actor_id: ctx.userId, action: 'checklist_round_delete', detail: { id } })
  done()
  return { ok: true }
}
