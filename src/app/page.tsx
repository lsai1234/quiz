import type { Metadata } from 'next'
import { ShopShell } from '@/components/shop/ShopShell'

/**
 * The main address is the shop. The quiz is at `/quiz`; `/shop` still answers
 * with the same shop (old links, emails and `#basket` all keep working) and
 * names this page as the one that counts.
 */
export const metadata: Metadata = {
  title: 'CHRGD — Supplements, and a stack built around you',
  description: 'Shop the full CHRGD range — protein, performance, hydration, everyday health and more. Swipe the shelves, add to basket, or take the quiz for a stack built around your goals.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'CHRGD — Supplements, and a stack built around you',
    description: 'The full CHRGD range — protein, performance, hydration, everyday health and more.',
    type: 'website',
  },
}

export default function Home() {
  return <ShopShell />
}
