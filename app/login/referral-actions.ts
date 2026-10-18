'use server'

import { staffByCode } from '@/lib/console/referral'

// Sign-up forms (§36, v0.36): whose referral code this is — first name only.
export async function checkRefCode(text: string): Promise<{ firstName: string } | null> {
  if (typeof text !== 'string' || text.length > 300) return null
  const s = await staffByCode(text).catch(() => null)
  return s ? { firstName: s.firstName } : null
}
