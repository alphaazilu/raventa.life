# Supabase Auth email templates (RAVENTA theme)

วางใน Supabase → Authentication → Email Templates: ใส่ **Subject** ตามตาราง และคัดลอกเนื้อไฟล์ .html ทั้งไฟล์ไปที่ **Message body** (แท็บ Source)

| Template ใน Supabase | ไฟล์ | Subject |
|---|---|---|
| Confirm signup | `1-confirm-signup.html` | `ยืนยันอีเมลเพื่อเริ่มใช้งาน RAVENTA · Confirm your email` |
| Reset Password | `2-reset-password.html` | `ตั้งรหัสผ่านใหม่สำหรับ RAVENTA · Reset your password` |
| Magic Link | `3-magic-link.html` | `ลิงก์เข้าสู่ระบบ RAVENTA · Your sign-in link` |
| Change Email Address | `4-change-email.html` | `ยืนยันอีเมลใหม่ของบัญชี RAVENTA · Confirm your new email` |
| Invite user | `5-invite-user.html` | `คุณได้รับเชิญเข้าร่วม RAVENTA · You’re invited to RAVENTA` |
| Reauthentication | `6-reauthentication.html` | `{{ .Token }} คือรหัสยืนยันตัวตนของคุณที่ RAVENTA` |

- ที่เว็บใช้จริง: **Confirm signup** (สมัครด้วยอีเมล) และ **Reset Password** (ลืมรหัสผ่าน) — ที่เหลือใส่ไว้ให้ครบธีม
- ตัวแปร `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}` ต้องคงไว้ตามเดิม Supabase จะแทนค่าให้ตอนส่ง
- โลโก้โหลดจาก https://www.raventawellness.com/images/logo-full.png
- ธีมเดียวกับ lib/email-templates.ts (อีเมลที่ส่งผ่าน Resend) ถ้าแก้สีให้แก้ทั้งสองที่
