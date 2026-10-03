// Plain inline-styled HTML — transactional emails get stripped of <style>
// blocks and external CSS by most clients (Gmail included), so every rule
// that matters is written directly on the element.

const COLORS = {
  primary: '#8b1e2d', // RAVENTA RED
  primaryForeground: '#f6f1e7',
  accent: '#2e4636', // FOREST
  sand: '#e7dcc7',
  sage: '#eef4ec', // light green boxes (site theme v0.11.1)
  line: '#d7dfd6', // sage outline
  wood: '#b98c5e',
  text: '#2b2620',
  muted: '#6b6255',
}

// White throughout, like the site: the full RAVENTA logo on top (served
// from the live site — email clients need an absolute URL), a thin sage
// outline around the card, sage boxes for codes and numbers.
function wrapper(bodyHtml: string): string {
  const siteUrl = process.env.SITE_URL ?? 'https://www.raventawellness.com'
  return `
  <div style="background-color:#ffffff;padding:32px 16px;font-family:'Noto Sans Thai','Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${COLORS.line};">
      <div style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid ${COLORS.line};">
        <img src="${siteUrl}/images/logo-full.png" width="132" height="70" alt="RAVENTA" style="display:inline-block;width:132px;height:auto;border:0;">
      </div>
      <div style="padding:32px;">
        ${bodyHtml}
      </div>
      <div style="padding:18px 32px;border-top:1px solid ${COLORS.line};text-align:center;">
        <p style="margin:0;font-size:12px;color:${COLORS.muted};">RAVENTA Wellness Retreat</p>
      </div>
    </div>
  </div>`
}

export function welcomeEmail(
  firstName: string | null,
  memberNo: string | null,
): { subject: string; html: string } {
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'
  const greeting = firstName ? `สวัสดีคุณ${firstName}` : 'สวัสดีครับ/ค่ะ'
  const memberNoBlock = memberNo
    ? `
    <p style="margin:0 0 20px;padding:14px 18px;background-color:${COLORS.sage};border:1px solid ${COLORS.line};border-radius:10px;text-align:center;">
      <span style="display:block;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.muted};">หมายเลขสมาชิก</span>
      <span style="display:block;margin-top:4px;font-size:20px;font-weight:700;letter-spacing:0.06em;color:${COLORS.primary};">${memberNo}</span>
    </p>`
    : ''
  const html = wrapper(`
    <h1 style="margin:0 0 16px;font-size:22px;color:${COLORS.text};">ยินดีต้อนรับสู่ RAVENTA</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">${greeting},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">
      ขอบคุณที่สมัครสมาชิกกับ RAVENTA Wellness Retreat บัญชีของคุณพร้อมใช้งานแล้ว
      ตอนนี้คุณสามารถเข้าสู่ระบบเพื่อจัดการข้อมูลส่วนตัวและติดตามข่าวสารจากเราได้เลย
    </p>
    ${memberNoBlock}
    <p style="margin:24px 0;text-align:center;">
      <a href="${siteUrl}/account"
         style="display:inline-block;background-color:${COLORS.primary};color:${COLORS.primaryForeground};text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:600;">
        ไปที่บัญชีของฉัน
      </a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:${COLORS.muted};">
      หากมีข้อสงสัยใดๆ ติดต่อเราได้ที่ raventa.wellness@gmail.com
    </p>
  `)
  return { subject: 'ยินดีต้อนรับสู่ RAVENTA', html }
}

