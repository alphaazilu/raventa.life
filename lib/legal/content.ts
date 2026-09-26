type Bilingual = { th: string; en: string }
type Section = { heading: Bilingual; paragraphs: Bilingual[] }

export const privacyPolicyUpdated: Bilingual = {
  th: 'ปรับปรุงล่าสุด: 21 กันยายน 2569',
  en: 'Last updated: September 21, 2026',
}

export const privacyPolicySections: Section[] = [
  {
    heading: { th: '1. บทนำ', en: '1. Introduction' },
    paragraphs: [
      {
        th: 'RAVENTA Wellness Center ("เรา") ให้ความสำคัญกับความเป็นส่วนตัวของผู้ใช้บริการเว็บไซต์ raventawellness.com ("เว็บไซต์") นโยบายฉบับนี้อธิบายว่าเราเก็บรวบรวม ใช้ เปิดเผย และคุ้มครองข้อมูลส่วนบุคคลของท่านอย่างไร ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)',
        en: 'RAVENTA Wellness Center ("we," "us," or "our") respects the privacy of everyone who uses raventawellness.com (the "Website"). This policy explains how we collect, use, disclose, and protect your personal data, in line with Thailand’s Personal Data Protection Act B.E. 2562 (PDPA).',
      },
      {
        th: 'การใช้งานเว็บไซต์ของท่านถือว่าท่านรับทราบและยอมรับแนวปฏิบัติที่ระบุไว้ในนโยบายฉบับนี้',
        en: 'By using the Website, you acknowledge and agree to the practices described in this policy.',
      },
    ],
  },
  {
    heading: { th: '2. ข้อมูลที่เราเก็บรวบรวม', en: '2. Information We Collect' },
    paragraphs: [
      {
        th: 'ข้อมูลที่ท่านให้แก่เราโดยตรง: เมื่อสมัครสมาชิกด้วยอีเมล เราเก็บชื่อ นามสกุล อีเมล เบอร์โทรศัพท์ จังหวัดที่อยู่อาศัย และรหัสผ่าน (จัดเก็บในรูปแบบเข้ารหัส เราไม่สามารถเห็นรหัสผ่านจริงของท่านได้)',
        en: 'Information you provide directly: when you create an account with email and password, we collect your first name, last name, email address, phone number, and province of residence. Your password is stored in encrypted form — we never see or store your actual password.',
      },
      {
        th: 'ข้อมูลจากการเข้าสู่ระบบผ่านบุคคลที่สาม: หากท่านเข้าสู่ระบบด้วย Google เราจะได้รับชื่อและอีเมลของท่านตามที่แพลตฟอร์มนั้นอนุญาตให้เข้าถึง หากบัญชีของท่านยังไม่มีเบอร์โทรศัพท์และจังหวัดที่อยู่อาศัย เราจะขอให้ท่านกรอกข้อมูลเพิ่มเติมก่อนใช้งานบัญชี',
        en: 'Information from third-party sign-in: if you sign in with Google, we receive your name and email as permitted by that platform. If your account is still missing a phone number or province, we will ask you to provide them before you can use your account.',
      },
      {
        th: 'ข้อมูลการใช้งานเว็บไซต์: เราใช้คุกกี้ที่จำเป็นสำหรับการเข้าสู่ระบบ (session cookie) และอาจเก็บสถิติการเข้าชมเว็บไซต์แบบไม่ระบุตัวตนผ่านบริการวิเคราะห์ของ Vercel Analytics',
        en: 'Website usage information: we use cookies that are necessary for signing in (session cookies), and we may collect anonymized visitor analytics through Vercel Analytics.',
      },
    ],
  },
  {
    heading: { th: '3. วัตถุประสงค์ในการใช้ข้อมูล', en: '3. How We Use Your Information' },
    paragraphs: [
      {
        th: 'เราใช้ข้อมูลของท่านเพื่อ: สร้างและจัดการบัญชีสมาชิก ยืนยันตัวตนเมื่อเข้าสู่ระบบ ส่งอีเมลที่จำเป็น (ยืนยันการสมัคร อีเมลต้อนรับ การรีเซ็ตรหัสผ่าน) ติดต่อสื่อสารเกี่ยวกับบริการของเรา ปรับปรุงและพัฒนาเว็บไซต์ และปฏิบัติตามกฎหมายที่เกี่ยวข้อง',
        en: 'We use your information to: create and manage your member account, verify your identity when you sign in, send necessary emails (signup confirmation, welcome email, password reset), communicate with you about our services, improve and develop the Website, and comply with applicable law.',
      },
    ],
  },
  {
    heading: { th: '4. การเปิดเผยข้อมูลต่อบุคคลที่สาม', en: '4. Sharing Your Information' },
    paragraphs: [
      {
        th: 'เราไม่ขายข้อมูลส่วนบุคคลของท่าน เราเปิดเผยข้อมูลให้แก่ผู้ให้บริการที่จำเป็นต่อการดำเนินงานของเว็บไซต์เท่านั้น ได้แก่: Supabase (ฐานข้อมูลและระบบยืนยันตัวตน), Resend (บริการส่งอีเมล), Google (สำหรับการเข้าสู่ระบบด้วยบัญชีของท่าน), Vercel (โฮสติ้งเว็บไซต์และสถิติการเข้าชม) ผู้ให้บริการเหล่านี้อาจตั้งอยู่นอกประเทศไทย และมีนโยบายคุ้มครองข้อมูลของตนเองซึ่งท่านควรศึกษาเพิ่มเติม',
        en: 'We do not sell your personal data. We only share information with service providers necessary to operate the Website: Supabase (database and authentication), Resend (transactional email), Google (for signing in with your account there), and Vercel (website hosting and analytics). These providers may be located outside Thailand and maintain their own privacy policies, which we encourage you to review.',
      },
      {
        th: 'หน้าติดต่อเราบนเว็บไซต์มีการฝัง Google Maps ซึ่งอาจมีการเก็บข้อมูลตามนโยบายความเป็นส่วนตัวของ Google เอง',
        en: 'Our Contact page embeds Google Maps, which may collect data under Google’s own privacy policy.',
      },
      {
        th: 'เราอาจเปิดเผยข้อมูลของท่านหากกฎหมายกำหนด หรือเพื่อคุ้มครองสิทธิ ทรัพย์สิน หรือความปลอดภัยของ RAVENTA ผู้ใช้บริการ หรือบุคคลอื่น',
        en: 'We may disclose your information where required by law, or to protect the rights, property, or safety of RAVENTA, our users, or others.',
      },
    ],
  },
  {
    heading: { th: '5. การโอนข้อมูลไปต่างประเทศ', en: '5. International Data Transfer' },
    paragraphs: [
      {
        th: 'เนื่องจากผู้ให้บริการที่เราใช้งาน (เช่น Supabase, Resend, Vercel) มีเซิร์ฟเวอร์ตั้งอยู่นอกประเทศไทย ข้อมูลของท่านอาจถูกโอนและประมวลผลในต่างประเทศ เรากำหนดให้ผู้ให้บริการเหล่านี้ต้องมีมาตรการคุ้มครองข้อมูลที่เหมาะสมตามที่กฎหมายกำหนด',
        en: 'Because the providers we use (such as Supabase, Resend, and Vercel) operate servers outside Thailand, your data may be transferred to and processed in other countries. We require these providers to maintain appropriate data protection safeguards as required by law.',
      },
    ],
  },
  {
    heading: { th: '6. ระยะเวลาในการเก็บรักษาข้อมูล', en: '6. Data Retention' },
    paragraphs: [
      {
        th: 'เราเก็บรักษาข้อมูลส่วนบุคคลของท่านตราบเท่าที่บัญชีของท่านยังใช้งานอยู่ หรือตราบเท่าที่จำเป็นเพื่อวัตถุประสงค์ที่ระบุไว้ในนโยบายนี้ หากท่านต้องการลบบัญชีและข้อมูลของท่าน กรุณาติดต่อเราตามช่องทางด้านล่าง',
        en: 'We retain your personal data for as long as your account remains active, or as needed to fulfil the purposes described in this policy. If you would like your account and data deleted, please contact us using the details below.',
      },
    ],
  },
  {
    heading: { th: '7. มาตรการรักษาความปลอดภัย', en: '7. Security Measures' },
    paragraphs: [
      {
        th: 'เราใช้มาตรการทางเทคนิคที่เหมาะสมเพื่อคุ้มครองข้อมูลของท่าน ได้แก่ การเข้ารหัสข้อมูลระหว่างการรับส่ง (HTTPS) การเข้ารหัสรหัสผ่าน การจำกัดสิทธิ์การเข้าถึงข้อมูลเฉพาะเจ้าของบัญชี (Row Level Security) และการตรวจสอบสิทธิ์ก่อนเข้าถึงหน้าที่มีข้อมูลส่วนบุคคล อย่างไรก็ตาม ไม่มีระบบใดปลอดภัย 100% เราจึงขอแนะนำให้ท่านเก็บรักษารหัสผ่านของท่านเป็นความลับ',
        en: 'We use reasonable technical measures to protect your data, including encryption in transit (HTTPS), password encryption, database-level access restrictions so each account can only see its own data (Row Level Security), and authentication checks before any page containing personal data is shown. No system is 100% secure, so we recommend keeping your password confidential.',
      },
    ],
  },
  {
    heading: { th: '8. คุกกี้', en: '8. Cookies' },
    paragraphs: [
      {
        th: 'เว็บไซต์ของเราใช้คุกกี้ที่จำเป็นสำหรับการรักษาสถานะการเข้าสู่ระบบของท่าน (session cookie) ซึ่งจำเป็นต่อการใช้งานบัญชีสมาชิก ท่านสามารถตั้งค่าเบราว์เซอร์เพื่อปฏิเสธคุกกี้ได้ แต่อาจทำให้บางฟีเจอร์ของเว็บไซต์ใช้งานไม่ได้',
        en: 'Our Website uses cookies that are necessary to keep you signed in (session cookies), which are required for member account features to work. You can configure your browser to refuse cookies, though doing so may prevent some features from working.',
      },
    ],
  },
  {
    heading: { th: '9. สิทธิของเจ้าของข้อมูลส่วนบุคคล', en: '9. Your Rights' },
    paragraphs: [
      {
        th: 'ภายใต้ PDPA ท่านมีสิทธิ: ขอเข้าถึงและขอสำเนาข้อมูลส่วนบุคคลของท่าน, ขอแก้ไขข้อมูลให้ถูกต้อง (ทำได้ด้วยตนเองที่หน้า "บัญชีของฉัน"), ขอให้ลบหรือทำลายข้อมูล, ขอระงับการใช้ข้อมูล, คัดค้านการประมวลผลข้อมูล, ขอรับหรือโอนย้ายข้อมูล และถอนความยินยอมเมื่อใดก็ได้ หากท่านต้องการใช้สิทธิดังกล่าว กรุณาติดต่อเราตามช่องทางด้านล่าง',
        en: 'Under the PDPA, you have the right to: access and request a copy of your personal data; correct inaccurate data (you can do this yourself on the "My Account" page); request deletion or destruction of your data; request restriction of processing; object to processing; request data portability; and withdraw consent at any time. To exercise these rights, please contact us using the details below.',
      },
    ],
  },
  {
    heading: { th: '10. ข้อมูลของผู้เยาว์', en: '10. Children’s Privacy' },
    paragraphs: [
      {
        th: 'เว็บไซต์และบริการของเราไม่ได้มุ่งเป้าไปที่เด็กอายุต่ำกว่า 20 ปี และเราไม่เก็บรวบรวมข้อมูลส่วนบุคคลจากผู้เยาว์โดยเจตนา หากท่านทราบว่าผู้เยาว์ให้ข้อมูลส่วนบุคคลแก่เรา กรุณาติดต่อเราเพื่อดำเนินการลบข้อมูลดังกล่าว',
        en: 'Our Website and services are not directed at children under 20 years of age, and we do not knowingly collect personal data from minors. If you become aware that a minor has provided us with personal data, please contact us so we can remove it.',
      },
    ],
  },
  {
    heading: { th: '11. การเปลี่ยนแปลงนโยบาย', en: '11. Changes to This Policy' },
    paragraphs: [
      {
        th: 'เราอาจปรับปรุงนโยบายฉบับนี้เป็นครั้งคราว โดยจะระบุวันที่ปรับปรุงล่าสุดไว้ด้านบนของหน้านี้ การใช้งานเว็บไซต์ต่อไปหลังจากมีการเปลี่ยนแปลงถือว่าท่านยอมรับนโยบายฉบับปรับปรุง',
        en: 'We may update this policy from time to time. The "last updated" date at the top of this page will reflect the most recent revision. Continuing to use the Website after changes take effect constitutes acceptance of the revised policy.',
      },
    ],
  },
  {
    heading: { th: '12. ติดต่อเรา', en: '12. Contact Us' },
    paragraphs: [
      {
        th: 'หากท่านมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวนี้ หรือต้องการใช้สิทธิของท่านตาม PDPA กรุณาติดต่อเราที่อีเมล raventa.wellness@gmail.com',
        en: 'If you have questions about this privacy policy, or would like to exercise your rights under the PDPA, please contact us at raventa.wellness@gmail.com.',
      },
    ],
  },
]

