// Roles in profiles.role (see supabase/schema.sql §13). Everyone is a
// member first; staff and admin add back-office access on top. `accountant`
// is a back-office role that can reach the Reports page only (v0.38.22).
export type Role = 'customer' | 'staff' | 'admin' | 'accountant'

// Front desk: /console/desk (sell + check in).
export function canUseDesk(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'admin'
}

// Everything else in the Back Office console.
export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin'
}

// Accounts-only user: Reports page, nothing else.
export function isAccountant(role: string | null | undefined): boolean {
  return role === 'accountant'
}

// Anyone allowed through the Back Office shell (each page still gates itself).
export function canUseConsole(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'admin' || role === 'accountant'
}

// Reports page (sales + packages). Admins see every tab; accountants only
// the sales tab (time / commission are payroll — admin only).
export function canViewReports(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'accountant'
}

// Back Office console (v0.13). The old /admin URLs redirect here
// (next.config.mjs).
export const CONSOLE_PATH = '/console'
export const DESK_PATH = '/console/desk'
export const MEMBERS_PATH = '/console/members'
export const DEVICES_PATH = '/console/devices'
export const BRANCHES_PATH = '/console/branches'
export const TIME_PATH = '/console/time'
export const CATALOG_PATH = '/console/catalog'
export const SETTINGS_PATH = '/console/settings'
export const REPORTS_PATH = '/console/reports'
export const TEAM_PATH = '/console/team'
export const BOOKINGS_PATH = '/console/bookings' // bookings: day, list, setup (v0.35)
export const MY_BOOKINGS_PATH = '/account/bookings'
export const FEEDBACK_PATH = '/console/feedback' // member ratings + comments (v0.33)
export const CALENDAR_PATH = '/console/calendar' // events, campaigns, notes (v0.32)
export const CASH_PATH = '/console/cash' // drawer: open, blind count, close (v0.31)
export const CHECKLIST_PATH = '/console/checklist' // admin: set up + log (v0.29)
export const MY_CHECKLIST_PATH = '/account/checklist' // staff phone: today's rounds + scan
// Pairing screen for a new counter tablet (outside the console's login gate).
export const TABLET_SETUP_PATH = '/tablet'

// Where a back-office user belongs when they land on /console or are turned
// away from a page they can't use: accountants → Reports, everyone else →
// the front desk. Non-console roles should never reach these call sites.
export function consoleHome(role: string | null | undefined): string {
  return role === 'accountant' ? REPORTS_PATH : DESK_PATH
}
