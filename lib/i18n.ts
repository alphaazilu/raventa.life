export type Lang = 'th' | 'en'

export type Zone = {
  id: string
  image: string
  category: { th: string; en: string }
  meta: string
  name: { th: string; en: string }
  nameEn: string
  desc: { th: string; en: string }
}

export const zones: Zone[] = [
  {
    id: 'warm-roots',
    image: '/images/warm-roots.jpg',
    category: { th: 'บ่อน้ำร้อน', en: 'Hot Pool' },
    meta: '38°C',
    name: { th: 'รากแห่งความอบอุ่น', en: 'Warm Roots' },
    nameEn: 'WARM ROOTS',
    desc: {
      th: 'บ่อน้ำอุ่นที่โอบอุ้มร่างกาย ปล่อยความเหนื่อยล้า และเตรียมความพร้อมสำหรับการฟื้นฟู',
      en: 'A warm pool that cradles the body, releasing fatigue and preparing you to recover.',
    },
  },
  {
    id: 'heartwood',
    image: '/images/heartwood.jpg',
    category: { th: 'บ่อน้ำร้อน', en: 'Hot Pool' },
    meta: '40°C',
    name: { th: 'แก่นแห่งพลัง', en: 'Heartwood' },
    nameEn: 'HEARTWOOD',
    desc: {
      th: 'ความร้อนที่เดินทางสู่แก่นกลาง ปลุกความแข็งแรงและพลังชีวิตภายในตัวคุณ',
      en: 'Deep heat that travels to your core, awakening strength and vitality within.',
    },
  },
  {
    id: 'living-sap',
    image: '/images/living-sap.jpg',
    category: { th: 'บ่อแช่เย็น', en: 'Cold Plunge' },
    meta: '10°C',
    name: { th: 'สายน้ำแห่งชีวิต', en: 'Living Sap' },
    nameEn: 'LIVING SAP',
    desc: {
      th: 'ความเย็นที่ปลุกให้กลับมาสดชื่น ตื่นตัว และมีชีวิตชีวาอีกครั้ง',
      en: 'A cool current that revives you — fresh, alert, and fully alive again.',
    },
  },
  {
    id: 'winter-ring',
    image: '/images/winter-ring.jpg',
    category: { th: 'บ่อแช่เย็น', en: 'Cold Plunge' },
    meta: '5°C',
    name: { th: 'วงปีแห่งฤดูหนาว', en: 'Winter Ring' },
    nameEn: 'WINTER RING',
    desc: {
      th: 'ช่วงเวลาแห่งการฝึกความนิ่ง ก้าวข้ามขีดจำกัด และค้นพบความแข็งแกร่งภายใน',
      en: 'A moment to train stillness, cross your limits, and discover inner strength.',
    },
  },
  {
    id: 'sunlight',
    image: '/images/sunlight.jpg',
    category: { th: 'ซาวน่า', en: 'Sauna' },
    meta: '80°C',
    name: { th: 'แสงแห่งการเติบโต', en: 'Sunlight' },
    nameEn: 'SUNLIGHT',
    desc: {
      th: 'ความร้อนแห้งของซาวน่าที่ให้คุณหยุดพักจากโลกภายนอก และเติมพลังให้ตัวเอง',
      en: 'The dry heat of the sauna lets you pause from the outside world and recharge.',
    },
  },
  {
    id: 'forest-mist',
    image: '/images/forest-mist.jpg',
    category: { th: 'ห้องสตีม', en: 'Steam Room' },
    meta: '45°C',
    name: { th: 'สายหมอกแห่งพงไพร', en: 'Forest Mist' },
    nameEn: 'FOREST MIST',
    desc: {
      th: 'ห้องสตีมดุจอ้อมกอดของสายหมอก ชวนให้หายใจลึก ผ่อนคลาย และกลับมาอยู่กับตัวเอง',
      en: 'A steam room like the embrace of morning mist — breathe deep and let go.',
    },
  },
  {
    id: 'golden-leaf',
    image: '/images/golden-leaf.jpg',
    category: { th: 'อาบแดด', en: 'Sun Bath' },
    meta: 'Outdoor',
    name: { th: 'ใบไม้รับแสง', en: 'Golden Leaf' },
    nameEn: 'GOLDEN LEAF',
    desc: {
      th: 'พื้นที่อาบแดดรับความอบอุ่นจากธรรมชาติ ปล่อยกายและใจให้ช้าลง',
      en: 'A sunbathing space to soak in natural warmth and let body and mind slow down.',
    },
  },
  {
    id: 'the-canopy',
    image: '/images/the-canopy.jpg',
    category: { th: 'คาเฟ่ & พักผ่อน', en: 'Café & Rest' },
    meta: 'Rest',
    name: { th: 'เรือนยอดแห่งการพักพิง', en: 'The Canopy' },
    nameEn: 'THE CANOPY',
    desc: {
      th: 'มุมคาเฟ่ใต้ร่มเงาไม้ สำหรับเติมน้ำ เติมพลัง และให้เวลากับตัวเอง',
      en: 'A café nook under the canopy to rehydrate, refuel, and give yourself time.',
    },
  },
]

