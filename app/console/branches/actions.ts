'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/console/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { BRANCHES_PATH, SETTINGS_PATH } from '@/lib/auth/roles'

// Branch tree (§50, v0.38.8): add a group/branch, rename, turn on/off, move it
// under another node, or remove it. Admins only; the table is service-role.

export type BranchResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f-]{36}$/i
const fail = (error: { code?: string } | null): BranchResult => ({ ok: false, error: error?.code === '42703' || error?.code === '42P01' ? 'not_set_up' : 'failed' })
const done = () => {
  revalidatePath(BRANCHES_PATH)
  revalidatePath(SETTINGS_PATH)
}

// Add a region/province (group) or a branch under a parent (null = top level).
export async function addBranchNode(parentId: string | null, kind: 'group' | 'branch', rawName: string): Promise<BranchResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const name = String(rawName ?? '').trim().slice(0, 60)
  if (!name) return { ok: false, error: 'need_name' }
  if (kind !== 'group' && kind !== 'branch') return { ok: false, error: 'bad_kind' }
  if (parentId && !UUID.test(parentId)) return { ok: false, error: 'bad_input' }
  const db = createAdminClient()
  if (parentId) {
    const { data: p } = await db.from('branches').select('id').eq('id', parentId).maybeSingle()
    if (!p) return { ok: false, error: 'parent_gone' }
  }
  const { data: last } = await db.from('branches').select('sort').order('sort', { ascending: false }).limit(1)
  const { error } = await db.from('branches').insert({ name, kind, parent_id: parentId, sort: Number(last?.[0]?.sort ?? 0) + 1 })
  if (error) return fail(error)
  done()
  return { ok: true }
}

export async function renameBranch(id: string, rawName: string): Promise<BranchResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'bad_input' }
  const name = String(rawName ?? '').trim().slice(0, 60)
  if (!name) return { ok: false, error: 'need_name' }
  const { error } = await createAdminClient().from('branches').update({ name }).eq('id', id)
  if (error) return fail(error)
  done()
  return { ok: true }
}

export async function setBranchActive(id: string, active: boolean): Promise<BranchResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'bad_input' }
  const { error } = await createAdminClient().from('branches').update({ is_active: active }).eq('id', id)
  if (error) return fail(error)
  done()
  return { ok: true }
}

// Move a node under a new parent (null = top level). Can't drop onto itself or
// its own descendant, which would make a loop.
export async function moveBranch(id: string, newParentId: string | null): Promise<BranchResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'bad_input' }
  if (newParentId !== null && !UUID.test(newParentId)) return { ok: false, error: 'bad_input' }
  if (newParentId === id) return { ok: false, error: 'bad_move' }
  const db = createAdminClient()
  const { data, error: e } = await db.from('branches').select('id, parent_id')
  if (e) return fail(e)
  const parentOf = new Map<string, string | null>((data ?? []).map((r) => [r.id as string, (r.parent_id as string | null) ?? null]))
  if (!parentOf.has(id)) return { ok: false, error: 'gone' }
  // Walk up from the target; if we reach id, the move would make a cycle.
  for (let cur = newParentId; cur; cur = parentOf.get(cur) ?? null) {
    if (cur === id) return { ok: false, error: 'bad_move' }
  }
  const { error } = await db.from('branches').update({ parent_id: newParentId }).eq('id', id)
  if (error) return fail(error)
  done()
  return { ok: true }
}

// Remove a node. Its children move up to the node's own parent (never orphaned).
// At least one real branch must remain.
export async function deleteBranchNode(id: string): Promise<BranchResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (!UUID.test(id)) return { ok: false, error: 'bad_input' }
  const db = createAdminClient()
  const { data: node } = await db.from('branches').select('id, parent_id, kind').eq('id', id).maybeSingle()
  if (!node) return { ok: false, error: 'gone' }
  if (node.kind === 'branch') {
    const { count } = await db.from('branches').select('id', { count: 'exact', head: true }).eq('kind', 'branch')
    if ((count ?? 0) <= 1) return { ok: false, error: 'branch_last' }
  }
  // Promote children to this node's parent, then delete it.
  await db.from('branches').update({ parent_id: (node.parent_id as string | null) ?? null }).eq('parent_id', id)
  const { error } = await db.from('branches').delete().eq('id', id)
  if (error) return fail(error)
  done()
  return { ok: true }
}
