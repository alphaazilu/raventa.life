import type { Goal } from './types'

type Bilingual = { th: string; en: string }

export const goalEmoji: Record<Goal, string> = {
  circulation: '🌊',
  recovery: '💪',
  stress: '🌿',
  immunity: '🛡️',
  sleep: '🌙',
  clarity: '☀️',
}

export const timeOptions: { minutes: number; label: Bilingual }[] = [
  { minutes: 20, label: { th: '20 นาที', en: '20 min' } },
  { minutes: 35, label: { th: '35 นาที', en: '35 min' } },
  { minutes: 50, label: { th: '50 นาที', en: '50 min' } },
  { minutes: 75, label: { th: '75 นาที', en: '75 min' } },
]

export const quizCopy = {
  title: { th: 'ค้นหาเส้นทางของคุณ', en: 'Find My Journey' },
  subtitle: {
    th: 'ตอบไม่กี่คำถาม แล้วให้เราจัดลำดับโซนที่เหมาะกับคุณที่สุดในวันนี้',
    en: 'Answer a few questions and we’ll sequence the zones that fit you best today.',
  },
  steps: {
    goal: {
      heading: { th: 'วันนี้อยากดูแลตัวเองเรื่องไหน?', en: 'What do you want to care for today?' },
      sub: { th: 'เลือกได้ 1–2 อย่าง', en: 'Pick 1–2' },
    },
    time: {
      heading: { th: 'วันนี้มีเวลาให้ตัวเองกี่นาที?', en: 'How much time do you have today?' },
      sub: { th: '', en: '' },
    },
    experience: {
      heading: { th: 'เคยทำ Contrast Therapy มาก่อนไหม?', en: 'Have you done contrast therapy before?' },
      sub: { th: '', en: '' },
      first: { th: 'เพิ่งเคยครั้งแรก', en: 'First time' },
      regular: { th: 'คุ้นเคยดีแล้ว', en: 'I’m used to it' },
    },
    activity: {
      heading: { th: 'ก่อนหน้านี้ออกกำลังกายหนักมาไหม?', en: 'Did you just finish an intense workout?' },
      sub: { th: '', en: '' },
      yes: { th: 'ใช่ เพิ่งซ้อมมา', en: 'Yes, just trained' },
      no: { th: 'ไม่ได้ออกกำลังกาย', en: 'No' },
    },
    safety: {
      heading: { th: 'มีข้อควระวังเหล่านี้ไหม?', en: 'Any of these apply to you?' },
      sub: { th: 'เลือกได้มากกว่า 1 ข้อ', en: 'Select all that apply' },
      pregnant: { th: 'กำลังตั้งครรภ์', en: 'Pregnant' },
      heart: { th: 'มีโรคหัวใจ หรือความดันโลหิตสูง', en: 'Heart condition or high blood pressure' },
      recentInjury: { th: 'มีอาการบาดเจ็บล่าสุด', en: 'A recent injury' },
      none: { th: 'ไม่มีข้อจำกัด', en: 'None of these' },
      gentleToday: { th: 'อยากได้ความอ่อนโยนเป็นพิเศษวันนี้ (เช่น ช่วงมีประจำเดือน)', en: 'I’d like extra gentleness today (e.g. during your period)' },
    },
    preferences: {
      heading: { th: 'มีโซนที่ชอบเป็นพิเศษ หรืออยากเลี่ยงไหม?', en: 'Any zone you love, or want to avoid?' },
      sub: { th: 'ข้ามได้ถ้าไม่แน่ใจ', en: 'Skip if unsure' },
      preferredLabel: { th: 'อยากให้อยู่ต้นๆ', en: 'Favorite (goes first)' },
      avoidLabel: { th: 'อยากเลี่ยง', en: 'Avoid' },
    },
  },
  nav: {
    back: { th: 'ย้อนกลับ', en: 'Back' },
    next: { th: 'ถัดไป', en: 'Next' },
    seeResult: { th: 'ดูเส้นทางของฉัน', en: 'See My Journey' },
    retake: { th: 'ทำแบบทดสอบใหม่', en: 'Retake the Quiz' },
    book: { th: 'จองคิวเลย', en: 'Book This Journey' },
  },
  result: {
    eyebrow: { th: 'เส้นทางของคุณวันนี้', en: 'Your Journey Today' },
    totalLabel: { th: 'รวมเวลาโดยประมาณ', en: 'Total time' },
    minutesShort: { th: 'นาที', en: 'min' },
    whyHeading: { th: 'ทำไมเส้นทางนี้ถึงเหมาะกับคุณ', en: 'Why this journey fits you' },
    gentleNotice: {
      th: 'จากข้อมูลที่ให้มา เราแนะนำเส้นทางที่อ่อนโยนที่สุดของเรา และแนะนำให้ปรึกษาแพทย์ก่อนทำ Contrast Therapy',
      en: 'Based on what you shared, we’re suggesting our gentlest journey, and recommend checking with a doctor before contrast therapy.',
    },
  },
}