export type BenefitKey = 'circulation' | 'recovery' | 'stress' | 'immunity' | 'sleep' | 'clarity'

export const benefits: { id: BenefitKey; title: { th: string; en: string }; desc: { th: string; en: string } }[] = [
  {
    id: 'circulation',
    title: { th: 'ระบบไหลเวียนโลหิต', en: 'Circulation' },
    desc: {
      th: 'การสลับร้อน–เย็นช่วยกระตุ้นหลอดเลือดให้ขยายและหดตัว เพิ่มการไหลเวียนของเลือด',
      en: 'Hot–cold cycling trains blood vessels to expand and contract, boosting circulation.',
    },
  },
  {
    id: 'recovery',
    title: { th: 'ฟื้นฟูกล้ามเนื้อ', en: 'Muscle Recovery' },
    desc: {
      th: 'เร่งการฟื้นตัวและลดการอักเสบของกล้ามเนื้อหลังออกกำลังกาย',
      en: 'Speeds up recovery and reduces muscle inflammation after training.',
    },
  },
  {
    id: 'stress',
    title: { th: 'ลดความเครียด', en: 'Stress Relief' },
    desc: {
      th: 'ผ่อนคลายระบบประสาทและช่วยลดระดับฮอร์โมนความเครียด',
      en: 'Calms the nervous system and helps lower stress hormones.',
    },
  },
  {
    id: 'immunity',
    title: { th: 'เสริมภูมิคุ้มกัน', en: 'Immunity' },
    desc: {
      th: 'กระตุ้นภูมิคุ้มกันตามธรรมชาติ ให้ร่างกายแข็งแรงขึ้น',
      en: "Stimulates the body's natural defenses for greater resilience.",
    },
  },
  {
    id: 'sleep',
    title: { th: 'การนอนหลับ', en: 'Better Sleep' },
    desc: {
      th: 'ช่วยให้ร่างกายผ่อนคลาย หลับลึก และพักผ่อนได้เต็มที่',
      en: 'Relaxes the body for deeper, more restful sleep.',
    },
  },
  {
    id: 'clarity',
    title: { th: 'จิตใจแจ่มใส', en: 'Mental Clarity' },
    desc: {
      th: 'เพิ่มความตื่นตัว สมาธิ และความสดชื่นของจิตใจ',
      en: 'Improves alertness, focus, and a refreshed state of mind.',
    },
  },
]

