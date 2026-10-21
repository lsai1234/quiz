import { fireEvent, render, screen } from '@testing-library/react'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { StatCard } from '../StatCard'
import { StackDeck } from '../StackDeck'
import { StackHero } from '../StackHero'
import { UpgradesCard } from '../UpgradesCard'
import { ProductSwapModal } from '../ProductSwapModal'

/**
 * The results page's product cards, after Phase 1 ("remove what isn't true").
 *
 * Each card used to say what a product does for you: a benefit tag ("Immune
 * Support"), "What it supports" bars, "+Sleep" chips, an onset promise ("Give
 * it 1–3 weeks to notice the difference"). Those are implied health claims.
 * These tests pin that they are gone and that the tag is the product type.
 */

const byGroup = (group: CatalogueProduct['swapGroup']) => MOCK_CATALOGUE.find((p) => p.swapGroup === group)!
const VITAMIN_C = byGroup('vitamin-c')
const MAGNESIUM = byGroup('magnesium')

/** A slot the way the engine builds an extra: its title is a benefit label. */
function slotFor(product: CatalogueProduct, over: Partial<StackSlotEntry> = {}): StackSlotEntry {
  return {
    slotId: `slot-extra-${product.id}`,
    slotType: 'health',
    title: 'Immune Support',
    description: 'Strengthens everyday immune resilience',
    recommendedProductId: product.id,
    selectedProductId: product.id,
    selectedVariantId: null,
    required: false,
    canRemove: true,
    canSwap: true,
    swapGroup: product.swapGroup,
    reason: 'Picked from your answers.',
    confidenceScore: 80,
    displayOrder: 0,
    ...over,
  }
}

describe('StatCard', () => {
  it('tags the card with the product type, not the slot title', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" />)
    expect(screen.getByText('Vitamin C')).toBeInTheDocument()
    expect(screen.queryByText('Immune Support')).not.toBeInTheDocument()
  })

  it('has no "What it supports" bars', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" />)
    expect(screen.queryByText('What it supports')).not.toBeInTheDocument()
    expect(screen.queryByText('✦')).not.toBeInTheDocument()
  })

  it('keeps the role line, the price and the way into the detail sheet', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={VITAMIN_C} planType="subscription" />)
    expect(screen.getByText('Strengthens everyday immune resilience')).toBeInTheDocument()
    expect(screen.getByText(/^£\d+\.\d{2}$/)).toBeInTheDocument()
    expect(screen.getByText('Tap for details ›')).toBeInTheDocument()
  })

  it('falls back to "Supplement", never the slot title, when the product is gone', () => {
    render(<StatCard slot={slotFor(VITAMIN_C)} product={undefined} planType="subscription" />)
    expect(screen.getByText('Supplement')).toBeInTheDocument()
    expect(screen.queryByText('Immune Support')).not.toBeInTheDocument()
  })
})

describe('ProductDetailSheet', () => {
  function openSheet(product: CatalogueProduct) {
    render(<StatCard slot={slotFor(product)} product={product} planType="subscription" />)
    fireEvent.click(screen.getByText('Tap for details ›'))
  }

  it('tags the sheet with the product type', () => {
    openSheet(VITAMIN_C)
    expect(screen.getByRole('heading', { name: VITAMIN_C.title })).toBeInTheDocument()
    expect(screen.getAllByText('Vitamin C').length).toBeGreaterThan(1)
    expect(screen.queryByText('Immune Support')).not.toBeInTheDocument()
  })

  it('makes no onset promise, in a sentence or as a fact', () => {
    openSheet(MAGNESIUM)
    expect(screen.getByText('The facts')).toBeInTheDocument()
    expect(screen.getByText('Format')).toBeInTheDocument()
    expect(screen.queryByText(/you.ll feel/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/notice the difference|expect to notice|from the first day|doing the work/i)).not.toBeInTheDocument()
  })
})

describe('StackDeck', () => {
  it('shows each card by product type, with no stat bars and no slot titles', () => {
    const slots = [slotFor(VITAMIN_C), slotFor(MAGNESIUM, { slotId: 'slot-sleep', title: 'Sleep', displayOrder: 1 })]
    render(<StackDeck slots={slots} products={MOCK_CATALOGUE} planType="subscription" />)
    expect(screen.getByText('Vitamin C')).toBeInTheDocument()
    expect(screen.getByText('Magnesium')).toBeInTheDocument()
    expect(screen.queryByText('What it supports')).not.toBeInTheDocument()
    expect(screen.queryByText('Sleep')).not.toBeInTheDocument()
  })
})

describe('StackHero', () => {
  it('has no "AI personalised" badge, even on a personalised stack', () => {
    render(<StackHero blueprint={{ ...MOCK_BLUEPRINT, personalised: true }} productCount={3} totalPrice={40} />)
    expect(screen.getByText('Your CHRGD Stack')).toBeInTheDocument()
    expect(screen.getByText(MOCK_BLUEPRINT.stackName)).toBeInTheDocument()
    expect(screen.queryByText(/AI personalised/i)).not.toBeInTheDocument()
  })
})

describe('UpgradesCard', () => {
  it('tags each add-on with its product type, not the goal it would add', () => {
    render(<UpgradesCard boosters={[MAGNESIUM]} onAdd={() => {}} />)
    expect(screen.getByText('Magnesium')).toBeInTheDocument()
    expect(screen.queryByText(/^\+(?!\s)/)).not.toBeInTheDocument()
    expect(screen.queryByText('Sleep')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument()
  })
})

describe('ProductSwapModal', () => {
  it('names the product type in the header and the sentence', () => {
    render(
      <ProductSwapModal
        slot={slotFor(VITAMIN_C)}
        currentProduct={VITAMIN_C}
        alternatives={[]}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Vitamin C')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Change your vitamin C' })).toBeInTheDocument()
    expect(screen.queryByText(/immune support/i)).not.toBeInTheDocument()
  })

  it('keeps an acronym or a letter-led type as written mid-sentence', () => {
    const zma = { ...MAGNESIUM, swapGroup: 'zma' as const }
    const bComplex = { ...MAGNESIUM, swapGroup: 'vitamin-b' as const }
    const { rerender } = render(
      <ProductSwapModal slot={slotFor(zma)} currentProduct={zma} alternatives={[]} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByRole('heading', { name: 'Change your ZMA' })).toBeInTheDocument()
    rerender(
      <ProductSwapModal slot={slotFor(bComplex)} currentProduct={bComplex} alternatives={[]} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByRole('heading', { name: 'Change your B-complex' })).toBeInTheDocument()
  })
})
