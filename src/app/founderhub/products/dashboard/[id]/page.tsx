import { notFound } from 'next/navigation'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { clearPersistCache } from '@/lib/portal/persist'
import { ProductTree } from '@/components/portal/ProductTree'

/**
 * One product, on its own page.
 *
 * Nested under the dashboard rather than at `/founderhub/products/[id]` so a
 * product id can never shadow a sibling screen — `dashboard`, `powerbody`,
 * `review` and the rest are static segments of that same folder, and a dynamic
 * one beside them is a collision waiting for the first product whose id happens
 * to match.
 *
 * Read on the server, from the resolved catalogue, so this page shows exactly
 * what the shop shows: base product, founder overrides and imports composed the
 * same way. `force-dynamic` because an override written a second ago must be on
 * screen when the founder comes back to look at it.
 */
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params
  let { products } = await getResolvedCatalogue()
  let product = products.find((p) => p.id === id)

  /*
    A miss is worth a second look before it becomes a 404.

    Persisted reads are cached for five seconds so a hot path does not hit the
    database per request — which means a product created a moment ago can be
    invisible to a page rendered immediately afterwards. That is exactly this
    page: splitting a product ends by navigating to the one just created, and a
    "page not found" for something that plainly exists is the worst answer we
    could give. Dropping the cache costs one read, and only on the miss.
  */
  if (!product) {
    clearPersistCache()
    products = (await getResolvedCatalogue()).products
    product = products.find((p) => p.id === id)
  }

  if (!product) notFound()
  return <ProductTree product={product} />
}