export function teamNotificationEmail(details: {
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  province: string | null
  nationality: string | null
}): { subject: string; html: string } {
  const fullName = [details.firstName, details.lastName].filter(Boolean).join(' ') || '(ยังไม่ระบุชื่อ)'
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${COLORS.muted};width:120px;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:${COLORS.text};">${value}</td>
    </tr>`
  const html = wrapper(`
    <h1 style="margin:0 0 16px;font-size:20px;color:${COLORS.text};">มีสมาชิกใหม่สมัครเข้าระบบ</h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      ${row('ชื่อ', fullName)}
      ${row('อีเมล', details.email)}
      ${row('เบอร์โทรศัพท์', details.phone ?? '(ยังไม่ระบุ)')}
      ${row('จังหวัด', details.province ?? '(ยังไม่ระบุ)')}
      ${row('สัญชาติ', details.nationality ?? '(ยังไม่ระบุ)')}
    </table>
  `)
  return { subject: `สมาชิกใหม่: ${fullName}`, html }
}

// Sent when someone signed in with LINE says an existing membership is
// theirs (app/complete-profile/merge-actions.ts). Going to that
// membership's own email address is what proves it's really them.
export function mergeCodeEmail(code: string): { subject: string; html: string } {
  const html = wrapper(`
    <h1 style="margin:0 0 16px;font-size:20px;color:${COLORS.text};">รหัสยืนยันการเชื่อมบัญชี LINE</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">
      มีคำขอเชื่อมบัญชี LINE เข้ากับบัญชีสมาชิก RAVENTA ของอีเมลนี้ กรอกรหัสด้านล่างในหน้าเว็บเพื่อยืนยัน
    </p>
    <p style="margin:20px 0;padding:16px;background-color:${COLORS.sage};border:1px solid ${COLORS.line};border-radius:10px;text-align:center;">
      <span style="display:block;font-size:30px;font-weight:700;letter-spacing:0.3em;color:${COLORS.primary};">${code}</span>
      <span style="display:block;margin-top:6px;font-size:12px;color:${COLORS.muted};">รหัสนี้ใช้ได้ 10 นาที</span>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:${COLORS.muted};">
      หากคุณไม่ได้ขอเชื่อมบัญชี ไม่ต้องทำอะไร บัญชีของคุณจะไม่มีการเปลี่ยนแปลง
    </p>
  `)
  return { subject: `${code} คือรหัสยืนยันการเชื่อมบัญชี LINE กับ RAVENTA`, html }
}

// Sent when a member confirms an email address for their account (a LINE
// sign-up on /complete-profile, or "set up email login" in settings — see
// lib/email-verification.ts). Entering the code proves the address is
// theirs; it then becomes the account's login email.
export function emailVerificationCodeEmail(code: string): { subject: string; html: string } {
  const html = wrapper(`
    <h1 style="margin:0 0 16px;font-size:20px;color:${COLORS.text};">ยืนยันอีเมลของคุณ</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">
      กรอกรหัสด้านล่างในหน้าเว็บ RAVENTA เพื่อยืนยันว่าอีเมลนี้เป็นของคุณ
    </p>
    <p style="margin:20px 0;padding:16px;background-color:${COLORS.sage};border:1px solid ${COLORS.line};border-radius:10px;text-align:center;">
      <span style="display:block;font-size:30px;font-weight:700;letter-spacing:0.3em;color:${COLORS.primary};">${code}</span>
      <span style="display:block;margin-top:6px;font-size:12px;color:${COLORS.muted};">รหัสนี้ใช้ได้ 10 นาที</span>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:${COLORS.muted};">
      หากคุณไม่ได้สมัครหรือขอยืนยันอีเมลกับ RAVENTA ไม่ต้องทำอะไร อีเมลนี้จะไม่ถูกผูกกับบัญชีใด
    </p>
  `)
  return { subject: `${code} คือรหัสยืนยันอีเมลของคุณที่ RAVENTA`, html }
}

// A friend shares a package (§23): link to accept it.
export function packageShareEmail(ownerName: string, packageName: string, url: string, whole = false): { subject: string; html: string } {
  const safe = (v: string) => v.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch] as string)
  return {
    subject: whole ? `${ownerName} แชร์แพ็กเกจ RAVENTA ให้คุณใช้ร่วมกัน` : `${ownerName} แบ่งแพ็กเกจ RAVENTA ให้คุณ 1 ครั้ง`,
    html: wrapper(`
      <h1 style="margin:0 0 12px;font-size:20px;color:${COLORS.text};">${safe(ownerName)} ${whole ? 'แชร์แพ็กเกจให้คุณใช้ร่วมกัน' : 'แบ่งแพ็กเกจให้คุณ 1 ครั้ง'}</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.text};">
        แพ็กเกจ <b>${safe(packageName)}</b> — ${whole ? 'กดรับแล้วใช้เช็คอินที่ RAVENTA ได้เลย (ใช้จากจำนวนครั้งเดียวกับเจ้าของ)' : 'กดรับแล้วใช้เช็คอินที่ RAVENTA ได้ 1 ครั้ง'}
      </p>
      <p style="margin:0 0 20px;text-align:center;">
        <a href="${url}" style="display:inline-block;background-color:${COLORS.primary};color:${COLORS.primaryForeground};padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;">${whole ? 'รับแพ็กเกจ' : 'รับ 1 ครั้ง'}</a>
      </p>
      <p style="margin:0;font-size:12px;color:${COLORS.muted};">ลิงก์ใช้ได้ 7 วัน และใช้ได้ครั้งเดียว · ต้องเป็นสมาชิก RAVENTA (สมัครฟรีได้จากลิงก์นี้)</p>
    `),
  }
}
