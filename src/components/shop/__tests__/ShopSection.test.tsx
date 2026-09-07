import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { ShopCategory } from '@/lib/shop/categories'
import { ShopSection } from '../ShopSection'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, ...over }
}

function makeProduct(n: number, over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: `p${n}`, title: `Protein ${n}`, handle: `p${n}`, description: '', imageUrl: null,
    category: 'Protein', stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [],
    formats: ['powder'], variants: [variant({ id: `v${n}` })], basePrice: 30, compareAtPrice: null,
    subscriptionEligible: true, servings: 30, swapGroup: 'protein-whey', recommendationPriority: 5,
    marginPriority: 5, isCoreEligible: true, isBoosterEligible: false, hasStimulants: false,
    shortReason: '', warnings: [], ...over,
  }
}

function section(count: number): ShopCategory {
  return {
    category: 'Protein',
    slug: 'protein',
    products: Array.from({ length: count }, (_, i) => makeProduct(i + 1)),
  }
}

describe('a shop shelf', () => {
  /*
    Two rows of a two-column grid, and no more. A shelf that runs its full
    length is seven rows of scrolling before the next heading, and the shelf
    below it is, for most people, not on the page at all.
  */
  it('shows two rows and offers the rest', async () => {
    render(<ShopSection section={section(9)} />)

    expect(screen.getAllByRole('link', { name: /Protein \d/ })).toHaveLength(4)
    const more = screen.getByRole('button', { name: 'Show all 9 protein' })

    await userEvent.click(more)
    expect(screen.getAllByRole('link', { name: /Protein \d/ })).toHaveLength(9)
    // …and it closes again, because opening every shelf on the way down the
    // page should not be a one-way door.
    await userEvent.click(screen.getByRole('button', { name: 'Show less protein' }))
    expect(screen.getAllByRole('link', { name: /Protein \d/ })).toHaveLength(4)
  })

  it('offers nothing when the shelf is already all there', () => {
    render(<ShopSection section={section(4)} />)

    expect(screen.getAllByRole('link', { name: /Protein \d/ })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('says how many the shelf holds, not how many are on screen', () => {
    render(<ShopSection section={section(9)} />)
    expect(screen.getByText('9 products')).toBeInTheDocument()
  })
})
