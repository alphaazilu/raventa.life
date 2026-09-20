import { SiteHeader } from '@/components/site-header'
import { HeroSection } from '@/components/hero-section'
import { AboutSection } from '@/components/about-section'
import { ZonesSection } from '@/components/zones-section'
import { BenefitsSection } from '@/components/benefits-section'
import { ContactSection } from '@/components/contact-section'
import { SiteFooter } from '@/components/site-footer'

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <AboutSection />
        <ZonesSection />
        <BenefitsSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </>
  )
}
