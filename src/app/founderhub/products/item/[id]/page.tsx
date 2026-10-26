import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { isPortalAuthed } from '@/lib/portal/guard'
import { productPayload } from '@/lib/portal/product-edit'
import { ProductWorkspace } from '@/components/portal/product/ProductWorkspace'
import { getOfferSettings } from '@/lib/offer/store'
import { heroView } from '@/lib/offer/view'

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
  /*
    Signed in, checked HERE and not only in the hub's layout.

    The layout draws the sign-in screen instead of `children` for a visitor
    who is not signed in, which looks like a gate and is not one: Next renders
    every segment of the route on its own and sends each one's output in the
    page's data, whether or not the layout above it puts it on screen. So
    without this check the sign-in screen came with the whole product inside
    it — what we pay PowerBody, the markup, products still waiting for review
    or removed, the review notes, the approving founder's email, the bundles
    and stacks that use it — readable by anyone who viewed the source. And
    every anonymous request re-read the whole products document past the cache.

    Nothing is drawn here (rather than a 404), so a visitor sees the same
    sign-in screen as anywhere else in the hub and cannot use this address to
    find out which product ids exist. Signing in reloads the page, which then
    passes this check and draws the product.
  */
  if (!(await isPortalAuthed())) return null

  const { id } = await params
  // A broken %-sequence in the address is no product, not a server error.
  let decoded: string
  try {
    decoded = decodeURIComponent(id)
  } catch {
    notFound()
  }
  const payload = await productPayload(decoded, { fresh: true })
  if (!payload) notFound()
  // The hero checks live in their own document (`portal:offer`), read here
  // with the product so the page asks nothing more once it is drawn.
  const hero = payload.state === 'pending' ? null : heroView(await getOfferSettings(), payload.product.id, payload.product)
  return (
    <Suspense>
      <ProductWorkspace initial={payload} hero={hero} />
    </Suspense>
  )
}
