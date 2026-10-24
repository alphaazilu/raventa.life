'use server'

import { createClient } from '@/lib/supabase/server'

// The public "Find My Journey" quiz can offer an optional "contact me" form
// (§52, v0.38.19). Anyone — signed in or not — can submit; the insert runs
// through a security-definer RPC and, when signed in, is tagged with the
// member id server-side. Staff read the leads in the Back Office.
export type LeadResult = { ok: true } | { ok: false; error: string }

export async function submitQuizLead(input: {
  name: string
  contact: string
  contactType: 'phone' | 'email' | 'line' | 'other'
  goals: string[]
  journeyId: string
  journeySummary: string
  totalMinutes: number
  adjustments: string[]
}): Promise<LeadResult> {
  const contact = input.contact.trim()
  if (!contact) return { ok: false, error: 'contact_required' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_quiz_lead', {
    p_name: input.name.trim().slice(0, 120) || null,
    p_contact: contact.slice(0, 200),
    p_contact_type: input.contactType,
    p_goals: input.goals.slice(0, 6),
    p_journey_id: input.journeyId.slice(0, 80),
    p_journey_summary: input.journeySummary.slice(0, 400),
    p_total_minutes: Math.round(input.totalMinutes) || 0,
    p_adjustments: input.adjustments.slice(0, 10),
  })
  if (error) {
    // Table/function not deployed yet (schema §52 not run) — don't surface a
    // scary error to a guest; just say it didn't go through.
    return { ok: false, error: error.message?.includes('contact_required') ? 'contact_required' : 'failed' }
  }
  return { ok: true }
}
