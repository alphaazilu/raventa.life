import { Resend } from 'resend'

// Lazily constructed so builds/type-checks never fail just because
// RESEND_API_KEY isn't set in a given environment (e.g. preview builds).
let client: Resend | null = null

export function getResendClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set')
    }
    client = new Resend(apiKey)
  }
  return client
}