export const termsUpdated: Bilingual = {
  th: 'ปรับปรุงล่าสุด: 21 กันยายน 2569',
  en: 'Last updated: September 21, 2026',
}

export const termsSections: Section[] = [
  {
    heading: { th: '1. การยอมรับข้อกำหนด', en: '1. Acceptance of Terms' },
    paragraphs: [
      {
        th: 'ข้อกำหนดและเงื่อนไขฉบับนี้ ("ข้อกำหนด") ใช้บังคับกับการเข้าใช้งานเว็บไซต์ raventawellness.com ("เว็บไซต์") ของ RAVENTA Wellness Center ("เรา") การเข้าใช้งานหรือสมัครสมาชิกบนเว็บไซต์ถือว่าท่านตกลงยอมรับข้อกำหนดฉบับนี้ หากท่านไม่เห็นด้วยกับข้อกำหนดใด กรุณางดใช้งานเว็บไซต์',
        en: 'These Terms of Service ("Terms") govern your access to and use of raventawellness.com (the "Website") operated by RAVENTA Wellness Center ("we," "us," or "our"). By accessing the Website or creating an account, you agree to be bound by these Terms. If you do not agree, please do not use the Website.',
      },
    ],
  },
  {
    heading: { th: '2. คำอธิบายบริการ', en: '2. Description of Service' },
    paragraphs: [
      {
        th: 'เว็บไซต์นี้ให้ข้อมูลเกี่ยวกับ RAVENTA Wellness Center รวมถึงระบบสมาชิกสำหรับลูกค้าเพื่อจัดการข้อมูลส่วนตัวและรับข่าวสารจากเรา เราอาจเพิ่ม ปรับปรุง หรือหยุดให้บริการฟีเจอร์บางส่วนของเว็บไซต์ได้โดยไม่ต้องแจ้งล่วงหน้า',
        en: 'The Website provides information about RAVENTA Wellness Center, along with a member account system that lets customers manage their personal information and receive updates from us. We may add, modify, or discontinue features of the Website at any time without prior notice.',
      },
    ],
  },
  {
    heading: { th: '3. บัญชีผู้ใช้', en: '3. User Accounts' },
    paragraphs: [
      {
        th: 'เมื่อสมัครสมาชิก ท่านตกลงที่จะให้ข้อมูลที่ถูกต้อง ครบถ้วน และเป็นปัจจุบัน ท่านมีหน้าที่รักษารหัสผ่านของท่านเป็นความลับ และรับผิดชอบต่อกิจกรรมทั้งหมดที่เกิดขึ้นภายใต้บัญชีของท่าน หากท่านทราบหรือสงสัยว่ามีการใช้บัญชีของท่านโดยไม่ได้รับอนุญาต กรุณาแจ้งเราทันที',
        en: 'When you create an account, you agree to provide accurate, complete, and current information. You are responsible for keeping your password confidential and for all activity that occurs under your account. If you become aware of, or suspect, unauthorized use of your account, please notify us immediately.',
      },
    ],
  },
  {
    heading: { th: '4. การใช้งานที่เหมาะสม', en: '4. Acceptable Use' },
    paragraphs: [
      {
        th: 'ท่านตกลงที่จะไม่ใช้เว็บไซต์เพื่อวัตถุประสงค์ที่ผิดกฎหมาย ไม่พยายามเข้าถึงระบบหรือข้อมูลของผู้อื่นโดยไม่ได้รับอนุญาต ไม่รบกวนหรือขัดขวางการทำงานของเว็บไซต์ และไม่ใช้ระบบอัตโนมัติเพื่อเข้าถึงเว็บไซต์ในลักษณะที่ก่อให้เกิดภาระเกินสมควรแก่ระบบของเรา',
        en: 'You agree not to use the Website for any unlawful purpose, attempt to access another user’s account or data without authorization, interfere with or disrupt the Website’s operation, or use automated means to access the Website in a way that places an unreasonable load on our systems.',
      },
    ],
  },
  {
    heading: { th: '5. ทรัพย์สินทางปัญญา', en: '5. Intellectual Property' },
    paragraphs: [
      {
        th: 'เนื้อหาทั้งหมดบนเว็บไซต์ รวมถึงโลโก้ ข้อความ ภาพถ่าย และงานออกแบบ เป็นทรัพย์สินของ RAVENTA Wellness Center หรือผู้อนุญาตให้ใช้สิทธิ ห้ามคัดลอก ทำซ้ำ หรือเผยแพร่โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษร',
        en: 'All content on the Website, including logos, text, photographs, and design, is the property of RAVENTA Wellness Center or its licensors. You may not copy, reproduce, or distribute it without our prior written permission.',
      },
    ],
  },
  {
    heading: { th: '6. บริการของบุคคลที่สาม', en: '6. Third-Party Services' },
    paragraphs: [
      {
        th: 'เว็บไซต์อาจมีลิงก์หรือฝังบริการของบุคคลที่สาม เช่น Google Maps หรือการเข้าสู่ระบบผ่าน Google เราไม่รับผิดชอบต่อเนื้อหา ความถูกต้อง หรือแนวปฏิบัติด้านความเป็นส่วนตัวของบริการเหล่านั้น ซึ่งอยู่ภายใต้ข้อกำหนดของผู้ให้บริการแต่ละราย',
        en: 'The Website may link to or embed third-party services such as Google Maps, or offer sign-in through Google. We are not responsible for the content, accuracy, or privacy practices of those services, which are governed by each provider’s own terms.',
      },
    ],
  },
  {
    heading: { th: '7. การจำกัดความรับผิด', en: '7. Limitation of Liability' },
    paragraphs: [
      {
        th: 'เว็บไซต์นี้ให้บริการ "ตามสภาพที่เป็นอยู่" โดยไม่มีการรับประกันใดๆ ไม่ว่าโดยชัดแจ้งหรือโดยนัย เราจะไม่รับผิดต่อความเสียหายทางอ้อม ความเสียหายที่เกิดขึ้นโดยบังเอิญ หรือความเสียหายที่เป็นผลสืบเนื่องอันเกิดจากการใช้งานหรือไม่สามารถใช้งานเว็บไซต์ได้ ภายในขอบเขตสูงสุดที่กฎหมายอนุญาต',
        en: 'The Website is provided "as is" without warranties of any kind, express or implied. To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of, or inability to use, the Website.',
      },
    ],
  },
  {
    heading: { th: '8. การยกเลิกบัญชี', en: '8. Termination' },
    paragraphs: [
      {
        th: 'เราสงวนสิทธิ์ในการระงับหรือยกเลิกบัญชีของท่าน หากมีการฝ่าฝืนข้อกำหนดฉบับนี้ ท่านสามารถขอปิดบัญชีของท่านได้ตลอดเวลาโดยติดต่อเราตามช่องทางด้านล่าง',
        en: 'We reserve the right to suspend or terminate your account if you violate these Terms. You may request that your account be closed at any time by contacting us using the details below.',
      },
    ],
  },
  {
    heading: { th: '9. กฎหมายที่ใช้บังคับ', en: '9. Governing Law' },
    paragraphs: [
      {
        th: 'ข้อกำหนดฉบับนี้อยู่ภายใต้บังคับและตีความตามกฎหมายไทย ข้อพิพาทใดๆ ที่เกิดขึ้นจากหรือเกี่ยวข้องกับข้อกำหนดนี้ให้อยู่ในเขตอำนาจของศาลไทย',
        en: 'These Terms are governed by and construed in accordance with the laws of Thailand. Any dispute arising from or relating to these Terms shall be subject to the jurisdiction of the Thai courts.',
      },
    ],
  },
  {
    heading: { th: '10. การเปลี่ยนแปลงข้อกำหนด', en: '10. Changes to These Terms' },
    paragraphs: [
      {
        th: 'เราอาจปรับปรุงข้อกำหนดฉบับนี้เป็นครั้งคราว โดยจะระบุวันที่ปรับปรุงล่าสุดไว้ด้านบนของหน้านี้ การใช้งานเว็บไซต์ต่อไปหลังจากมีการเปลี่ยนแปลงถือว่าท่านยอมรับข้อกำหนดฉบับปรับปรุง',
        en: 'We may update these Terms from time to time. The "last updated" date at the top of this page will reflect the most recent revision. Continuing to use the Website after changes take effect constitutes acceptance of the revised Terms.',
      },
    ],
  },
  {
    heading: { th: '11. ติดต่อเรา', en: '11. Contact Us' },
    paragraphs: [
      {
        th: 'หากท่านมีคำถามเกี่ยวกับข้อกำหนดฉบับนี้ กรุณาติดต่อเราที่อีเมล raventa.wellness@gmail.com',
        en: 'If you have questions about these Terms, please contact us at raventa.wellness@gmail.com.',
      },
    ],
  },
]
