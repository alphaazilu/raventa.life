import { SiteHeader } from '@/components/site-header'
import { HeroSection } from '@/components/hero-section'
import { AboutSection } from '@/components/about-section'
import { ZonesSection } from '@/components/zones-section'
import { BenefitsSection } from '@/components/benefits-section'
import { ContactSection } from '@/components/contact-section'
import { SiteFooter } from '@/components/site-footer'
import { UpcomingSection } from '@/components/calendar/upcoming-section'
import { upcomingOutside } from '@/lib/console/calendar'
import { bangkokToday } from '@/lib/check-in/day'

// Rebuilt at most every 5 minutes for the "Coming up" calendar strip (§31).
export const revalidate = 300

export default async function Page() {
  const upcoming = await upcomingOutside({ id: null, role: 'public' }, bangkokToday(), 60, 4).catch(() => [])
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <UpcomingSection items={upcoming} />
        <AboutSection />
        <ZonesSection />
        <BenefitsSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </>
  )
}
