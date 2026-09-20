type Bilingual = { th: string; en: string }

export const authCopy: Record<string, Bilingual> = {
  loginHeading: { th: 'เข้าสู่ระบบ', en: 'Log In' },
  signupHeading: { th: 'สมัครสมาชิก', en: 'Sign Up' },
  emailLabel: { th: 'อีเมล', en: 'Email' },
  passwordLabel: { th: 'รหัสผ่าน', en: 'Password' },
  loginButton: { th: 'เข้าสู่ระบบ', en: 'Log In' },
  signupButton: { th: 'สมัครสมาชิก', en: 'Create Account' },
  orContinueWith: { th: 'หรือดำเนินการต่อด้วย', en: 'Or continue with' },
  google: { th: 'ดำเนินการต่อด้วย Google', en: 'Continue with Google' },
  facebook: { th: 'ดำเนินการต่อด้วย Facebook', en: 'Continue with Facebook' },
  signupSuccess: {
    th: 'สมัครสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชีก่อนเข้าสู่ระบบ',
    en: 'Success! Please check your email to confirm your account before logging in.',
  },
  accountHeading: { th: 'บัญชีของฉัน', en: 'My Account' },
  emailFieldLabel: { th: 'อีเมล', en: 'Email' },
  roleFieldLabel: { th: 'สถานะบัญชี', en: 'Account Type' },
  roleAdmin: { th: 'แอดมิน', en: 'Admin' },
  roleCustomer: { th: 'สมาชิก', en: 'Member' },
  goToAdmin: { th: 'ไปที่หน้าแอดมิน →', en: 'Go to admin dashboard →' },
  signOutButton: { th: 'ออกจากระบบ', en: 'Sign Out' },
  adminHeading: { th: 'แดชบอร์ดแอดมิน', en: 'Admin Dashboard' },
  adminWelcome: { th: 'ยินดีต้อนรับ', en: 'Welcome' },
  adminPlaceholder: {
    th: 'พื้นที่นี้สำหรับทีมงาน RAVENTA — เตรียมไว้สำหรับจัดการเนื้อหาและข้อมูลลูกค้าในขั้นถัดไป',
    en: 'This area is for the RAVENTA team — content and customer management tools will go here next.',
  },
  backHome: { th: '← กลับหน้าหลัก', en: '← Back to homepage' },
}
