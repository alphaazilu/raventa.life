import { getConsoleSession } from '@/lib/console/session'
import { isAdmin } from '@/lib/auth/roles'
import { effectivePermissions } from '@/lib/auth/permissions'
import { holds } from '@/lib/auth/permission-catalog'

// Shared by the Back Office server actions and export routes.

// Server actions still check the role (RBAC phase 2 moved the pages, menu,
// middleware and exports onto permissions; the actions follow later).
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
