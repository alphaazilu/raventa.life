// Plain inline-styled HTML — transactional emails get stripped of <style>
// blocks and external CSS by most clients (Gmail included), so every rule
// that matters is written directly on the element.

const COLORS = {
  primary: '#8b1e2d', // RAVENTA RED
  primaryForeground: '#f6f1e7',
  accent: '#2e4636', // FOREST
  sand: '#e7dcc7',
  wood: '#b98c5e',
  text: '#2b2620',
  muted: '#6b6255',
}

function wrapper(bodyHtml: string): string {
  return `
  <div style="background-color:${COLORS.sand};padding:32px 16px;font-family:Georgia,'Noto Serif Thai',serif;">
    <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5ddcc;">
      <div style="background-color:${COLORS.primary};padding:24px 32px;">
        <span style="color:${COLORS.primaryForeground};font-size:20px;font-weight:700;letter-spacing:0.08em;">RAVENTA</span>
      </div>
      <div style="padding:32px;">
        ${bodyHtml}
      </div>
      <div style="padding:20px 32px;background-color:${COLORS.sand};text-align:center;">
        <p style="margin:0;font-size:12px;color:${COLORS.muted};">RAVENTA Wellness Center</p>
      </div>
    </div>
  </div>`
}

export function welcomeEmail(firstName: string | null): { subject: string; html: string } {
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'
  const greeting = firstName ? `สวัสดีคุณ${firstName}` : 'สวัสดีครับ/ค่ะ'
  const html = wrapper(`
    <h1 style="margin:0 0 16px;font-size:22px;color:${COLORS.text};">ยินดีต้อนรับสู่ RAVENTA</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">${greeting},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">
      ขอบคุณที่สมัครสมาชิกกับ RAVENTA Wellness Center บัญชีของคุณพร้อมใช้งานแล้ว
      ตอนนี้คุณสามารถเข้าสู่ระบบเพื่อจัดการข้อมูลส่วนตัวและติดตามข่าวสารจากเราได้เลย
    </p>
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
    </table>
  `)
  return { subject: `สมาชิกใหม่: ${fullName}`, html }
}
