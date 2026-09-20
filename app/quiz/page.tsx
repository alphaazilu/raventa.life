import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { WellnessQuiz } from '@/components/wellness-quiz/wellness-quiz'

export const metadata: Metadata = {
  title: 'Find My Journey | RAVENTA Wellness Center',
  description: 'Answer a few questions and get a personalized contrast-therapy journey through the RAVENTA zones.',
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
