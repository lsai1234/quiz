import type { Metadata } from 'next'
import { ShopShell } from '@/components/shop/ShopShell'

export const metadata: Metadata = {
  title: 'Shop — CHRGD',
  description: 'Shop the full CHRGD range — protein, performance, everyday health and more.',
}

export default function ShopPage() {
  return <ShopShell />
}
