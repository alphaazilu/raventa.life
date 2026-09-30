// Back Office console (/console). Staff- and admin-facing: short and direct.
export const consoleCopy = {
  backOffice: { th: 'Back Office', en: 'Back Office' },
  backToSite: { th: 'กลับหน้าเว็บ', en: 'Back to site' },
  soon: { th: 'เร็วๆ นี้', en: 'Soon' },
  roleAdmin: { th: 'แอดมิน', en: 'Admin' },
  roleStaff: { th: 'พนักงาน', en: 'Staff' },

  // tabs
  tabOverview: { th: 'ภาพรวม', en: 'Overview' },
  tabDesk: { th: 'ขาย + เช็คอิน', en: 'Sell + check-in' },
  tabTime: { th: 'ลงเวลา', en: 'Time clock' },
  tabMembers: { th: 'ลูกค้า', en: 'Members' },
  tabReports: { th: 'รายงาน', en: 'Reports' },

  // dashboard
  hello: { th: 'สวัสดี คุณ', en: 'Hello, ' },
  helloFallback: { th: 'สวัสดี', en: 'Hello' },
  inStoreNow: { th: 'คนในร้านตอนนี้', en: 'In the spa now' },
  seatsLeft: { th: 'ว่างอีก', en: 'Free' },
  seatsUnit: { th: 'ที่', en: 'spots' },
  checkInsToday: { th: 'เช็คอินวันนี้', en: 'Check-ins today' },
  paidCount: { th: 'จ่ายเงิน', en: 'paid' },
  freeCount: { th: 'ใช้สิทธิ์', en: 'free' },
  takingsToday: { th: 'รับเงินวันนี้', en: 'Taken today' },
  cash: { th: 'เงินสด', en: 'Cash' },
  transfer: { th: 'โอน', en: 'Transfer' },
  card: { th: 'บัตร', en: 'Card' },
  newMembersToday: { th: 'สมาชิกใหม่วันนี้', en: 'New members today' },
  membersTotal: { th: 'รวม', en: 'Total' },
  people: { th: 'คน', en: '' },
  baht: { th: '฿', en: '฿' },

  modDeskTitle: { th: 'ขาย + เช็คอิน', en: 'Sell + check-in' },
  modDeskDesc: { th: 'สแกน QR ลูกค้า รับเงิน ดูคนในร้าน', en: 'Scan members, take payment, see who’s in' },
  modDeskMeta: { th: 'คนอยู่ในร้าน', en: 'in the spa' },
  modTimeTitle: { th: 'ลงเวลาทำงาน', en: 'Time clock' },
  modTimeDesc: { th: 'เข้า-ออกงาน กะ และแก้เวลาของทีม', en: 'Clock in/out, shifts, fix the team’s times' },
  modMembersTitle: { th: 'ข้อมูลลูกค้า', en: 'Members' },
  modMembersDesc: { th: 'ค้นหาและแก้ไขข้อมูลสมาชิก', en: 'Find and edit members' },
  modMembersMeta: { th: 'สมาชิก', en: 'members' },
  modReportsTitle: { th: 'รายงาน', en: 'Reports' },
  modReportsDesc: { th: 'ยอดขาย การเข้าใช้ ลงเวลา · CSV', en: 'Sales, visits, hours · CSV' },

  hourlyHeading: { th: 'เช็คอินรายชั่วโมง', en: 'Check-ins by hour' },
  recentHeading: { th: 'เช็คอินล่าสุด', en: 'Latest check-ins' },
  seeAll: { th: 'ดูทั้งหมด', en: 'See all' },
  nobodyYet: { th: 'ยังไม่มีการเช็คอินวันนี้', en: 'No check-ins yet today' },
  inside: { th: 'ในร้าน', en: 'Inside' },
  left: { th: 'ออกแล้ว', en: 'Left' },
  free: { th: 'ใช้สิทธิ์ฟรี', en: 'Free' },
  notSetUp: {
    th: 'ยังดึงข้อมูลวันนี้ไม่ได้ — ตรวจว่ารัน supabase/schema.sql ล่าสุดแล้ว',
    en: 'Couldn’t load today’s data — make sure the latest supabase/schema.sql has been run',
  },

  membersHeading: { th: 'ข้อมูลลูกค้า', en: 'Members' },
} as const
