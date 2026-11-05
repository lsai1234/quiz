import type { Metadata } from 'next'
import { TrainingPage } from '@/components/training/TrainingPage'

export const metadata: Metadata = { title: 'Your training plan', robots: { index: false } }

export default function Training() {
  return <TrainingPage />
}
