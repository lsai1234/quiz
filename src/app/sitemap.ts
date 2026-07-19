import type { MetadataRoute } from 'next'
import { getShopBundles } from '@/lib/bundles/store'

// Bundles are database-backed, so the sitemap is generated per-request rather
// than baked at build time.
export const dynamic = 'force-dynamic'

const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getchrgd.com').replace(/\/$/, '')

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/shop`, changeFrequency: 'daily', priority: 0.9 },
  ]

  let bundleRoutes: MetadataRoute.Sitemap = []
  try {
    const bundles = await getShopBundles()
    bundleRoutes = bundles.map(({ bundle }) => ({
      url: `${BASE}/bundles/${bundle.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch {
    /* a DB hiccup shouldn't take the sitemap down — ship the static routes */
  }

  return [...staticRoutes, ...bundleRoutes]
}
