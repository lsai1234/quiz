import type { Metadata } from 'next'
import { OrderConfirmation } from '@/components/order/OrderConfirmation'

/**
 * The post-payment confirmation route.
 *
 * `force-dynamic` + `revalidate = 0` so this is never statically prerendered or
 * edge-cached (OC-NFR-016). A cached confirmation is one shown to the wrong
 * person, or one surfaced by back-navigation from a checkout the customer
 * abandoned (OC-F-009). The route handler behind it also sends `no-store`.
 *
 * Nothing here reads the session — the CLIENT asks the confirmation endpoint,
 * which verifies against Stripe server-side. Rendering order data from the
 * server component would mean rendering it before that verification, which is
 * the whole defect this route exists to avoid.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export const metadata: Metadata = {
  title: 'Your order · CHRGD',
  // Keep it out of search results and out of any crawler's cache — it is a
  // per-customer page that should only ever be reached from a real checkout.
  robots: { index: false, follow: false, nocache: true },
}

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; order?: string }>
}) {
  const params = await searchParams
  return (
    <OrderConfirmation
      sessionId={params.session_id ?? null}
      mockOrderId={params.order ?? null}
    />
  )
}
