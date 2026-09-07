import { expect, type Page } from '@playwright/test'
import { founderSessionViaApi } from './accounts'

/**
 * Putting a bundle on sale.
 *
 * A bundle is two records: a PRE-BUILT BUNDLE is a named stack of products, and
 * a WORKOUT BUNDLE is a session plus one of those stacks. The shipped seeds are
 * workout bundles with no stack chosen — which stack each one sells is decided
 * in the Hub against the live range, not in the repository — so a test that
 * wants a buyable bundle page has to make that link first, exactly as a founder
 * would.
 *
 * Both calls are idempotent enough to run per test: creating the stack a second
 * time is refused and ignored, and linking is a plain edit.
 */
const STACK_SLUG = 'e2e-strength'

const SLOTS: Array<[productId: string, slotType: string, swapGroup: string, title: string]> = [
  ['chrgd-electrolytes', 'hydration', 'electrolytes', 'Hydration'],
  ['chrgd-creatine', 'performance', 'creatine', 'Performance'],
  ['chrgd-whey-protein', 'protein', 'protein-whey', 'Protein'],
]

/** Create the stack, unless a previous test in this run already did. */
export async function ensureStack(page: Page): Promise<void> {
  const res = await page.request.post('/api/portal/product-bundles', {
    data: {
      action: 'create',
      bundle: {
        slug: STACK_SLUG,
        name: 'E2E Strength',
        description: 'Electrolytes, creatine and protein.',
        addOns: [],
        blueprint: {
          id: `bundle-${STACK_SLUG}`,
          stackName: 'E2E Strength',
          summary: 'Three products.',
          primaryGoal: 'recovery',
          secondaryGoals: [],
          userProfileSummary: 'E2E',
          estimatedOneOffPrice: 0,
          estimatedSubscriptionPrice: 0,
          savingsSummary: '',
          createdAt: new Date().toISOString(),
          slots: SLOTS.map(([productId, slotType, swapGroup, title], i) => ({
            slotId: `e2e-${slotType}`,
            slotType,
            title,
            description: title,
            recommendedProductId: productId,
            selectedProductId: productId,
            selectedVariantId: null,
            required: true,
            canRemove: false,
            canSwap: false,
            swapGroup,
            reason: 'Part of the stack.',
            confidenceScore: 90,
            displayOrder: i,
          })),
        },
      },
    },
  })
  // "already exists" is success for our purposes — the stack is there either way.
  if (!res.ok()) {
    const body = await res.text()
    expect(body, `creating the stack failed: ${body}`).toContain('already exists')
  }
}

/** Point a workout bundle at that stack and publish it. */
export async function sellBundle(page: Page, slug: string): Promise<void> {
  await founderSessionViaApi(page)
  await ensureStack(page)
  const res = await page.request.post('/api/portal/bundles', {
    data: { action: 'edit', slug, patch: { productBundleSlug: STACK_SLUG, published: true } },
  })
  expect(res.ok(), `linking ${slug} failed: ${await res.text()}`).toBe(true)
}

/** Take a workout bundle off sale by unlinking it, the way a seed ships. */
export async function unlinkBundle(page: Page, slug: string): Promise<void> {
  await founderSessionViaApi(page)
  const res = await page.request.post('/api/portal/bundles', {
    data: { action: 'edit', slug, patch: { productBundleSlug: null, published: true } },
  })
  expect(res.ok(), `unlinking ${slug} failed: ${await res.text()}`).toBe(true)
}
