import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getResendClient } from '@/lib/resend'
import { welcomeEmail, teamNotificationEmail } from '@/lib/email-templates'

// Supabase Database Webhook payload shape for an INSERT on public.profiles.
// https://supabase.com/docs/guides/database/webhooks
type ProfileWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    phone: string | null
    province: string | null
    member_no: string | null
  } | null
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.SUPABASE_WEBHOOK_SECRET
  if (!expected) return false

  const provided = request.headers.get('x-webhook-secret') ?? ''
  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(provided)

  // Lengths must match before timingSafeEqual will even run, so pad the
  // check itself rather than short-circuiting on length (which would leak
  // timing info about the secret's length otherwise negligible here).
  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: ProfileWebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (payload.type !== 'INSERT' || payload.table !== 'profiles' || !payload.record) {
    // Not the event we care about — acknowledge so Supabase doesn't retry.
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { email, first_name, last_name, phone, province, member_no } = payload.record
  const teamEmail = process.env.TEAM_NOTIFICATION_EMAIL
  const fromAddress = process.env.EMAIL_FROM_ADDRESS

  if (!fromAddress) {
    return NextResponse.json({ error: 'EMAIL_FROM_ADDRESS is not set' }, { status: 500 })
  }

  const resend = getResendClient()
  const results = await Promise.allSettled([
    email
      ? (() => {
          const { subject, html } = welcomeEmail(first_name, member_no)
          return resend.emails.send({ from: fromAddress, to: email, subject, html })
        })()
      : Promise.resolve(null),
    teamEmail
      ? (() => {
          const { subject, html } = teamNotificationEmail({ email: email ?? '(ไม่ทราบอีเมล)', firstName: first_name, lastName: last_name, phone, province })
          return resend.emails.send({ from: fromAddress, to: teamEmail, subject, html })
        })()
      : Promise.resolve(null),
  ])

  const failures = results.filter((r) => r.status === 'rejected')
  if (failures.length > 0) {
    console.error('new-user webhook: some emails failed to send', failures)
  }

  // Always 200 — this just acknowledges receipt to Supabase. A send
  // failure is logged above rather than triggering a Supabase retry,
  // which would otherwise risk emailing the same signup twice.
  return NextResponse.json({ ok: true, failures: failures.length })
}
