// Roles in profiles.role (see supabase/schema.sql §13). Everyone is a
// member first; staff and admin add desk / back-office access on top.
export type Role = 'customer' | 'staff' | 'admin'

// Front desk: /admin/check-in.
export function canUseDesk(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'admin'
}

// Everything else under /admin.
export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin'
}

export const DESK_PATH = '/admin/check-in'
