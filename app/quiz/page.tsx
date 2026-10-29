import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { WellnessQuiz } from '@/components/wellness-quiz/wellness-quiz'
import { getBrandInfo } from '@/lib/brand/settings'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandInfo()
  return {
    title: `Find My Journey | ${brand.fullName}`,
    description: `Answer a few questions and get a personalized contrast-therapy journey through the ${brand.name} zones.`,
  }
}

export default function QuizPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <WellnessQuiz />
      </main>
      <SiteFooter />
    </>
  )
}