/**
 * "Why this fits you" bullets, keyed by goal and by how the journey ends
 * (warm vs. cold). Mirrors the pattern found in the reverse-engineered
 * site — pre-written explanatory copy selected by outcome, not generated —
 * but every line here is written fresh for Raventa.
 */
export const whyItWorks: Record<Goal, Record<'warm' | 'cold', Bilingual[]>> = {
  circulation: {
    warm: [
      { th: 'ความร้อนขยายหลอดเลือด กระตุ้นให้เลือดไหลเวียนดีขึ้นทั่วร่าง', en: 'Heat dilates blood vessels, boosting circulation through the body.' },
      { th: 'จบด้วยความอบอุ่นช่วยให้ผ่อนคลายกล้ามเนื้อรอบหลอดเลือด', en: 'Ending warm relaxes the muscle around the vessels.' },
      { th: 'การสลับร้อน–เย็นฝึกหลอดเลือดให้ขยายและหดตัวได้ดีขึ้น', en: 'Hot–cold cycling trains vessels to expand and contract more efficiently.' },
    ],
    cold: [
      { th: 'ความเย็นทำให้หลอดเลือดหดตัวฉับพลัน กระตุ้นการไหลเวียนกลับ', en: 'Cold triggers rapid vasoconstriction, driving circulation back inward.' },
      { th: 'จบด้วยความเย็นทิ้งความรู้สึกกระปรี้กระเปร่าติดตัวกลับไป', en: 'Ending cold leaves you feeling brisk and alert.' },
      { th: 'การสลับร้อน–เย็นฝึกหลอดเลือดให้ขยายและหดตัวได้ดีขึ้น', en: 'Hot–cold cycling trains vessels to expand and contract more efficiently.' },
    ],
  },
  recovery: {
    warm: [
      { th: 'ความร้อนลึกช่วยคลายกล้ามเนื้อที่ตึงจากการออกกำลังกาย', en: 'Deep heat loosens muscle tightness from training.' },
      { th: 'ไอน้ำช่วยให้ข้อและเนื้อเยื่อรอบข้อเคลื่อนไหวได้ลื่นขึ้น', en: 'Steam eases movement around tired joints.' },
      { th: 'ความเย็นสั้นๆ ระหว่างทางช่วยลดการอักเสบเฉพาะจุด', en: 'Brief cold along the way helps curb localized inflammation.' },
    ],
    cold: [
      { th: 'เริ่มด้วยความเย็นช่วยลดการอักเสบก่อนกล้ามเนื้อจะเกร็งค้าง', en: 'Starting cold curbs inflammation before muscles can lock up.' },
      { th: 'ความร้อนที่ตามมาช่วยเพิ่มเลือดไปเลี้ยงกล้ามเนื้อที่ล้า', en: 'The heat that follows brings fresh blood flow to tired muscle.' },
      { th: 'ลำดับนี้เหมาะกับวันที่เพิ่งซ้อมหนักมา', en: 'This order suits a day right after an intense session.' },
    ],
  },
  stress: {
    warm: [
      { th: 'ความร้อนที่ยาวนานพาระบบประสาทเข้าสู่โหมดพักผ่อน', en: 'Sustained heat eases the nervous system into rest mode.' },
      { th: 'จบด้วยความอบอุ่นและพื้นที่พักผ่อน ลดฮอร์โมนความเครียด', en: 'Ending warm, with time to rest, helps lower stress hormones.' },
      { th: 'ไม่มีความเย็นจัดที่จะกระตุ้นร่างกายให้ตื่นตัวอีกครั้ง', en: 'No sharp cold to snap the body back into alertness.' },
    ],
    cold: [
      { th: 'ความร้อนที่ยาวนานพาระบบประสาทเข้าสู่โหมดพักผ่อนก่อน', en: 'Sustained heat first eases the nervous system into rest mode.' },
      { th: 'ความเย็นสั้นๆ ช่วยรีเซ็ตโดยไม่ทำลายความผ่อนคลายที่สะสมมา', en: 'A brief cold reset without undoing the calm you built up.' },
      { th: 'เหมาะกับคนที่ชอบปิดท้ายด้วยความรู้สึกสดชื่นเล็กน้อย', en: 'Good for those who like a light, fresh finish.' },
    ],
  },
  immunity: {
    warm: [
      { th: 'การสลับร้อน–เย็นกระตุ้นระบบภูมิคุ้มกันให้ตื่นตัว', en: 'Hot–cold cycling stimulates the immune system into action.' },
      { th: 'จบด้วยความอบอุ่นช่วยให้ร่างกายฟื้นตัวอย่างนุ่มนวล', en: 'Ending warm lets the body settle back down gently.' },
      { th: 'ความเย็นสั้นๆ ระหว่างทางฝึกร่างกายให้ปรับตัวกับความเปลี่ยนแปลง', en: 'Brief cold along the way trains the body to adapt to change.' },
    ],
    cold: [
      { th: 'การสลับร้อน–เย็นกระตุ้นระบบภูมิคุ้มกันให้ตื่นตัว', en: 'Hot–cold cycling stimulates the immune system into action.' },
      { th: 'จบด้วยความเย็นกระตุ้นการไหลเวียนและความสดชื่น', en: 'Ending cold sharpens circulation and alertness.' },
      { th: 'เหมาะกับคนที่อยากรู้สึกกระปรี้กระเปร่าหลังจบเส้นทาง', en: 'Good for those who want to feel energized right after.' },
    ],
  },
  sleep: {
    warm: [
      { th: 'ความร้อนทำให้อุณหภูมิแกนกลางร่างกายสูงขึ้นชั่วคราว', en: 'Heat briefly raises your core body temperature.' },
      { th: 'เมื่ออุณหภูมิค่อยๆ ลดลงหลังจบ ร่างกายจะหลั่งเมลาโทนินตามธรรมชาติ', en: 'As it gradually drops afterward, the body releases melatonin naturally.' },
      { th: 'ไม่มีความเย็นจัดที่จะกระตุ้นร่างกายให้ตื่นตัวก่อนนอน', en: 'No sharp cold to jolt the body awake before bed.' },
    ],
    cold: [
      { th: 'ความร้อนทำให้อุณหภูมิแกนกลางร่างกายสูงขึ้นชั่วคราว', en: 'Heat briefly raises your core body temperature.' },
      { th: 'เมื่ออุณหภูมิค่อยๆ ลดลงหลังจบ ร่างกายจะหลั่งเมลาโทนินตามธรรมชาติ', en: 'As it gradually drops afterward, the body releases melatonin naturally.' },
      { th: 'ไม่มีความเย็นจัดที่จะกระตุ้นร่างกายให้ตื่นตัวก่อนนอน', en: 'No sharp cold to jolt the body awake before bed.' },
    ],
  },
  clarity: {
    warm: [
      { th: 'ความร้อนกระตุ้นการไหลเวียนเลือดไปเลี้ยงสมอง', en: 'Heat boosts blood flow to the brain.' },
      { th: 'ความเย็นช่วงท้ายกระตุ้นความตื่นตัวและสมาธิ', en: 'A cold finish sharpens alertness and focus.' },
      { th: 'เหมาะกับการเริ่มต้นวันใหม่หรือพักสมองระหว่างวัน', en: 'A good way to start the day or reset mid-afternoon.' },
    ],
    cold: [
      { th: 'เริ่มด้วยความเย็นปลุกร่างกายและสมองให้ตื่นตัวทันที', en: 'Starting cold wakes body and mind immediately.' },
      { th: 'ความร้อนที่ตามมาช่วยให้มีสมาธิจดจ่อได้นานขึ้น', en: 'The heat that follows helps sustain focus for longer.' },
      { th: 'เหมาะกับวันที่ต้องการความกระจ่างของความคิดแบบเร่งด่วน', en: 'Suits a day you need mental clarity, fast.' },
    ],
  },
}
