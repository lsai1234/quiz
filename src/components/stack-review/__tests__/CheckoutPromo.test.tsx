import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutPromo, type Promo } from '../CheckoutPromo'

/**
 * The advertised code above the receipt. What matters: the saving it shows is
 * the one it was handed, the countdown is to the code's real end, and when that
 * end passes with the page open the card stops offering it.
 */

// 16:00 in London on Tue 13 Oct; the code ends at the midnight closing that day.
const NOW = new Date('2026-10-13T15:00:00Z')
const LAUNCH: Promo = { code: 'LAUNCH25', percent: 25, endsAt: '2026-10-13T23:00:00.000Z' }

function setup(overrides: Partial<Parameters<typeof CheckoutPromo>[0]> = {}) {
  const props = {
    promo: LAUNCH,
    before: 97.56,
    after: 77.97,
    scope: 'order' as const,
    applied: false,
    onApply: jest.fn().mockResolvedValue(null),
    onRemove: jest.fn(),
    onEnded: jest.fn(),
    ...overrides,
  }
  return { props, ...render(<CheckoutPromo {...props} />) }
}

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true })
  jest.setSystemTime(NOW)
})
afterEach(() => jest.useRealTimers())

it('shows this basket’s price with the code, and how long is left to apply it', () => {
  setup()
  expect(screen.getByText('£77.97')).toBeInTheDocument()
  expect(screen.getByText(/£19\.59 less/i)).toBeInTheDocument()
  expect(screen.getByText(/ends tonight at midnight/i)).toHaveTextContent('8h 0m left to apply it')
  expect(screen.getByText('LAUNCH25', { selector: '.sr-only' })).toBeInTheDocument()
})

it('applies through the page, and says why when it could not', async () => {
  const onApply = jest.fn().mockResolvedValue('That code has expired.')
  setup({ onApply })
  await userEvent.click(screen.getByRole('button', { name: /apply launch25 now/i }))
  expect(onApply).toHaveBeenCalled()
  expect(await screen.findByRole('alert')).toHaveTextContent('That code has expired.')
})

it('once applied, gives the new total and says to check out before the deadline', async () => {
  const { props } = setup({ applied: true, before: 97.56, after: 77.97 })
  expect(screen.getByText(/launch25 applied/i)).toBeInTheDocument()
  expect(screen.getByText(/your total is now/i)).toHaveTextContent('£77.97')
  expect(screen.getByText(/ends tonight at midnight — check out before then/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /remove code/i }))
  expect(props.onRemove).toHaveBeenCalled()
})

it('has no countdown when the code has no end', () => {
  setup({ promo: { ...LAUNCH, endsAt: null } })
  expect(screen.queryByText(/left to apply/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /apply launch25 now/i })).toBeInTheDocument()
})

it('stops offering the code the moment it ends, and tells the page once', () => {
  jest.setSystemTime(new Date('2026-10-13T22:59:58Z'))
  const { props } = setup({ applied: true })
  act(() => { jest.advanceTimersByTime(3000) })
  expect(props.onEnded).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toHaveTextContent('LAUNCH25 has ended, so it’s been taken off your order.')
  expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument()
})
