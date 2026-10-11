import { Suspense } from 'react'
import { ProductsList } from '@/components/portal/products-list/ProductsList'

/**
 * Products — the one list of every product, on sale, waiting for review or
 * removed. It replaced the Catalogue, the Dashboard and the Readiness screens;
 * see `ProductsList` for why.
 *
 * The list reads its view from the address (`?show=attention` is what the
 * front page's "Products not launch-ready" links to), and a component that
 * reads the address needs a Suspense boundary above it so the rest of the page
 * can render before the address is known.
 */
export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsList />
    </Suspense>
  )
}
