import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { EMPTY_QUERY, applyShopQuery, type ShopQuery } from '@/lib/shop/shop-query'
import { ShopFilterSheet } from '../ShopFilterSheet'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, ...over }
}

function makeProduct(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [variant()], basePrice: 30, compareAtPrice: null, subscriptionEligible: true,
    servings: 30, swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5,
    isCoreEligible: true, isBoosterEligible: false, hasStimulants: false, shortReason: '',
    warnings: [], ...over,
  }
}

const PRODUCTS = [
  makeProduct({ id: 'whey', title: 'Whey', category: 'Protein', variants: [variant({ price: 34.99 })] }),
  makeProduct({
    id: 'plant', title: 'Plant', category: 'Protein', dietaryTags: ['vegan'],
    variants: [variant({ price: 29.99, compareAtPrice: 39.99 })],
  }),
  makeProduct({
    id: 'salts', title: 'Salts', category: 'Hydration', dietaryTags: ['vegan'],
    stackSlots: ['hydration'], goals: ['hydration'], formats: ['powder', 'effervescent'],
    variants: [variant({ price: 18.99, available: false })],
  }),
]

/** A host that applies changes live, the way the shell does. */
function Host({ onClose = () => {} }: { onClose?: () => void }) {
  const [query, setQuery] = useState<ShopQuery>(EMPTY_QUERY)
  const count = applyShopQuery(PRODUCTS, query).products.length
  return (
    <ShopFilterSheet
      products={PRODUCTS}
      query={query}
      resultCount={count}
      onChange={setQuery}
      onClose={onClose}
    />
  )
}

const chip = (name: RegExp | string) => screen.getByRole('button', { name })

describe('ShopFilterSheet', () => {
  it('is a labelled modal dialog', () => {
    render(<Host />)
    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveAttribute('aria-modal', 'true')
  })

  it('offers every sort the shop supports', () => {
    render(<Host />)
    for (const label of ['Best match', 'Featured', 'Price: low to high', 'Top rated', 'Biggest saving']) {
      expect(chip(label)).toBeInTheDocument()
    }
    expect(chip('Best match')).toHaveAttribute('aria-pressed', 'true')
  })

  it('applies live — the footer count is the feedback, so it must move', async () => {
    render(<Host />)
    expect(chip(/Show 3 results/)).toBeInTheDocument()
    await userEvent.click(chip(/^Vegan/))
    expect(chip(/Show 2 results/)).toBeInTheDocument()
  })

  it('says "No results" rather than "Show 0 results"', async () => {
    render(<Host />)
    // Reached through the price box, not the chips: a zero-count chip is
    // disabled, so no sequence of taps can arrive at an empty shop.
    await userEvent.type(screen.getByLabelText('Max price'), '1')
    await userEvent.tab()
    expect(chip('No results')).toBeInTheDocument()
  })

  it('shows a count beside each facet option', () => {
    render(<Host />)
    expect(chip(/^Protein 2$/)).toBeInTheDocument()
    expect(chip(/^Hydration 1$/)).toBeInTheDocument()
    expect(chip(/^In stock 2$/)).toBeInTheDocument()
    expect(chip(/^On offer 1$/)).toBeInTheDocument()
  })

  it('counts each facet with its OWN constraint removed, so the panel is never a dead end', async () => {
    render(<Host />)
    await userEvent.click(chip(/^Protein 2$/))
    // Hydration must still offer the 1 you would get by switching to it. Showing
    // 0 here would leave Clear all as the only way out.
    expect(chip(/^Hydration 1$/)).toBeInTheDocument()
  })

  it('disables an option with nothing behind it rather than hiding it', async () => {
    render(<Host />)
    await userEvent.click(chip(/^Hydration 1$/))
    // Nothing in Hydration is discounted, so "On offer" would empty the shop.
    expect(chip(/^On offer 0$/)).toBeDisabled()
    // Its own facet is unaffected — Protein still offers the 2 you would get by
    // switching to it, which is what stops the panel becoming a dead end.
    expect(chip(/^Protein 2$/)).toBeEnabled()
    // And the option you picked stays live, or you could not switch it off.
    expect(chip(/^Hydration 1$/)).toBeEnabled()
  })

  it('takes a price bound on blur and treats an empty box as no bound', async () => {
    render(<Host />)
    const max = screen.getByLabelText('Max price')
    await userEvent.type(max, '25')
    await userEvent.tab()
    expect(chip(/Show 1 result$/)).toBeInTheDocument()

    await userEvent.clear(max)
    await userEvent.tab()
    expect(chip(/Show 3 results/)).toBeInTheDocument()
  })

  it('ignores a price that is not a positive number', async () => {
    render(<Host />)
    const max = screen.getByLabelText('Max price')
    await userEvent.type(max, '-5')
    await userEvent.tab()
    expect(chip(/Show 3 results/)).toBeInTheDocument()
    expect(max).toHaveValue('')
  })

  it('clears every filter but keeps the search text', async () => {
    render(<Host />)
    await userEvent.click(chip(/^Vegan/))
    await userEvent.click(chip('Price: low to high'))
    expect(screen.getByRole('heading', { name: /Filters \(1\)/ })).toBeInTheDocument()

    await userEvent.click(chip('Clear all'))
    expect(screen.getByRole('heading', { name: 'Filters' })).toBeInTheDocument()
    expect(chip('Best match')).toHaveAttribute('aria-pressed', 'true')
  })

  it('disables Clear all when there is nothing to clear', () => {
    render(<Host />)
    expect(chip('Clear all')).toBeDisabled()
  })

  it('closes on the footer button, the header button and Escape', async () => {
    const onClose = jest.fn()
    render(<Host onClose={onClose} />)

    await userEvent.click(chip(/Show 3 results/))
    expect(onClose).toHaveBeenCalledTimes(1)

    // Exactly one control carries this name — the scrim is an unlabelled div,
    // so nothing else answers to "Close filters".
    await userEvent.click(screen.getByRole('button', { name: 'Close filters' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('reports each facet change for analytics', async () => {
    const onFacetApplied = jest.fn()
    render(
      <ShopFilterSheet
        products={PRODUCTS}
        query={EMPTY_QUERY}
        resultCount={3}
        onChange={() => {}}
        onFacetApplied={onFacetApplied}
        onClose={() => {}}
      />,
    )
    await userEvent.click(chip(/^Vegan/))
    expect(onFacetApplied).toHaveBeenCalledWith('dietary', 'vegan', true)

    await userEvent.click(chip('Top rated'))
    expect(onFacetApplied).toHaveBeenCalledWith('sort', 'rating', true)
  })
})
