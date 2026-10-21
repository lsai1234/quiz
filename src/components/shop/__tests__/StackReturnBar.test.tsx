import { render, screen } from '@testing-library/react'
import { StackReturnBar } from '../StackReturnBar'
import { markCameFromStack } from '@/lib/shop/stack-handoff'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The bar in the shop that leads back to a stack. The stack is held in memory,
 * not saved, and the shop is not "full price" — the bundle deal and store codes
 * apply here too — so the bar says neither.
 */

beforeEach(() => sessionStorage.clear())

it('names a partner’s discount waiting on the stack, without claiming the stack is saved', async () => {
  markCameFromStack({ items: 3, discountPct: 0.2 })
  render(<StackReturnBar />)

  expect(await screen.findByText('Your stack')).toBeInTheDocument()
  expect(screen.getByText('3 products · 20% off there')).toBeInTheDocument()
  expect(screen.queryByText(/saved|full price/i)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /back to it/i })).toHaveAttribute('href', '/#stack')
})

it('names no discount when nothing was left behind', async () => {
  markCameFromStack({ items: 1, discountPct: 0 })
  render(<StackReturnBar />)

  expect(await screen.findByText('1 product')).toBeInTheDocument()
})
