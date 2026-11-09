import type { Metadata } from 'next'
import { StopTrainingEmails } from '@/components/training/StopTrainingEmails'

export const metadata: Metadata = { title: 'Training emails', robots: { index: false } }

type Props = { searchParams: Promise<{ stop?: string }> }

export default async function TrainingEmails({ searchParams }: Props) {
  const { stop } = await searchParams
  return <StopTrainingEmails token={typeof stop === 'string' ? stop : null} />
}
