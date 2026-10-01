// Roles in profiles.role (see supabase/schema.sql §13). Everyone is a
// member first; staff and admin add back-office access on top.
export type Role = 'customer' | 'staff' | 'admin'

// Front desk: /console/desk (sell + check in).
export function canUseDesk(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'admin'
}

// Everything else in the Back Office console.
export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin'
}

// Back Office console (v0.13). The old /admin URLs redirect here
// (next.config.mjs).
export const CONSOLE_PATH = '/console'
export const DESK_PATH = '/console/desk'
export const MEMBERS_PATH = '/console/members'
export const DEVICES_PATH = '/console/devices'
export const TIME_PATH = '/console/time'
// Pairing screen for a new counter tablet (outside the console's login gate).
export const TABLET_SETUP_PATH = '/tablet'
