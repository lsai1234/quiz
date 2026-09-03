import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { BasketNudge } from '@/lib/shop/basket-alchemy'
import { ShopBasketNudge } from '../ShopBasketNudge'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, ...over }
}

function makeProduct(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'magnesium', title: 'CHRGD Magnesium', handle: 'm', description: '', imageUrl: null,
    category: 'Sleep', stackSlots: ['sleep'], goals: ['sleep-better'], dietaryTags: [],
    formats: ['capsule'], variants: [variant()], basePrice: 30, compareAtPrice: null,
    subscriptionEligible: true, servings: 30, swapGroup: 'magnesium', recommendationPriority: 5,
    marginPriority: 5, isCoreEligible: true, isBoosterEligible: false, hasStimulants: false,
    shortReason: '', warnings: [], ...over,
  }
}

const BUNDLE: BasketNudge = {
  kind: 'bundle',
  key: 'bundle:recovery-stack',
  slug: 'recovery-stack',
  name: 'Recovery Stack',
  missing: [makeProduct()],
  have: 2,
  saving: 6.4,
}

const DELIVERY: BasketNudge = { kind: 'delivery', key: 'delivery', remaining: 4.2, threshold: 100 }

/** The common case: a bundle priced at exactly what its parts cost in the basket. */
const NO_EDGE: BasketNudge = { ...BUNDLE, saving: 0 }

describe('a bundle nudge', () => {
  it('names the bundle and what it saves against the parts', () => {
    render(<ShopBasketNudge nudge={BUNDLE} onAct={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/Recovery Stack — £6\.40 less as a bundle/)).toBeInTheDocument()
  })

  it('says how much of it the basket already has', () => {
    render(<ShopBasketNudge nudge={BUNDLE} onAct={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/You have 2 of its 3/)).toBeInTheDocument()
  })

  /**
   * The honesty constraint, pinned. A bundle checks out through a different path
   * from the shop basket: adding the missing product to the basket would NOT get
   * the bundle price, and buying the bundle does NOT empty the basket. Copy that
   * implied either would be a lie at the till.
   */
  it('never promises the basket a saving the basket will not give', () => {
    render(<ShopBasketNudge nudge={BUNDLE} onAct={() => {}} onDismiss={() => {}} />)
    const text = screen.getByRole('link').textContent ?? ''
    expect(text).not.toMatch(/add to basket/i)
    expect(text).toMatch(/less as a bundle/i)
  })

  it('says that bundles are bought separately', () => {
    render(<ShopBasketNudge nudge={BUNDLE} onAct={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/bought on their own page/i)).toBeInTheDocument()
  })

  /**
   * The saving is the bundle against the same products through the basket, after
   * the basket's own tier discount — so it is often zero, and "£0.00 less as a
   * bundle" would be absurd while a non-zero-looking claim would be advertising
   * the tier the shopper already earns.
   */
  it('leads on what the bundle IS when there is no price edge', () => {
    render(<ShopBasketNudge nudge={NO_EDGE} onAct={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/2 of the 3 in the Recovery Stack/)).toBeInTheDocument()
    expect(screen.queryByText(/less as a bundle/)).not.toBeInTheDocument()
    expect(screen.queryByText(/£0\.00/)).not.toBeInTheDocument()
  })

  it('names what is missing when it cannot lead on price', () => {
    render(<ShopBasketNudge nudge={NO_EDGE} onAct={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/Add CHRGD Magnesium for the full stack/)).toBeInTheDocument()
  })

  it('lists two missing products readably', () => {
    const two: BasketNudge = {
      ...NO_EDGE,
      missing: [makeProduct(), makeProduct({ id: 'creatine', title: 'CHRGD Creatine' })],
      have: 2,
    }
    render(<ShopBasketNudge nudge={two} onAct={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/CHRGD Magnesium and CHRGD Creatine/)).toBeInTheDocument()
  })

  it('links to the bundle and reports the click', async () => {
    const onAct = jest.fn()
    render(<ShopBasketNudge nudge={BUNDLE} onAct={onAct} onDismiss={() => {}} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/bundles/recovery-stack')
    await userEvent.click(link)
    expect(onAct).toHaveBeenCalled()
  })
})

describe('a delivery nudge', () => {
  it('says how far off free delivery the basket is', () => {
    render(<ShopBasketNudge nudge={DELIVERY} onAct={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText('£4.20 from free delivery')).toBeInTheDocument()
  })

  it('is not a link — there is nowhere to go, only more to add', () => {
    render(<ShopBasketNudge nudge={DELIVERY} onAct={() => {}} onDismiss={() => {}} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('dismissing', () => {
  it('is always available, on either kind', async () => {
    const onDismiss = jest.fn()
    const { rerender } = render(<ShopBasketNudge nudge={BUNDLE} onAct={() => {}} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss suggestion' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)

    rerender(<ShopBasketNudge nudge={DELIVERY} onAct={() => {}} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss suggestion' }))
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
