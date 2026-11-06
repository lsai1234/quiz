import type { Metadata } from 'next'
import { TrainerPage } from '@/components/hub/trainer/TrainerPage'

export const metadata: Metadata = { title: 'Ask your trainer', robots: { index: false } }

export default function Trainer() {
  return <TrainerPage />
}