export const t = {
  nav: {
    about: { th: 'เกี่ยวกับเรา', en: 'About' },
    zones: { th: 'โซนบำบัด', en: 'Zones' },
    benefits: { th: 'ประโยชน์', en: 'Benefits' },
    quiz: { th: 'หาเส้นทางของคุณ', en: 'Find My Journey' },
    contact: { th: 'ติดต่อ', en: 'Contact' },
    book: { th: 'จองคิว', en: 'Book Now' },
    login: { th: 'เข้าสู่ระบบ', en: 'Log In' },
    account: { th: 'บัญชีของฉัน', en: 'My Account' },
  },
  hero: {
    eyebrow: { th: 'ราเวนต้า เวลเนส เซ็นเตอร์ · ระยอง', en: 'Raventa Wellness Center · Rayong' },
    title: { th: 'ฟื้นฟู · ปรับสมดุล · คืนชีวิต', en: 'Recover · Rebalance · Revive' },
    subtitle: {
      th: 'การเดินทางกลับสู่ตัวคุณในเวอร์ชันที่ดีที่สุด ผ่านศาสตร์แห่งความร้อนและความเย็น',
      en: 'The journey back to your best self, through the art of heat and cold.',
    },
    tagline: { th: 'NATURE MEETS MODERN WELLNESS', en: 'NATURE MEETS MODERN WELLNESS' },
    ctaPrimary: { th: 'จองคิว', en: 'Book a Session' },
    ctaSecondary: { th: 'สำรวจโซนบำบัด', en: 'Explore the Zones' },
  },
  about: {
    eyebrow: { th: 'เกี่ยวกับราเวนต้า', en: 'About Raventa' },
    heading: { th: 'ต้นไม้แห่งชีวิต', en: 'The Tree of Life' },
    body1: {
      th: 'ที่ RAVENTA เราเปรียบร่างกายของคุณเหมือนต้นไม้หนึ่งต้น การเดินทางเริ่มจากความอบอุ่นของราก เข้าสู่ความแข็งแรงของแก่นไม้ แล้วปลุกชีวิตด้วยสายน้ำเย็น',
      en: 'At Raventa, we see your body as a living tree. The journey begins with the warmth of the roots, moves into the strength of the heartwood, then awakens with cool, flowing water.',
    },
    body2: {
      th: 'ทุกโซนจึงไม่ใช่เพียงความร้อนหรือความเย็น แต่เป็นส่วนหนึ่งของการกลับมาดูแลต้นไม้แห่งชีวิตภายในตัวคุณ เพื่อให้คุณกลับไปเป็นตัวเองในเวอร์ชันที่ดีที่สุด',
      en: 'Each zone is more than hot or cold — it is part of caring for the tree of life within you, so you can return to yourself in your very best version.',
    },
    quote: { th: 'GOOD THINGS TAKE TIME', en: 'GOOD THINGS TAKE TIME' },
    pillars: [
      { th: 'ธรรมชาติ', en: 'Nature' },
      { th: 'ความร้อน', en: 'Heat' },
      { th: 'ความเย็น', en: 'Cold' },
      { th: 'ตัวคุณที่ดีขึ้น', en: 'A Better You' },
    ],
  },
  zones: {
    eyebrow: { th: 'ประสบการณ์ร้อน–เย็น', en: 'The Contrast Journey' },
    heading: { th: 'โซนบำบัดของเรา', en: 'Our Therapy Zones' },
    intro: {
      th: 'แปดโซนที่ออกแบบให้คุณเดินทางผ่านความร้อน ความเย็น ไอน้ำ และแสงแดด อย่างสมดุล',
      en: 'Eight zones designed to guide you through heat, cold, steam, and sunlight in perfect balance.',
    },
  },
  benefits: {
    eyebrow: { th: 'ทำไมต้อง Contrast Therapy', en: 'Why Contrast Therapy' },
    heading: { th: 'ประโยชน์ต่อร่างกายและจิตใจ', en: 'Benefits for Body & Mind' },
    intro: {
      th: 'การบำบัดด้วยการสลับร้อน–เย็นอย่างเป็นระบบ ส่งผลดีต่อสุขภาพอย่างรอบด้าน',
      en: 'A structured hot–cold practice delivers wide-ranging benefits for your wellbeing.',
    },
  },
  contact: {
    eyebrow: { th: 'มาเยือนเรา', en: 'Visit Us' },
    heading: { th: 'ติดต่อ & เดินทาง', en: 'Contact & Location' },
    addressLabel: { th: 'ที่ตั้ง', en: 'Location' },
    address: {
      th: 'ราเวนต้า 18 ถนนเลียบชายหาดสุชาดา ต.เนินพระ อ.เมืองระยอง จ.ระยอง 21150',
      en: 'RAVENTA, 18 Liab Chai Hat Suchada Road, Noen Phra, Mueang Rayong, Rayong 21150, Thailand',
    },
    hoursLabel: { th: 'เวลาทำการ', en: 'Opening Hours' },
    hours: { th: 'ทุกวัน 09:00 – 21:00 น.', en: 'Daily 9:00 AM – 9:00 PM' },
    phoneLabel: { th: 'โทรศัพท์', en: 'Phone' },
    emailLabel: { th: 'อีเมล', en: 'Email' },
    cta: { th: 'จองคิวเลย', en: 'Book Your Session' },
    note: { th: 'กรุณาจองล่วงหน้าเพื่อรับประสบการณ์ที่ดีที่สุด', en: 'Advance booking is recommended for the best experience.' },
  },
  footer: {
    tagline: { th: 'NATURE MEETS MODERN WELLNESS', en: 'NATURE MEETS MODERN WELLNESS' },
    rights: { th: 'สงวนลิขสิทธิ์', en: 'All rights reserved.' },
    return: { th: 'Return to Your Best Self.', en: 'Return to Your Best Self.' },
  },
} as const
