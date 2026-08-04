/**
 * Shopify Admin API writes for the portal — push a CatalogueProduct's config
 * (tags + chrgd.* metafields) back to Shopify. Mirrors scripts/seed-shopify-tags.mjs
 * but callable from the portal. Requires SHOPIFY_ADMIN_TOKEN + a store domain.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'

const API_VERSION = process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION ?? '2024-10'

function adminConfig(): { base: string; token: string } {
  const domain = process.env.SHOPIFY_STORE_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_TOKEN
  if (!domain) throw new Error('SHOPIFY_STORE_DOMAIN is not set')
  if (!token) throw new Error('SHOPIFY_ADMIN_TOKEN is not set')
  return { base: `https://${domain}/admin/api/${API_VERSION}`, token }
}

function numericId(gid: string | null): string | null {
  if (!gid) return null
  return gid.split('/').pop() ?? null
}

/** Managed tag prefixes — everything else on the product is preserved. */
const MANAGED_PREFIXES = ['slot:', 'goal:', 'dietary:', 'swap:', 'product-type:', 'stimulant', 'core-eligible', 'booster-eligible']

function buildTags(p: CatalogueProduct): string[] {
  const tags: string[] = []
  for (const s of p.stackSlots) tags.push(`slot:${s}`)
  for (const g of p.goals) tags.push(`goal:${g}`)
  for (const d of p.dietaryTags) tags.push(`dietary:${d}`)
  tags.push(`swap:${p.swapGroup}`)
  tags.push(`product-type:${p.category.toLowerCase().replace(/\s+/g, '-')}`)
  if (p.hasStimulants) tags.push('stimulant')
  if (p.isCoreEligible) tags.push('core-eligible')
  if (p.isBoosterEligible) tags.push('booster-eligible')
  return tags
}

type Metafield = { namespace: string; key: string; type: string; value: string }

function buildMetafields(p: CatalogueProduct): Metafield[] {
  const mf: Metafield[] = [
    { namespace: 'chrgd', key: 'stack_priority', type: 'number_integer', value: String(p.recommendationPriority) },
    { namespace: 'chrgd', key: 'margin_priority', type: 'number_integer', value: String(p.marginPriority) },
    { namespace: 'chrgd', key: 'safe_wording', type: 'single_line_text_field', value: p.shortReason },
    { namespace: 'chrgd', key: 'subscription_eligible', type: 'boolean', value: String(p.subscriptionEligible) },
    { namespace: 'chrgd', key: 'servings', type: 'number_integer', value: String(p.servings) },
    { namespace: 'chrgd', key: 'subscription_only', type: 'boolean', value: String(!!p.isSubscriptionOnly) },
    { namespace: 'chrgd', key: 'formats', type: 'single_line_text_field', value: p.formats.join(',') },
  ]
  if (p.consumption) {
    mf.push({ namespace: 'chrgd', key: 'consumption_cadence', type: 'single_line_text_field', value: p.consumption.cadence })
    mf.push({ namespace: 'chrgd', key: 'servings_per_unit', type: 'number_integer', value: String(p.consumption.servingsPerUnit) })
  }
  if (p.subscriptionProductId) mf.push({ namespace: 'chrgd', key: 'subscription_product_handle', type: 'single_line_text_field', value: p.subscriptionProductId })
  if (p.minSubscriptionMonths != null) mf.push({ namespace: 'chrgd', key: 'min_subscription_months', type: 'number_integer', value: String(p.minSubscriptionMonths) })
  if (p.cost != null) mf.push({ namespace: 'chrgd', key: 'cost', type: 'number_decimal', value: String(p.cost) })
  if (p.recommendationBasis) mf.push({ namespace: 'chrgd', key: 'recommendation_basis', type: 'single_line_text_field', value: p.recommendationBasis })
  if (p.effectOnset) mf.push({ namespace: 'chrgd', key: 'effect_onset', type: 'single_line_text_field', value: p.effectOnset })
  return mf
}

