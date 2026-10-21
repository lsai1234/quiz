import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShopAlaCarte } from '../ShopAlaCarte'
import { useBasket } from '@/lib/basket/store'
import { readStackHandoff } from '@/lib/shop/stack-handoff'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

// A plain anchor: jsdom cannot navigate, and the handoff is what is under test.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, onClick, children, ...rest }: { href: string; onClick?: () => void; children: ReactNode }) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
}))

/**
 * The door from the stack to the shop. What it says before they go has to be
 * what is actually true of the code on the stack: a partner's code stays
 * behind, a store code goes with them (if they enter it), and the bundle deal
 * holds while the basket stays over its threshold.
 */

const threshold = getPricingConfig().bundleTiers[0].minSubtotal!
const LINES = [
  { productId: 'p1', variantId: 'v1', price: threshold / 2 },
  { productId: 'p2', variantId: 'v2', price: threshold / 2 + 5 },
]

beforeEach(() => {
  sessionStorage.clear()
  useBasket.getState().clear()
})

async function open(props: Partial<Parameters<typeof ShopAlaCarte>[0]> = {}) {
  render(<ShopAlaCarte lines={LINES} partnerDiscountPct={0} {...props} />)
  await userEvent.click(screen.getByRole('button', { name: /prefer to buy these separately/i }))
}

it('no longer says the stack stays saved', async () => {
  await open({ partnerDiscountPct: 20, code: 'SARAH20', codeKind: 'partner' })
  expect(screen.queryByText(/stays saved|come back to it whenever/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /never mind/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /take me to the shop/i })).toBeInTheDocument()
})

it('says a partner’s code stays behind, and records it for the shop’s bar', async () => {
  await open({ partnerDiscountPct: 20, code: 'SARAH20', codeKind: 'partner' })
  expect(screen.getByText(/SARAH20 works on stacks and subscriptions, not single products, so its 20% off won’t apply in the shop/)).toBeInTheDocument()
  expect(screen.getByText(/the shop takes \d+(\.\d)?% off when your basket is £\d+ or more/i)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('link', { name: /take me to the shop/i }))
  expect(useBasket.getState().lines).toHaveLength(2)
  expect(readStackHandoff()).toEqual({ items: 2, discountPct: 0.2 })
})

it('says a store code works on single products, and does not record it as lost', async () => {
  await open({ partnerDiscountPct: 25, code: 'IGNITE25', codeKind: 'store' })
  expect(screen.getByText(/IGNITE25 works on single products too/)).toBeInTheDocument()
  expect(screen.queryByText(/won’t apply in the shop|applies to this stack/)).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('link', { name: /take me to the shop/i }))
  expect(readStackHandoff()).toEqual({ items: 2, discountPct: 0 })
})

it('shows no caveat when nothing changes', async () => {
  await open({ lines: [{ productId: 'p1', variantId: 'v1', price: threshold - 10 }] })
  expect(screen.getByText(/we’ll put it in your shop basket/i)).toBeInTheDocument()
  expect(screen.queryByText(/% off/)).not.toBeInTheDocument()
})
