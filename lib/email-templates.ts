// Plain inline-styled HTML — transactional emails get stripped of <style>
// blocks and external CSS by most clients (Gmail included), so every rule
// that matters is written directly on the element.

import { BRAND } from '@/lib/brand/config'
import type { BrandInfo } from '@/lib/brand/info'
import { getBrandInfo } from '@/lib/brand/settings'

// Name, logo, contact email and button colours come from the brand settings
// (getBrandInfo — falls back to lib/brand/config.ts, i.e. the old values).
// SERVER ONLY. Each template reads it and shadows COLORS with the brand's.

const BASE_COLORS = {
  primary: BRAND.colors.primary, // RAVENTA RED
  primaryForeground: BRAND.colors.primaryForeground,
  accent: '#2e4636', // FOREST
  sand: '#e7dcc7',
  sage: '#eef4ec', // light green boxes (site theme v0.11.1)
  line: '#d7dfd6', // sage outline
  wood: '#b98c5e',
  text: '#2b2620',
  muted: '#6b6255',
}
type Colors = Record<keyof typeof BASE_COLORS, string>

const colorsFor = (brand: BrandInfo): Colors => ({ ...BASE_COLORS, primary: brand.color, primaryForeground: brand.fgColor })

// White throughout, like the site: the full RAVENTA logo on top (served
// from the live site — email clients need an absolute URL), a thin sage
// outline around the card, sage boxes for codes and numbers.
function wrapper(brand: BrandInfo, COLORS: Colors, bodyHtml: string): string {
  const siteUrl = process.env.SITE_URL ?? BRAND.siteUrl
  // A built-in logo is a path on the site; an uploaded one is already a full URL.
  const logo = brand.logoUrl.startsWith('/') ? `${siteUrl}${brand.logoUrl}` : brand.logoUrl
  return `
  <div style="background-color:#ffffff;padding:32px 16px;font-family:'Noto Sans Thai','Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${COLORS.line};">
      <div style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid ${COLORS.line};">
        <img src="${logo}" width="132" height="70" alt="${brand.name}" style="display:inline-block;width:132px;height:auto;border:0;">
      </div>
      <div style="padding:32px;">
        ${bodyHtml}
      </div>
      <div style="padding:18px 32px;border-top:1px solid ${COLORS.line};text-align:center;">
        <p style="margin:0;font-size:12px;color:${COLORS.muted};">${brand.fullName}</p>
      </div>
    </div>
  </div>`
}

export async function welcomeEmail(
  firstName: string | null,
  memberNo: string | null,
): Promise<{ subject: string; html: string }> {
  const brand = await getBrandInfo()
  const COLORS = colorsFor(brand)
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'
  const greeting = firstName ? `สวัสดีคุณ${firstName}` : 'สวัสดีครับ/ค่ะ'
  const memberNoBlock = memberNo
    ? `
    <p style="margin:0 0 20px;padding:14px 18px;background-color:${COLORS.sage};border:1px solid ${COLORS.line};border-radius:10px;text-align:center;">
      <span style="display:block;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.muted};">หมายเลขสมาชิก</span>
      <span style="display:block;margin-top:4px;font-size:20px;font-weight:700;letter-spacing:0.06em;color:${COLORS.primary};">${memberNo}</span>
    </p>`
    : ''
  const html = wrapper(brand, COLORS, `
    <h1 style="margin:0 0 16px;font-size:22px;color:${COLORS.text};">ยินดีต้อนรับสู่ ${brand.name}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">${greeting},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">
      ขอบคุณที่สมัครสมาชิกกับ ${brand.fullName} บัญชีของคุณพร้อมใช้งานแล้ว
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
      หากมีข้อสงสัยใดๆ ติดต่อเราได้ที่ ${brand.email}
    </p>
  `)
  return { subject: `ยินดีต้อนรับสู่ ${brand.name}`, html }
}

