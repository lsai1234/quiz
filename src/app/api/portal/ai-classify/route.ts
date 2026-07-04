import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { getDataSource } from '@/lib/data-source'
import { setProductOverride } from '@/lib/portal/store'
import { productReadiness } from '@/lib/portal/readiness'
import { aiClassifyProduct, gapPatch } from '@/lib/portal/ai-classify'

/**
 * Auto-sort not-ready products with AI.
 * Body: { ids?: string[], apply?: boolean }
 *   - ids omitted → all products that aren't launch-ready
 *   - apply (default true) → write the gap-fill; false → return suggestions only
 */
export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { ids?: string[]; apply?: boolean }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const apply = body.apply !== false
  const { products, source } = await getResolvedCatalogue()
  const live = source === 'shopify'

  const targets = body.ids
    ? products.filter((p) => body.ids!.includes(p.id))
    : products.filter((p) => productReadiness(p, { live }).overall !== 'ok')

  const results: { id: string; title: string; suggestion: Record<string, unknown>; current: Record<string, unknown>; patch: Record<string, unknown>; applied: boolean; source: string; error?: string }[] = []
  let usedAI = false

  for (const product of targets) {
    const { patch: suggestion, source: src } = await aiClassifyProduct(product)
    if (src === 'ai') usedAI = true
    const patch = gapPatch(product, suggestion) // only-missing, for the editor's quick fill
    let applied = false
    let error: string | undefined
    if (apply) {
      if (Object.keys(patch).length > 0) {
        await setProductOverride(product.id, patch)
        applied = true
        if (getDataSource() === 'shopify' && product.shopifyProductId) {
          try {
            const { writeProductConfig } = await import('@/lib/shopify/admin')
            await writeProductConfig({ ...product, ...patch })
          } catch (err) {
            error = err instanceof Error ? err.message : String(err)
          }
        }
      }
    }
    results.push({
      id: product.id,
      title: product.title,
      // Full classification (for the review panel) + the product's current key values for comparison.
      suggestion: suggestion as Record<string, unknown>,
      current: {
        stackSlots: product.stackSlots, goals: product.goals, swapGroup: product.swapGroup,
        subscriptionEligible: product.subscriptionEligible,
      },
      patch: patch as Record<string, unknown>,
      applied,
      source: src,
      error,
    })
  }

  return NextResponse.json({ usedAI, count: results.length, fixed: results.filter((r) => r.applied).length, results })
}
