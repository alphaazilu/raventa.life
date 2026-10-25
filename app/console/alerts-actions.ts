'use server'

import { requireAdmin } from '@/lib/console/guard'
import { loadAlerts, type ConsoleAlerts } from '@/lib/console/alerts'
import { recentOpenLeads, type LeadPreview } from '@/lib/console/leads'

// The bell in the top bar asks for fresh numbers every minute (v0.38.31) —
// the console layout itself only re-renders on a refresh or a revalidate.
export async function refreshAlerts(): Promise<{ alerts: ConsoleAlerts; leads: LeadPreview[] } | null> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return null
  const [alerts, leads] = await Promise.all([loadAlerts(), recentOpenLeads().catch(() => [])])
  return { alerts, leads }
}
