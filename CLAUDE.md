# CLAUDE.md — RAVENTA Wellness Back Office

ไฟล์นี้บอกบริบท + กฎการทำงานให้ Claude Code ทุก session (local / cloud) อ่านก่อนเริ่มงาน
**สำคัญ:** อ่านไฟล์นี้ให้จบก่อนลงมือทุกครั้ง

---

## 0. กฎประจำ (ต้องทำตามเสมอ)

1. **ตอบเป็นภาษาไทย** ทุกครั้ง (โค้ด/คอมเมนต์เป็นอังกฤษได้)
2. **ห้ามแตะ Supabase โดยตรง** — ผู้ใช้ **commit / push / รัน SQL เอง** ทั้งหมด · Claude ส่งแค่โค้ด+ไฟล์ ไม่ deploy เอง
3. **ห้ามเปลี่ยนสีแบรนด์ `#8D1821`**
4. **โหมด comment:** ถ้าผู้ใช้รายงานปัญหา/ถาม (ไม่ใช่สั่ง "ทำ" ตรงๆ) → **สำรวจ → เสนอ → รอคำว่า "ทำ"** ก่อนลงมือ · การตอบเลือก option ถือเป็นการยืนยัน
5. **ห้ามใส่ secret/คีย์** ลงใน chat หรือ commit
6. **`supabase/schema.sql` = ไฟล์เดียว idempotent** — รันซ้ำได้เสมอ (ใช้ `create ... if not exists`, `drop ... if exists`, `create or replace function`) · section ใหม่ต่อท้าย (ปัจจุบันถึง §52+)

---

## 1. โปรเจกต์

- **RAVENTA Wellness Back Office** — ระบบหลังบ้านสปา/wellness retreat (UI ไทย, สลับ TH/EN)
- **Stack:** Next.js 16 (app router, server actions) · Supabase (Postgres + RLS + security-definer functions + service-role admin client) · Vercel (Hobby) · Cloudflare (DNS/R2)
- โครงเดียวมีทั้ง **เว็บสาธารณะ (ลูกค้า)** และ **Back Office console (พนักงาน/แอดมิน)**
- Repo: `alphaazilu/raventa.life` · branch `main`
- เวอร์ชันแสดงมุมซ้ายล่าง (มาจาก `package.json`)

---

## 2. ขั้นตอนส่งงาน (ทุกครั้ง)

1. `npx tsc --noEmit` ให้ผ่าน
2. `npx next build` ให้ผ่าน (ถ้าเจอ type error ค้าง ลบ `.next/dev .next/types` ก่อน)
3. **bump version** ใน `package.json` (ยกเว้นไฟล์ meta เช่น CLAUDE.md)
4. ให้ commit message แยก **2 บล็อก**:
   - **Summary** (1 บรรทัด) — ขึ้นต้น `⚠️ SQL ...` ถ้ามี SQL ใหม่ / `ไม่มี SQL ใหม่` ถ้าไม่มี
   - **Description** (หลายบรรทัด) — บรรทัดแรก `⚠️ ต้องรัน supabase/schema.sql ...` หรือ `ไม่มี SQL ใหม่` แล้วรายละเอียด
   - ปิดท้ายด้วย trailer:
     ```
     Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
     Claude-Session: <session url ของ session ปัจจุบัน>
     ```
5. **อัปเดต vault** (ถ้าเข้าถึงได้): spec `20 - Software Spec.md` (บรรทัด version) + roadmap `25 Roadmap & Releases/Roadmap และประวัติเวอร์ชัน.md` (เพิ่มแถวเวอร์ชันใหม่)
   - **Cloud session แตะ vault (Obsidian) ไม่ได้** → ให้ output ข้อความ spec/roadmap ในคำตอบ หรือเป็นไฟล์ `docs/` ใน PR ให้ผู้ใช้ก๊อปวางเอง

---

## 3. ทดสอบ SQL (pgtest)

สำหรับทุกการเปลี่ยน `schema.sql` ให้ทดสอบว่ารันได้ + idempotent:

- binaries: `/usr/lib/postgresql/16/bin` · รันเป็น user `postgres` (`su postgres -c '...'`) · socket `/tmp` · port เช่น 5499
- stub ขั้นต่ำ: สร้าง role `anon`/`authenticated`, schema `auth` + `auth.users` + `auth.uid()` (อ่าน `current_setting('test.uid')`), stub `public.is_staff()`
- รัน schema (หรือ section ที่แก้) **2 รอบ** ยืนยัน idempotent + ทดสอบ behavior (เช่น anon RPC, RLS staff/non-staff)
- ⚠️ หมายเหตุ: dev-mode ใน sandbox บล็อก React hydration → **preview กดปุ่ม/drag ไม่ทำงาน** (SSR อย่างเดียว) · ทดสอบ logic ด้วย `tsx` ตรงๆ หรือให้ผู้ใช้ส่ง screenshot ยืนยัน

---

## 4. สถาปัตยกรรมสำคัญ

- **schema.sql** แบ่งเป็น section §1…§52+ ต่อท้ายเรื่อยๆ ทุกอันต้อง idempotent
- **Tolerant column pattern:** select คอลัมน์ครบสุด · ถ้า error `42703` retry แบบไม่มีคอลัมน์นั้น · เขียนคอลัมน์ optional ผ่าน update แยก ignore `42703`/`PGRST204`
- **Roles:** `customer / staff / admin / accountant` (accountant = เข้าได้แค่หน้ารายงาน) · gate หลายชั้น: `lib/supabase/middleware.ts` (proxy) → `app/console/layout.tsx` → แต่ละ page · helper ใน `lib/auth/roles.ts` (`isAdmin`, `canUseDesk`, `canViewReports`, `canUseConsole`, `consoleHome`) · `is_staff()` = staff|admin
- **หลายสาขา:** ตาราง `branches` (parent_id/kind=group/branch) · `branch_id` บน devices/sales/visits/cash_sessions · ราคา/สต็อกรายสาขา
- **แพ็กเกจ:** `member_packages` (visits_total, visits_used, valid_days, starts_on, expires_on) · `products.pkg_days` · Day Pass รองรับหลายตัว (entries, §41, `p_entry`) · ฟังก์ชันราคาใช้ `order by … limit 1`
- **Wellness Quiz:** `/quiz` · `lib/wellness-quiz/` (match.ts, journeys.ts, copy.ts, types.ts) · เวลาอิงหลักฐาน contrast therapy (ดู vault `M01b`) · `quiz_leads` (§52) เก็บ lead
- **Copy/i18n:** `lib/console/copy.ts` (consoleCopy/catalogCopy/settingsCopy) · `lib/check-in/copy.ts` (deskCopy) · `lib/wellness-quiz/copy.ts` · `lib/auth/copy.ts` · `lib/i18n.ts` (zones/benefits)

---

## 5. หลัก UI

- **"ไม่ล้นจอ = อยู่กับที่, ล้น = scroll ในกรอบแต่หัวคงอยู่"** (sticky header) · 2 คอลัมน์: ฝั่งสั้นปักไว้ ฝั่งยาวเลื่อน
- มือถือต้องใช้ได้ (responsive) · มี dark mode

---

## 6. backlog / งานค้าง

ดู roadmap ใน vault (`25 Roadmap & Releases`) · ที่ค้าง ณ ปัจจุบัน: Wellness Quiz เฟส 3 (UX) · หน้า Back Office ดู quiz leads · sticky-header sweep (ลูกค้า/จอง/รายงาน/ทีมงาน) · หลายสาขาขั้นต่อ · Waiver/PDPA/สิทธิ์ผู้ใช้ (M17–M19)
