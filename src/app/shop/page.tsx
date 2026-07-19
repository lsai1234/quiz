import type { Metadata } from 'next'
import { ShopShell } from '@/components/shop/ShopShell'

export const metadata: Metadata = {
  title: 'Shop — CHRGD',
  description: 'Shop the full CHRGD range — protein, performance, hydration, everyday health and more. Swipe the shelves, add to basket, or take the quiz for a stack built around your goals.',
  openGraph: {
    title: 'Shop — CHRGD',
    description: 'The full CHRGD range — protein, performance, hydration, everyday health and more.',
    type: 'website',
  },
}

export default function ShopPage() {
  return <ShopShell />
}
