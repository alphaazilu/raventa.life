'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MY_CHECKLIST_PATH } from '@/lib/auth/roles'
import { isMissingTable } from '@/lib/console/db-errors'
import { readPointCode } from '@/lib/checklist-code'
import { getPoint } from '@/lib/console/checklist'
import { answerFlags, FAST_SECONDS, type Answer, type CheckPoint } from '@/lib/checklist'

// Staff checklists from their own phone (§29, v0.29): open a point from its
// scanned QR, then save what was found there. The code is checked again on
// save, so a point can only be logged by scanning its sticker.

export type OpenResult =
  | { ok: true; code: string; point: Pick<CheckPoint, 'id' | 'name' | 'place' | 'items'>; last: { at: string; by: string } | null }
  | { ok: false; error: string }
export type ScanResult = { ok: true; flags: string[] } | { ok: false; error: string }

async function me(): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'not_signed_in' }
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return p?.role === 'staff' || p?.role === 'admin' ? { id: user.id } : { error: 'not_staff' }
}

async function pointFromCode(raw: string): Promise<{ point: CheckPoint } | { error: string }> {
  const c = readPointCode(String(raw ?? ''))
  if (!c.ok) return { error: 'bad_code' }
  let point: CheckPoint | null
  try {
    point = await getPoint(c.pointId)
  } catch (e) {
    return { error: isMissingTable(e as { code?: string }) ? 'not_set_up' : 'failed' }
  }
  if (!point) return { error: 'bad_code' }
  if (point.codeVersion !== c.version) return { error: 'old_code' }
  if (!point.active) return { error: 'inactive' }
  return { point }
}

export async function openPoint(raw: string): Promise<OpenResult> {
  const who = await me()
  if ('error' in who) return { ok: false, error: who.error }
  const r = await pointFromCode(raw)
  if ('error' in r) return { ok: false, error: r.error }
  const db = createAdminClient()
  const { data: last } = await db
    .from('checklist_scans')
    .select('scanned_at, staff_id')
    .eq('point_id', r.point.id)
    .order('scanned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  let lastBy = '—'
  if (last) {
    const { data: p } = await db.from('profiles').select('first_name, last_name, email').eq('id', last.staff_id).maybeSingle()
    lastBy = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.email || '—'
  }
  const { id, name, place, items } = r.point
  return { ok: true, code: String(raw).trim(), point: { id, name, place, items }, last: last ? { at: last.scanned_at as string, by: lastBy } : null }
}

export async function submitScan(raw: string, answers: Answer[], note: string, issue: boolean): Promise<ScanResult> {
  const who = await me()
  if ('error' in who) return { ok: false, error: who.error }
  const r = await pointFromCode(raw)
  if ('error' in r) return { ok: false, error: r.error }
  const point = r.point

  // Keep only this point's items, each with a value of its own kind.
  const given = Array.isArray(answers) ? answers : []
  const results: Answer[] = point.items.map((it) => {
    const v = given.find((a) => a && a.id === it.id)?.value
    const value =
      it.kind === 'check'
        ? v === true
        : it.kind === 'number'
          ? typeof v === 'number' && Number.isFinite(v)
            ? v
            : null
          : typeof v === 'string' && v.trim()
            ? v.trim().slice(0, 200)
            : null
    return { id: it.id, label: it.label, value }
  })
  const flags = answerFlags(point.items, results)
  const db = createAdminClient()
  const now = Date.now()
  const { data: prev } = await db
    .from('checklist_scans')
    .select('point_id, scanned_at')
    .eq('staff_id', who.id)
    .gte('scanned_at', new Date(now - FAST_SECONDS * 1000).toISOString())
    .neq('point_id', point.id)
    .limit(1)
  if (prev?.length) flags.push('fast')
  if (issue) flags.push('issue')

  const ua = (await headers()).get('user-agent')?.slice(0, 300) ?? null
  const { error } = await db.from('checklist_scans').insert({
    point_id: point.id,
    staff_id: who.id,
    scanned_at: new Date(now).toISOString(),
    results,
    note: String(note ?? '').trim().slice(0, 500) || null,
    issue: Boolean(issue),
    flags,
    user_agent: ua,
  })
  if (error) return { ok: false, error: isMissingTable(error) ? 'not_set_up' : 'failed' }
  revalidatePath(MY_CHECKLIST_PATH)
  return { ok: true, flags }
}
