import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { productPayload } from '@/lib/portal/product-edit'
import { ProductWorkspace } from '@/components/portal/product/ProductWorkspace'

/**
 * One product's page — on sale, waiting for review, or removed.
 *
 * Under `item/` so a product id can never shadow a sibling screen (`add`,
 * `review`, `fix-ups`…), which a dynamic segment beside them would.
 *
 * Read on the server, fresh (past the five-second read cache), because this
 * page is often opened the moment another request created the product — a
 * split, a merge, an add — and "no such product" for one that plainly exists is
 * the worst answer it could give.
 */
export const dynamic = 'force-dynamic'

export default async function ProductItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await productPayload(decodeURIComponent(id), { fresh: true })
  if (!payload) notFound()
  return (
    <Suspense>
      <ProductWorkspace initial={payload} />
    </Suspense>
  )
}
