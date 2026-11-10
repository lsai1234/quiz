import type { Metadata } from 'next'
import { TrainerAboutPage } from '@/components/hub/trainer/TrainerAbout'

export const metadata: Metadata = { title: 'Your trainer', robots: { index: false } }

export default function TrainerAbout() {
  return <TrainerAboutPage />
}