async function adminFetch(path: string, options: RequestInit & { method?: string } = {}) {
  const { base, token } = adminConfig()
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
  })
  if (!res.ok) throw new Error(`Shopify ${options.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

/** Write a product's tags + chrgd.* metafields to Shopify. */
export async function writeProductConfig(product: CatalogueProduct): Promise<void> {
  const id = numericId(product.shopifyProductId)
  if (!id) throw new Error(`Product ${product.id} has no Shopify id`)

  // Merge managed tags with any existing unmanaged tags on the product.
  const current = await adminFetch(`/products/${id}.json?fields=id,tags`)
  const existing: string[] = current.product?.tags ? current.product.tags.split(', ').filter(Boolean) : []
  const preserved = existing.filter((t) => !MANAGED_PREFIXES.some((p) => t === p || t.startsWith(p)))
  const tags = [...new Set([...preserved, ...buildTags(product)])].sort().join(', ')

  await adminFetch(`/products/${id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product: { id: Number(id), tags } }),
  })

  for (const mf of buildMetafields(product)) {
    await adminFetch(`/products/${id}/metafields.json`, {
      method: 'POST',
      body: JSON.stringify({ metafield: { ...mf, owner_resource: 'product', owner_id: Number(id) } }),
    })
  }
}

/**
 * Delete a product from Shopify by its product GID (or numeric id). Used by the
 * Founders Hub product dashboard's "Remove" action when running live.
 */
export async function deleteProduct(shopifyProductId: string | null): Promise<void> {
  const id = numericId(shopifyProductId)
  if (!id) throw new Error('Product has no Shopify id to delete')
  await adminFetch(`/products/${id}.json`, { method: 'DELETE' })
}

/**
 * Create a product in Shopify from a catalogue product, for pushing something we
 * added here into a live store. Maps the catalogue's variants → Shopify variants (Flavour option, price,
 * compare-at, SKU), sets description/category/tags, and attaches the image.
 * Returns the new product GID + per-variant GIDs so callers can persist them.
 */
export async function createProduct(product: CatalogueProduct): Promise<{
  shopifyProductId: string
  variantIds: Record<string, string>
}> {
  const hasFlavours = product.variants.some((v) => v.flavour)
  const payload = {
    product: {
      title: product.title,
      body_html: product.description,
      product_type: product.category,
      tags: buildTags(product).join(', '),
      status: 'draft' as const,
      ...(hasFlavours ? { options: [{ name: 'Flavour' }] } : {}),
      variants: product.variants.map((v) => ({
        ...(v.flavour ? { option1: v.flavour } : {}),
        price: String(v.price),
        ...(v.compareAtPrice != null ? { compare_at_price: String(v.compareAtPrice) } : {}),
        ...(v.sku ? { sku: v.sku } : {}),
      })),
      ...(product.imageUrl ? { images: [{ src: product.imageUrl }] } : {}),
    },
  }

  const created = await adminFetch('/products.json', { method: 'POST', body: JSON.stringify(payload) })
  const newId: number = created.product.id
  const gid = `gid://shopify/Product/${newId}`

  // Map our variant ids → the created Shopify variant GIDs, by position.
  const variantIds: Record<string, string> = {}
  const createdVariants: { id: number }[] = created.product?.variants ?? []
  product.variants.forEach((v, i) => {
    const cv = createdVariants[i]
    if (cv) variantIds[v.id] = `gid://shopify/ProductVariant/${cv.id}`
  })

  // Push the chrgd.* metafields so the new product is launch-ready.
  for (const mf of buildMetafields({ ...product, shopifyProductId: gid })) {
    await adminFetch(`/products/${newId}/metafields.json`, {
      method: 'POST',
      body: JSON.stringify({ metafield: { ...mf, owner_resource: 'product', owner_id: newId } }),
    })
  }

  return { shopifyProductId: gid, variantIds }
}