export async function teamNotificationEmail(details: {
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  province: string | null
  nationality: string | null
}): Promise<{ subject: string; html: string }> {
  const brand = await getBrandInfo()
  const COLORS = colorsFor(brand)
  const fullName = [details.firstName, details.lastName].filter(Boolean).join(' ') || '(ยังไม่ระบุชื่อ)'
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${COLORS.muted};width:120px;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:${COLORS.text};">${value}</td>
    </tr>`
  const html = wrapper(brand, COLORS, `
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
export async function mergeCodeEmail(code: string): Promise<{ subject: string; html: string }> {
  const brand = await getBrandInfo()
  const COLORS = colorsFor(brand)
  const html = wrapper(brand, COLORS, `
    <h1 style="margin:0 0 16px;font-size:20px;color:${COLORS.text};">รหัสยืนยันการเชื่อมบัญชี LINE</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">
      มีคำขอเชื่อมบัญชี LINE เข้ากับบัญชีสมาชิก ${brand.name} ของอีเมลนี้ กรอกรหัสด้านล่างในหน้าเว็บเพื่อยืนยัน
    </p>
    <p style="margin:20px 0;padding:16px;background-color:${COLORS.sage};border:1px solid ${COLORS.line};border-radius:10px;text-align:center;">
      <span style="display:block;font-size:30px;font-weight:700;letter-spacing:0.3em;color:${COLORS.primary};">${code}</span>
      <span style="display:block;margin-top:6px;font-size:12px;color:${COLORS.muted};">รหัสนี้ใช้ได้ 10 นาที</span>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:${COLORS.muted};">
      หากคุณไม่ได้ขอเชื่อมบัญชี ไม่ต้องทำอะไร บัญชีของคุณจะไม่มีการเปลี่ยนแปลง
    </p>
  `)
  return { subject: `${code} คือรหัสยืนยันการเชื่อมบัญชี LINE กับ ${brand.name}`, html }
}

// Sent when a member confirms an email address for their account (a LINE
// sign-up on /complete-profile, or "set up email login" in settings — see
// lib/email-verification.ts). Entering the code proves the address is
// theirs; it then becomes the account's login email.
export async function emailVerificationCodeEmail(code: string): Promise<{ subject: string; html: string }> {
  const brand = await getBrandInfo()
  const COLORS = colorsFor(brand)
  const html = wrapper(brand, COLORS, `
    <h1 style="margin:0 0 16px;font-size:20px;color:${COLORS.text};">ยืนยันอีเมลของคุณ</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:${COLORS.text};">
      กรอกรหัสด้านล่างในหน้าเว็บ ${brand.name} เพื่อยืนยันว่าอีเมลนี้เป็นของคุณ
    </p>
    <p style="margin:20px 0;padding:16px;background-color:${COLORS.sage};border:1px solid ${COLORS.line};border-radius:10px;text-align:center;">
      <span style="display:block;font-size:30px;font-weight:700;letter-spacing:0.3em;color:${COLORS.primary};">${code}</span>
      <span style="display:block;margin-top:6px;font-size:12px;color:${COLORS.muted};">รหัสนี้ใช้ได้ 10 นาที</span>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:${COLORS.muted};">
      หากคุณไม่ได้สมัครหรือขอยืนยันอีเมลกับ ${brand.name} ไม่ต้องทำอะไร อีเมลนี้จะไม่ถูกผูกกับบัญชีใด
    </p>
  `)
  return { subject: `${code} คือรหัสยืนยันอีเมลของคุณที่ ${brand.name}`, html }
}

// A friend shares a package (§23): link to accept it.
// A package shared by email (§23). One-visit sharing reads as a gift: a
// ticket-style voucher (table layout, so mail apps keep it together).
export async function packageShareEmail(
  ownerName: string,
  packageName: string,
  url: string,
  opts: { whole?: boolean; until?: string | null } = {},
): Promise<{ subject: string; html: string }> {
  const brand = await getBrandInfo()
  const COLORS = colorsFor(brand)
  const safe = (v: string) => v.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch] as string)
  const footer = `<p style="margin:0;font-size:12px;color:${COLORS.muted};">ลิงก์ใช้ได้ 7 วัน และใช้ได้ครั้งเดียว · ต้องเป็นสมาชิก ${brand.name} (สมัครฟรีได้จากลิงก์นี้)</p>`
  const button = (label: string) =>
    `<p style="margin:0 0 20px;text-align:center;"><a href="${url}" style="display:inline-block;background-color:${COLORS.primary};color:${COLORS.primaryForeground};padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;">${label}</a></p>`

  if (opts.whole) {
    return {
      subject: `${ownerName} แชร์แพ็กเกจ ${brand.name} ให้คุณใช้ร่วมกัน`,
      html: wrapper(brand, COLORS, `
      <h1 style="margin:0 0 12px;font-size:20px;color:${COLORS.text};">${safe(ownerName)} ชวนใช้แพ็กเกจร่วมกัน</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.text};">
        แพ็กเกจ <b>${safe(packageName)}</b> — กดรับแล้วใช้เช็คอินที่ ${brand.name} ได้เลย (ใช้จากจำนวนครั้งเดียวกับเจ้าของ)
      </p>
      ${button('รับแพ็กเกจ')}
      ${footer}
    `),
    }
  }

  const until = opts.until ? thaiDate(opts.until) : null
  return {
    subject: `${ownerName} ส่ง Day Pass ให้คุณเป็นของขวัญ 🎁`,
    html: wrapper(brand, COLORS, `
      <h1 style="margin:0 0 6px;font-size:20px;color:${COLORS.text};">${safe(ownerName)} ส่งของขวัญให้คุณ 🎁</h1>
      <p style="margin:0 0 18px;font-size:14px;color:${COLORS.muted};">Day Pass 1 ครั้ง ที่ ${brand.fullName}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border:1px solid ${COLORS.line};border-radius:16px;overflow:hidden;margin:0 0 20px;">
        <tr>
          <td style="padding:16px 18px;background:#ffffff;">
            <div style="font-size:10px;letter-spacing:3px;font-weight:600;color:${COLORS.primary};">GIFT VOUCHER</div>
            <div style="margin-top:4px;font-size:22px;font-weight:800;color:${COLORS.text};">Day Pass</div>
            <div style="margin-top:2px;font-size:14px;font-weight:600;color:${COLORS.text};">จากคุณ${safe(ownerName)}</div>
            ${until ? `<div style="margin-top:8px;font-size:12px;color:${COLORS.muted};">ใช้ได้ถึง ${until}</div>` : ''}
          </td>
          <td width="96" align="center" style="width:96px;padding:12px 8px;background:${COLORS.primary};color:${COLORS.primaryForeground};border-left:2px dashed ${COLORS.primaryForeground};">
            <div style="font-size:22px;line-height:1;">🎁</div>
            <div style="margin-top:4px;font-size:24px;font-weight:800;line-height:1;">×1</div>
            <div style="font-size:11px;">ครั้ง</div>
          </td>
        </tr>
      </table>
      ${button('รับของขวัญ')}
      <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${COLORS.text};">กดรับแล้วบัตรของขวัญจะอยู่ในบัญชีของคุณ — มาที่ ${brand.name} แล้วยื่นบัตรสมาชิกที่เคาน์เตอร์ได้เลย</p>
      ${footer}
    `),
  }
}

