// Member referrals (§36, v0.36) — shared by the sign-up forms and the server.
// A team member's code is 6 letters/digits (no 0/O/1/I to misread). Their
// QR is a sign-up link carrying it: /login?ref=CODE.

export const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const REF_RE = /^[A-Z2-9]{6}$/
export const REF_COOKIE = 'rv-ref'

// From what was typed or scanned (a code, or a link with ?ref=) to a code, or ''.
export function extractRefCode(text: string): string {
  const t = text.trim()
  if (!t) return ''
  try {
    if (/^https?:\/\//i.test(t)) return normalizeRefCode(new URL(t).searchParams.get('ref') ?? '')
  } catch {}
  const m = t.match(/[?&]ref=([^&#\s]+)/i)
  return normalizeRefCode(m ? decodeURIComponent(m[1]) : t)
}

export function normalizeRefCode(t: string): string {
  return t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

const L = (th: string, en: string) => ({ th, en })

export const refCopy = {
  label: L('รหัสผู้แนะนำ (ไม่บังคับ)', 'Referral code (optional)'),
  hint: L('ถ้าพนักงาน RAVENTA แนะนำให้สมัคร ใส่รหัสหรือสแกน QR ของพนักงาน', 'If a RAVENTA team member suggested joining, enter or scan their code'),
  scan: L('สแกน QR', 'Scan QR'),
  scanTitle: L('สแกน QR แนะนำของพนักงาน', 'Scan the team member’s referral QR'),
  close: L('ปิด', 'Close'),
  checking: L('กำลังตรวจรหัส…', 'Checking…'),
  found: L('แนะนำโดย {name}', 'Referred by {name}'),
  notFound: L('ไม่พบรหัสนี้ — ตรวจอีกครั้ง หรือเว้นว่างไว้ก็สมัครได้', 'Code not found — check it, or leave it empty'),
  remove: L('ล้าง', 'Clear'),
}
