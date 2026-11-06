import type { Metadata } from 'next'
import { StopDealEmails } from '@/components/hub/StopDealEmails'

export const metadata: Metadata = { title: 'Member price emails', robots: { index: false } }

type Props = { searchParams: Promise<{ stop?: string }> }

export default async function DealEmails({ searchParams }: Props) {
  const { stop } = await searchParams
  return <StopDealEmails token={typeof stop === 'string' ? stop : null} />
}
