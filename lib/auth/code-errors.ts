// Messages for the 6-digit email-code flows (account settings, Google link).

type Bilingual = { th: string; en: string }
type Tr = (v: Bilingual) => string

const ERRORS: Record<string, Bilingual> = {
  invalid_email: { th: 'รูปแบบอีเมลไม่ถูกต้อง', en: 'That email doesn’t look right.' },
  taken: {
    th: 'อีเมลนี้เป็นของสมาชิก RAVENTA อีกบัญชีหนึ่งอยู่แล้ว หากเป็นของคุณ กรุณาติดต่อเราเพื่อรวมบัญชี',
    en: 'This email already belongs to another RAVENTA membership. If it’s yours, contact us to merge them.',
  },
  too_soon: { th: 'เพิ่งส่งรหัสไป รอสักครู่แล้วลองใหม่', en: 'A code was just sent — wait a moment and try again.' },
  limit: { th: 'ขอรหัสครบจำนวนต่อวันแล้ว กรุณาลองใหม่พรุ่งนี้', en: 'Daily limit reached. Please try again tomorrow.' },
  no_code: { th: 'ไม่พบรหัสที่ส่งไป กรุณาส่งรหัสใหม่', en: 'No code found — please send a new one.' },
  wrong_code: { th: 'รหัสไม่ถูกต้อง ลองอีกครั้ง', en: 'That code isn’t right. Try again.' },
  expired: { th: 'รหัสหมดอายุแล้ว กรุณาส่งรหัสใหม่', en: 'That code has expired — send a new one.' },
  too_many_attempts: { th: 'กรอกผิดหลายครั้งเกินไป กรุณาส่งรหัสใหม่', en: 'Too many tries — send a new code.' },
  weak_password: {
    th: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข',
    en: 'At least 8 characters, with both letters and numbers.',
  },
  mismatch: { th: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน', en: 'Passwords don’t match.' },
  same_password: { th: 'รหัสผ่านนี้ใช้อยู่แล้ว', en: 'That’s already your password.' },
  reauthentication_needed: {
    th: 'เพื่อความปลอดภัย กรุณาออกจากระบบแล้วเข้าใหม่ก่อนตั้งรหัสผ่าน',
    en: 'For your security, please sign out and back in before setting a password.',
  },
  not_set_up: { th: 'ระบบยืนยันอีเมลยังไม่พร้อม กรุณาติดต่อทีมงาน', en: 'Email verification isn’t set up yet. Please contact us.' },
  no_sender: { th: 'ระบบส่งอีเมลยังไม่ได้ตั้งค่า กรุณาติดต่อทีมงาน', en: 'Email sending isn’t set up yet. Please contact us.' },
  send_failed: { th: 'ส่งอีเมลไม่สำเร็จ ตรวจว่าพิมพ์อีเมลถูกต้องแล้วลองอีกครั้ง', en: 'Couldn’t send the email. Check the address and try again.' },
  expired_ticket: {
    th: 'หมดเวลาแล้ว กรุณากด “เข้าสู่ระบบด้วย Google” ใหม่อีกครั้ง',
    en: 'This timed out — tap “Continue with Google” again.',
  },
  failed: { th: 'ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง', en: 'Something went wrong. Please try again.' },
}

export function codeErrorText(code: string, tr: Tr): string {
  return tr(ERRORS[code] ?? ERRORS.failed)
}
