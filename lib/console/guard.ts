import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getConsoleSession } from '@/lib/console/session'
import { isAdmin } from '@/lib/auth/roles'
import { effectivePermissions } from '@/lib/auth/permissions'
import { consoleHomeFor, holds, mayOpen } from '@/lib/auth/permission-catalog'
import { DEVICE_COOKIE } from '@/lib/console/device-cookie'

// Shared by the Back Office server actions and export routes.

/**
 * A Back Office page's gate (RBAC 3b, v0.44.6): ROUTE_RULES for `path`
 * against the person's real permissions (staff_roles included) — what the
 * middleware used to check from profiles.role alone. The tablet condition is
 * the same as before: a device cookie on the request. Turned away → their
 * console home (desk / reports / account), as the middleware did.
 */
export async function gatePage(path: string): Promise<void> {
  const { user } = await getConsoleSession()
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`)
  const perms = await effectivePermissions(user.id)
  const onTablet = Boolean((await cookies()).get(DEVICE_COOKIE)?.value)
  if (!mayOpen(perms, path, onTablet)) redirect(consoleHomeFor(perms))
}

// Work only an admin does (settings, brand, branches, devices, team & roles,
// the alert bell). Everything else checks permissions (requirePermissions).
export async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { user, role } = await getConsoleSession()
  if (!user || !isAdmin(role)) return { error: 'not_admin' }
  return { userId: user.id }
}

/** Every one of these permissions (RBAC, v0.44.1) — e.g. an area + action:export.data. */
export async function requirePermissions(...keys: string[]): Promise<{ userId: string } | { error: string }> {
  const { user } = await getConsoleSession()
  if (!user) return { error: 'not_admin' }
  const perms = await effectivePermissions(user.id)
  if (!keys.every((k) => holds(perms, k))) return { error: 'not_admin' }
  return { userId: user.id }
}

// Sales + package reports' export: the sales report + exporting (admins, accountants).
export const requireReports = () => requirePermissions('access:reports.sales', 'action:export.data')

export { isMissingTable } from './db-errors'
