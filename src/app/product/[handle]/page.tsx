import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { syncPortalRuntime } from '@/lib/portal/store'
import { ProductPageView } from '@/components/shop/ProductPageView'

/**
 * A product, at a URL.
 *
 * The shop is one statically rendered route with the catalogue fetched client
 * side, and its detail view is a sheet — which is the right gesture while
 * browsing and the wrong one for everything else. A sheet cannot be linked to,
 * shared, bookmarked, opened in a new tab, indexed, or advertised against, and
 * the back button does not mean what a shopper expects inside one. This route is
 * the address; the sheet stays as the quick view, and both render the same
 * `ProductDetailBody`, so there is no second description of the same tub to
 * drift out of date.
 *
 * Resolved per request for the same reason `/api/catalogue` is: the Founders
 * Hub can edit products and flip the data source at runtime, and a cached page
 * would serve a price we are no longer charging.
 */
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ handle: string }>
}

async function findProduct(handle: string) {
  await syncPortalRuntime()
  const { products } = await getResolvedCatalogue()
  return { product: products.find((p) => p.handle === handle) ?? null, products }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params
  const { product } = await findProduct(handle)
  if (!product) return { title: 'Product — CHRGD' }

  /* The supplier's own description, trimmed to a sensible meta length on a word
     boundary — a description cut mid-word reads as broken in a search result. */
  const description = product.shortReason || product.description
  const meta = description.length > 155
    ? `${description.slice(0, 155).replace(/\s+\S*$/, '')}…`
    : description

  return {
    title: `${product.title} | CHRGD`,
    description: meta,
    alternates: { canonical: `/product/${product.handle}` },
    openGraph: {
      title: `${product.title} | CHRGD`,
      description: meta,
      type: 'website',
      ...(product.imageUrl ? { images: [{ url: product.imageUrl }] } : {}),
    },
  }
}

export default async function ProductPage({ params }: PageProps) {
  const { handle } = await params
  const { product, products } = await findProduct(handle)
  if (!product) notFound()

  /* What the basket badge needs to count only the lines we will charge for —
     see the `sellableKeys` prop. Built here because this is where the catalogue
     already is. */
  const sellableKeys = products.flatMap((p) => p.variants.map((v) => `${p.id}:${v.id}`))

  return <ProductPageView product={product} sellableKeys={sellableKeys} />
}
