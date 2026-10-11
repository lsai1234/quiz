import { getProductBundles, getResolvedBundles } from '@/lib/bundles/store'
import { getTopProductIds } from './store'

/**
 * Where a product is used beyond the shop shelf.
 *
 * Removing or merging away a product that a pre-built bundle sells, or that
 * sits on the Top 25, used to break those silently: the bundle quietly lost a
 * slot and the roster read "no longer in the catalogue". Nothing said so at the
 * moment it could have been prevented. This is what the product page asks
 * before it removes or merges, so the founder sees the knock-on first.
 */
export interface ProductUsage {
  /** Position on the Top 25, 1-based, or null. */
  topRank: number | null
  /** Pre-built bundles that sell it (as a core product or an add-on). */
  bundles: Array<{ slug: string; name: string; as: 'core' | 'add-on' }>
  /** Session stacks built on one of those bundles. */
  stacks: Array<{ slug: string; name: string; published: boolean }>
}

export async function productUsage(id: string): Promise<ProductUsage> {
  const [roster, productBundles, stacks] = await Promise.all([
    getTopProductIds().catch(() => [] as string[]),
    getProductBundles().catch(() => []),
    getResolvedBundles().catch(() => []),
  ])
  const rank = roster.indexOf(id)
  const bundles: ProductUsage['bundles'] = []
  for (const b of productBundles) {
    if (b.blueprint.slots.some((s) => s.selectedProductId === id || s.recommendedProductId === id)) {
      bundles.push({ slug: b.slug, name: b.name, as: 'core' })
    } else if (b.addOns.some((a) => a.productId === id)) {
      bundles.push({ slug: b.slug, name: b.name, as: 'add-on' })
    }
  }
  const slugs = new Set(bundles.map((b) => b.slug))
  return {
    topRank: rank === -1 ? null : rank + 1,
    bundles,
    stacks: stacks
      .filter((s) => s.productBundleSlug && slugs.has(s.productBundleSlug))
      .map((s) => ({ slug: s.slug, name: s.name, published: s.published })),
  }
}

/** One sentence for a confirm step, or null when nothing else uses it. */
export function usageWarning(usage: ProductUsage): string | null {
  const parts: string[] = []
  if (usage.topRank != null) parts.push(`it is #${usage.topRank} on the Top 25`)
  if (usage.bundles.length > 0) {
    parts.push(`${usage.bundles.length === 1 ? 'the pre-built bundle' : 'the pre-built bundles'} ${usage.bundles.map((b) => `“${b.name}”`).join(', ')} ${usage.bundles.length === 1 ? 'sells' : 'sell'} it`)
  }
  if (usage.stacks.length > 0) {
    parts.push(`so ${usage.stacks.length === 1 ? 'does the session stack' : 'do the session stacks'} ${usage.stacks.map((s) => `“${s.name}”`).join(', ')}`)
  }
  return parts.length > 0 ? `Heads up: ${parts.join('; ')}.` : null
}
