import { getConsoleSession } from '@/lib/console/session'
import { isAdmin } from '@/lib/auth/roles'

// Shared by the Back Office server actions.

export async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { user, role } = await getConsoleSession()
  if (!user || !isAdmin(role)) return { error: 'not_admin' }
  return { userId: user.id }
}

export { isMissingTable } from './db-errors'