// "2026-11-01" → "1 พ.ย. 2569"
function thaiDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${d} ${months[m - 1]} ${y + 543}`
}

// Bookings (§34, v0.35): booked / moved / cancelled. Nothing to pay now.
export async function bookingEmail(b: {
  kind: 'booked' | 'cancelled' | 'moved'
  firstName: string | null
  what: string
  day: string
  time: string
  withWhom: string | null
  party: number
  cancelBy: string | null // "YYYY-MM-DD HH:MM"
  url: string
}): Promise<{ subject: string; html: string }> {
  const brand = await getBrandInfo()
  const COLORS = colorsFor(brand)
  const safe = (v: string) => v.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch] as string)
  const when = `${thaiDate(b.day)} · ${b.time}`
  const head =
    b.kind === 'cancelled' ? 'ยกเลิกการจองแล้ว' : b.kind === 'moved' ? 'เลื่อนนัดเรียบร้อย' : 'จองเรียบร้อยแล้ว'
  const subject = b.kind === 'cancelled' ? `ยกเลิกการจอง ${b.what} · ${when}` : b.kind === 'moved' ? `เลื่อนนัด ${b.what} → ${when}` : `ยืนยันการจอง ${b.what} · ${when}`
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 0;font-size:13px;color:${COLORS.muted};width:96px;">${k}</td><td style="padding:4px 0;font-size:14px;font-weight:600;color:${COLORS.text};">${v}</td></tr>`
  const cancelBy = b.cancelBy ? `${thaiDate(b.cancelBy.slice(0, 10))} ${b.cancelBy.slice(11)}` : null
  return {
    subject,
    html: wrapper(brand, COLORS, `
      <h1 style="margin:0 0 6px;font-size:20px;color:${COLORS.text};">${head}</h1>
      <p style="margin:0 0 18px;font-size:14px;color:${COLORS.muted};">${b.firstName ? `สวัสดีคุณ${safe(b.firstName)}` : 'สวัสดีค่ะ'}</p>
      <div style="background:${COLORS.sage};border-radius:12px;padding:14px 18px;margin:0 0 20px;${b.kind === 'cancelled' ? 'opacity:0.7;' : ''}">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          ${row('บริการ', safe(b.what))}
          ${row('วัน-เวลา', when)}
          ${b.withWhom ? row('กับ', safe(b.withWhom)) : ''}
          ${b.party > 1 ? row('จำนวน', `${b.party} คน`) : ''}
        </table>
      </div>
      ${
        b.kind === 'cancelled'
          ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${COLORS.text};">หวังว่าจะได้พบกันครั้งหน้านะคะ จองใหม่ได้ทุกเมื่อในบัญชีของคุณ</p>`
          : `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${COLORS.text};">ไม่ต้องจ่ายตอนนี้ — ชำระที่หน้าร้านตอนมา ยื่นบัตรสมาชิกที่เคาน์เตอร์ได้เลย</p>
             ${cancelBy ? `<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:${COLORS.muted};">ถ้ามาไม่ได้ ยกเลิกได้ฟรีถึง ${cancelBy} — ช่วยให้คนอื่นได้คิวนี้แทน</p>` : ''}`
      }
      <p style="margin:0 0 8px;text-align:center;"><a href="${b.url}" style="display:inline-block;background-color:${COLORS.primary};color:${COLORS.primaryForeground};padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;">${b.kind === 'cancelled' ? 'จองใหม่' : 'ดู / ยกเลิกการจอง'}</a></p>
    `),
  }
}
