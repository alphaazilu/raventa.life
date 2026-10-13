import { NextResponse } from 'next/server'

// The rating QR at the exit (§32, v0.33) — a short, stable address that
// opens the member's rating page (sign-in first when needed).
export function GET(request: Request) {
  return NextResponse.redirect(new URL('/account/feedback', request.url))
}
