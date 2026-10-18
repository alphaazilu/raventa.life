-- RAVENTA — ล้างข้อมูลรายการ (เก็บข้อมูลสมาชิกและการตั้งค่าไว้)
-- รันใน Supabase › SQL Editor ทีเดียวทั้งไฟล์ · สำรองข้อมูลก่อนเสมอ (Database › Backups)
--
-- ลบ: บิล/รายการขาย · ค่าคอมที่คิดแล้ว · การเช็คอิน · แพ็กเกจที่ลูกค้าซื้อ (และการแชร์)
--     · การจอง · เปิด/ปิดกะเงินสด · ความเห็นลูกค้า · การสแกนเช็กลิสต์
-- เก็บ: สมาชิก (profiles, บัญชี, รูป, LINE) · พนักงาน/สิทธิ์ · สินค้า ราคา โปรโมชั่น
--     · ตั้งค่าการจอง · ตั้งค่าค่าคอม · รหัสแนะนำ + ผู้แนะนำของสมาชิก · ปฏิทิน · แท็บเล็ต
--     · ตารางกะ · ค่าจ้าง · เช็กลิสต์ (จุดและรอบ)

begin;

-- ความเห็นลูกค้า (ผูกกับการเช็คอิน)
delete from public.feedback;

-- การจอง
delete from public.booking_pardons;
update public.bookings set moved_to = null where moved_to is not null;
delete from public.bookings;

-- ค่าคอมที่คิดแล้ว
delete from public.sale_commissions;

-- การแชร์แพ็กเกจ
delete from public.package_share_events;
delete from public.package_share_invites;
delete from public.package_shares;

-- ผู้แนะนำ: เก็บไว้ แต่ล้าง "จ่ายค่าแนะนำแล้ว" → นับบิลแรกใหม่
update public.member_referrals set paid_sale_id = null where paid_sale_id is not null;

-- บันทึกการกระทำ: เก็บไว้ แค่ตัดการอ้างถึงการเช็คอินที่จะถูกลบ
update public.staff_actions set visit_id = null where visit_id is not null;

-- บิล → เช็คอิน → แพ็กเกจที่ซื้อ → บิล (ตามลำดับที่อ้างถึงกัน)
delete from public.sale_lines;
delete from public.visits;
update public.member_packages set shared_from = null where shared_from is not null;
delete from public.member_packages;
delete from public.sales;

-- เปิด/ปิดกะเงินสด · การสแกนเช็กลิสต์
delete from public.cash_sessions;
delete from public.checklist_scans;

-- เลขใบเสร็จเริ่มที่ 1 ใหม่
alter table public.sales alter column receipt_no restart with 1;

-- ---- ไม่บังคับ: ลบเครื่องหมาย -- หน้าบรรทัดที่ต้องการ ----
-- ลงเวลาเข้า-ออกงานของพนักงาน
-- delete from public.time_entry_edits;
-- delete from public.time_entries;
-- คำขอลางาน
-- delete from public.leave_requests;
-- บันทึกการกระทำทั้งหมด (log)
-- delete from public.staff_actions;
-- สต็อกสินค้ากลับเป็น 0 (ไม่ลด/คืนให้อัตโนมัติจากการลบบิล)
-- update public.products set stock = 0;
-- update public.product_variants set stock = 0;

commit;
