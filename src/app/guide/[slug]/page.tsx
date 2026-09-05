import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { syncPortalRuntime } from '@/lib/portal/store'
import { groupByCategory } from '@/lib/shop/categories'
import { allGuides, guideFor } from '@/lib/shop/guides'
import { CategoryGuideView } from '@/components/shop/CategoryGuideView'

/**
 * A category, at a URL.
 *
 * The editorial is authored and static; the products under it come from the
 * live catalogue, so the page is resolved per request for the same reason
 * `/product/[handle]` is — the Founders Hub can edit products and flip the data
 * source at runtime, and a cached page would show a price we are not charging.
 *
 * The guide renders whether or not the catalogue currently has a matching
 * shelf. An explanation of what creatine is does not stop being true because
 * the supplier is out of stock, and a page that 404s when a shelf empties is a
 * page whose links rot.
 */
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

/** The shelf this guide is about, if the catalogue has one right now. */
async function shelfFor(slugs: string[]) {
  await syncPortalRuntime()
  const { products } = await getResolvedCatalogue()
  const section = groupByCategory(products).find((c) => slugs.includes(c.slug))
  return section ?? null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const guide = guideFor((await params).slug)
  if (!guide) return { title: 'Not found' }
  return {
    title: `${guide.title} — what it is and who it is for | CHRGD`,
    description: guide.summary,
  }
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params
  const guide = guideFor(slug)
  if (!guide) notFound()

  const slugs = [guide.slug, ...(guide.aliases ?? [])]
  const shelf = await shelfFor(slugs)

  return (
    <CategoryGuideView
      guide={guide}
      products={shelf?.products ?? []}
      shelfHref={shelf ? `/shop#shop-cat-${shelf.slug}` : null}
    />
  )
}

/** Every guide is a real page, so they can be crawled and linked. */
export function generateStaticParams() {
  return allGuides().map((g) => ({ slug: g.slug }))
}
