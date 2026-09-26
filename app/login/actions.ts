'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AuthActionState = {
  error?: string
  success?: 'checkEmail'
  fieldErrors?: Record<string, string>
} | null

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? '/account')
  // Only ever redirect to a path within this app — never to an external URL.
  return next.startsWith('/') ? next : '/account'
}

export async function signIn(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))

  if (!email || !password) {
    const fieldErrors: Record<string, string> = {}
    if (!email) fieldErrors.email = 'Please enter your email.'
    if (!password) fieldErrors.password = 'Please enter your password.'
    return { error: 'Please fill in your email and password.', fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    // Supabase deliberately doesn't say whether the email or the password
    // was wrong (avoids leaking which emails have accounts), so both
    // fields are flagged together rather than guessing which to blame.
    return { error: error.message, fieldErrors: { email: error.message, password: error.message } }
  }

  revalidatePath('/', 'layout')
  redirect(next)
}

// Mirrors the client-side check in login-form.tsx — enforced again here
// since a request can always skip the browser's own validation.
const SIGNUP_PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

export async function signUp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const province = String(formData.get('province') ?? '').trim()
  const acceptPrivacy = formData.get('acceptPrivacy') === 'on'
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'

  // Collect every problem at once rather than stopping at the first one,
  // so every field that needs fixing can be highlighted together.
  const fieldErrors: Record<string, string> = {}
  if (!firstName) fieldErrors.firstName = 'Please enter your first name.'
  if (!lastName) fieldErrors.lastName = 'Please enter your last name.'
  if (!phone) fieldErrors.phone = 'Please enter your phone number.'
  if (!province) fieldErrors.province = 'Please select a province.'
  if (!email) fieldErrors.email = 'Please enter your email.'
  if (!SIGNUP_PASSWORD_RE.test(password)) {
    fieldErrors.password = 'Password must be at least 8 characters and include both letters and numbers.'
  }
  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = 'Passwords do not match.'
  }
  // Enforced again here since a request can always skip the checkbox's
  // client-side "required" attribute (e.g. a direct form POST).
  if (!acceptPrivacy) {
    fieldErrors.acceptPrivacy = 'Please accept the Privacy Policy and Terms of Service.'
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'Please check the highlighted fields.', fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      // Read by the handle_new_user() trigger (see supabase/schema.sql) to
      // fill in the profiles row — this data rides along on auth.users
      // itself, not a separate write, so it can't drift from the account.
      data: { first_name: firstName, last_name: lastName, phone, province },
    },
  })
  if (error) return { error: error.message, fieldErrors: { email: error.message } }

  return { success: 'checkEmail' }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
