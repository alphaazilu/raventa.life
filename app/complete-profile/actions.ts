'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPhoneTaken, isUniqueViolation, PHONE_TAKEN_MESSAGE_TH } from '@/lib/supabase/phone'
import { getResendClient } from '@/lib/resend'
import { welcomeEmail } from '@/lib/email-templates'
import { saveLineUserId } from '@/lib/supabase/line'

export type CompleteProfileState = { error?: string; fieldErrors?: Record<string, string> } | null

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? '/account')
  // Only ever redirect to a path within this app — never to an external URL.
  return next.startsWith('/') ? next : '/account'
}

const PHONE_RE = /^[0-9]{9,10}$/
// Deliberately loose (something@something.tld) — the browser's type="email"
// does the finer check; this just stops obvious junk on a direct POST.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMAIL_TAKEN_MESSAGE_TH =
  'อีเมลนี้มีบัญชีสมาชิกอยู่แล้ว กรุณาเข้าสู่ระบบด้วยวิธีที่เคยสมัครไว้ หรือติดต่อเรา'

export async function completeProfile(
  _prevState: CompleteProfileState,
  formData: FormData,
): Promise<CompleteProfileState> {
  const typedEmail = String(formData.get('email') ?? '').trim().toLowerCase()
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const province = String(formData.get('province') ?? '').trim()
  const nationality = String(formData.get('nationality') ?? '').trim()
  const acceptPrivacy = formData.get('acceptPrivacy') === 'on'
  const next = safeNext(formData.get('next'))

  // Collect every problem at once so every field that needs fixing can be
  // highlighted together, instead of the person fixing one and resubmitting
  // only to discover the next.
  const fieldErrors: Record<string, string> = {}
  if (!firstName) fieldErrors.firstName = 'กรุณากรอกชื่อ'
  if (!lastName) fieldErrors.lastName = 'กรุณากรอกนามสกุล'
  if (!phone) {
    fieldErrors.phone = 'กรุณากรอกเบอร์โทรศัพท์'
  } else if (!PHONE_RE.test(phone)) {
    fieldErrors.phone = 'กรุณากรอกเบอร์โทรศัพท์ 9-10 หลัก'
  }
  if (!province) fieldErrors.province = 'กรุณาเลือกจังหวัด'
  if (!nationality) fieldErrors.nationality = 'กรุณาเลือกสัญชาติ'
  // This is a first-time OAuth signup's one and only stop before an account
  // is usable, so it's where consent gets captured for that path — enforced
  // server-side too since a request can always skip the checkbox's
  // client-side "required" attribute.
  if (!acceptPrivacy) {
    fieldErrors.acceptPrivacy = 'กรุณายอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานก่อนใช้งานบัญชี'
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Accounts that signed in with an email (email/password, Google) keep
  // that one. Only accounts without one (LINE) must type it here.
  const needsEmail = !user.email
  if (needsEmail) {
    if (!typedEmail) {
      fieldErrors.email = 'กรุณากรอกอีเมล'
    } else if (!EMAIL_RE.test(typedEmail)) {
      fieldErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง'
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'กรุณากรอกข้อมูลให้ครบและถูกต้อง', fieldErrors }
  }

  // `||`, not `??`: Supabase reports a LINE account's missing email as ""
  // rather than null, and "" must fall through to the typed email too.
  const email = user.email || typedEmail

  // Someone who already has an account (e.g. signed up with Google) and
  // now signs in with LINE would otherwise get a second membership. Stop
  // that here and point them back to the way they originally joined.
  if (needsEmail) {
    const { data: emailTaken } = await supabase.rpc('email_is_taken', {
      p_email: email,
      p_exclude_id: user.id,
    })
    if (emailTaken === true) {
      return { error: EMAIL_TAKEN_MESSAGE_TH, fieldErrors: { email: EMAIL_TAKEN_MESSAGE_TH } }
    }
  }

  // Google signups set their phone here rather than on the signup form, so
  // the one-account-per-phone rule is checked here too.
  if (await isPhoneTaken(supabase, phone, user.id)) {
    return { error: PHONE_TAKEN_MESSAGE_TH, fieldErrors: { phone: PHONE_TAKEN_MESSAGE_TH } }
  }

  // Read before the save, so the welcome email below only goes out the
  // first time an email lands on this profile — not on a later visit here.
  const { data: before } = await supabase.from('profiles').select('email').eq('id', user.id).maybeSingle()
  const isFirstEmail = needsEmail && !before?.email

  // upsert, not update: if the profiles row is missing for any reason (for
  // example it was deleted directly in the table editor), a plain update
  // silently affects 0 rows and returns no error — the person would then
  // get bounced right back here by the completeness check, forever. Upsert
  // recreates the row when needed, so this always actually fixes the gate.
  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, email, first_name: firstName, last_name: lastName, phone, province, nationality },
      { onConflict: 'id' },
    )

  if (isUniqueViolation(error)) {
    return { error: PHONE_TAKEN_MESSAGE_TH, fieldErrors: { phone: PHONE_TAKEN_MESSAGE_TH } }
  }
  if (error) return { error: error.message }

  // A LINE member whose profile row had to be (re)created just now — the
  // callback's copy found no row to write to in that case.
  await saveLineUserId(supabase, user)

  // The welcome email normally goes out from the new-user webhook when the
  // profile row is first created — but for a LINE signup there was no email
  // yet at that moment, so it was skipped. Send it now that there is one.
  if (isFirstEmail) {
    const { data: saved } = await supabase.from('profiles').select('member_no').eq('id', user.id).maybeSingle()
    await sendWelcomeEmail(email, firstName, saved?.member_no ?? null)
  }

  revalidatePath('/', 'layout')
  redirect(next)
}

// Never lets an email problem block the signup itself — the profile is
// already saved by the time this runs, so a failure is only logged.
async function sendWelcomeEmail(to: string, firstName: string, memberNo: string | null) {
  const from = process.env.EMAIL_FROM_ADDRESS
  if (!from) return
  try {
    const { subject, html } = welcomeEmail(firstName, memberNo)
    await getResendClient().emails.send({ from, to, subject, html })
  } catch (err) {
    console.error('complete-profile: welcome email failed to send', err)
  }
}
