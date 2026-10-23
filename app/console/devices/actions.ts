'use server'

import { isMissingTable } from '@/lib/console/guard'
import { revalidatePath } from 'next/cache'
import { getConsoleSession } from '@/lib/console/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEVICES_PATH, isAdmin } from '@/lib/auth/roles'
import { getCurrentDevice } from '@/lib/console/device'

// Back Office → Devices: approve a tablet's pairing code, rename or revoke
// tablets. Admins only; the tables are service-role only (schema.sql §15),
// so every action checks the caller's role first.

export type DeviceRow = {
  id: string
  name: string
  createdAt: string
  lastSeenAt: string | null
  paired: boolean
  revokedAt: string | null
  branchId: string | null
}

export type DeviceResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { user, role } = await getConsoleSession()
  if (!user) return { error: 'not_admin' }
  if (!isAdmin(role)) return { error: 'not_admin' }
  // Device management is never allowed from a counter tablet.
  if (await getCurrentDevice().catch(() => null)) return { error: 'not_admin' }
  return { userId: user.id }
}

function isMissing(error: { code?: string } | null) {
  return isMissingTable(error)
}

export async function listDevices(): Promise<DeviceResult<DeviceRow[]>> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const pick = (cols: string) =>
    createAdminClient()
      .from('devices')
      .select(cols)
      .order('revoked_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false })
  // branch_id arrives with §47; tolerate it being absent.
  let res = await pick('id, name, created_at, last_seen_at, token_hash, revoked_at, branch_id')
  if ((res.error as { code?: string } | null)?.code === '42703') res = await pick('id, name, created_at, last_seen_at, token_hash, revoked_at')
  const { data, error } = res
  if (error) return { ok: false, error: isMissing(error) ? 'not_set_up' : 'failed' }
  return {
    ok: true,
    data: ((data ?? []) as unknown as Record<string, unknown>[]).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      createdAt: d.created_at as string,
      lastSeenAt: (d.last_seen_at as string | null) ?? null,
      paired: Boolean(d.token_hash),
      revokedAt: (d.revoked_at as string | null) ?? null,
      branchId: (d.branch_id as string | null) ?? null,
    })),
  }
}

// Assign a tablet to a branch (§47): everything it rings up is tagged with
// this branch, and it works that branch's cash drawer. null = main branch.
export async function setDeviceBranch(id: string, branchId: string | null): Promise<DeviceResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await createAdminClient().from('devices').update({ branch_id: branchId }).eq('id', id)
  if (error) return { ok: false, error: (error as { code?: string }).code === '42703' ? 'not_set_up' : 'failed' }
  revalidatePath(DEVICES_PATH)
  return { ok: true, data: null }
}

export async function approveDevice(rawCode: string, rawName: string): Promise<DeviceResult<{ name: string }>> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const code = rawCode.replace(/\D/g, '')
  const name = rawName.trim().slice(0, 60)
  if (code.length !== 6) return { ok: false, error: 'bad_code' }
  if (!name) return { ok: false, error: 'name_required' }

  const admin = createAdminClient()
  const { data: pairing, error } = await admin
    .from('device_pairing_codes')
    .select('id')
    .eq('code', code)
    .is('claimed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, error: isMissing(error) ? 'not_set_up' : 'failed' }
  if (!pairing) return { ok: false, error: 'code_not_found' }

  const { data: device, error: devErr } = await admin
    .from('devices')
    .insert({ name, created_by: ctx.userId })
    .select('id')
    .single()
  if (devErr || !device) return { ok: false, error: 'failed' }

  // Only one approval per code, even if two admins try at once.
  const { data: claimed } = await admin
    .from('device_pairing_codes')
    .update({ claimed_at: new Date().toISOString(), claimed_by: ctx.userId, device_id: device.id })
    .eq('id', pairing.id)
    .is('claimed_at', null)
    .select('id')
    .maybeSingle()
  if (!claimed) {
    await admin.from('devices').delete().eq('id', device.id)
    return { ok: false, error: 'code_not_found' }
  }
  revalidatePath(DEVICES_PATH)
  return { ok: true, data: { name } }
}

export async function renameDevice(id: string, rawName: string): Promise<DeviceResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const name = rawName.trim().slice(0, 60)
  if (!name) return { ok: false, error: 'name_required' }
  const { error } = await createAdminClient().from('devices').update({ name }).eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(DEVICES_PATH)
  return { ok: true, data: null }
}

// The tablet drops back to "not registered" on its next request.
export async function revokeDevice(id: string): Promise<DeviceResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { error } = await createAdminClient()
    .from('devices')
    .update({ revoked_at: new Date().toISOString(), revoked_by: ctx.userId, token_hash: null })
    .eq('id', id)
    .is('revoked_at', null)
  if (error) return { ok: false, error: 'failed' }
  revalidatePath(DEVICES_PATH)
  return { ok: true, data: null }
}
