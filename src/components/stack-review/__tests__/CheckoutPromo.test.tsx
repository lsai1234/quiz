import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutPromo, type Promo } from '../CheckoutPromo'

/**
 * The advertised code above the receipt. What matters: the saving it shows is
 * the one it was handed, a code with an end gives the day and nothing counts
 * down to it, and when that end passes with the page open the card stops
 * offering it.
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

it('shows this basket’s price with the code, and the day it is valid until', () => {
  setup()
  expect(screen.getByText('£77.97')).toBeInTheDocument()
  expect(screen.getByText(/£19\.59 less/i)).toBeInTheDocument()
  expect(screen.getByText('Valid until Tue 13 Oct.')).toBeInTheDocument()
  expect(screen.getByText('LAUNCH25', { selector: '.sr-only' })).toBeInTheDocument()
})

// A founder can move a store code's end, so it is not a final deadline: no
// clock, no time left, no "limited-time", and nothing on the card changes as
// the minutes pass.
it('has no countdown or pressure wording, and nothing ticks', () => {
  // The midnight closing Wed 28 Oct, London time.
  const { container } = setup({ promo: { code: 'AUTUMN15', percent: 15, endsAt: '2026-10-29T00:00:00.000Z' } })
  // Past the code's decode, which is the only thing on the card that moves.
  act(() => { jest.advanceTimersByTime(2000) })
  const text = container.textContent
  expect(text).not.toMatch(/limited|left|tonight|tomorrow|hurry|expires|last chance|one-time|\d+:\d\d/i)
  act(() => { jest.advanceTimersByTime(5 * 60_000) })
  expect(container.textContent).toBe(text)
})

it('applies through the page, and says why when it could not', async () => {
  const onApply = jest.fn().mockResolvedValue('That code has expired.')
  setup({ onApply })
  await userEvent.click(screen.getByRole('button', { name: /apply launch25 now/i }))
  expect(onApply).toHaveBeenCalled()
  expect(await screen.findByRole('alert')).toHaveTextContent('That code has expired.')
})

it('once applied, gives the new total and the day the code is valid until', async () => {
  const { props } = setup({ applied: true, before: 97.56, after: 77.97 })
  expect(screen.getByText(/launch25 applied/i)).toBeInTheDocument()
  expect(screen.getByText(/your total is now/i)).toHaveTextContent('£77.97')
  expect(screen.getByText('Valid until Tue 13 Oct.')).toBeInTheDocument()
  expect(screen.queryByText(/check out before/i)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /remove code/i }))
  expect(props.onRemove).toHaveBeenCalled()
})

it('gives no date when the code has no end', () => {
  setup({ promo: { code: 'OPEN15', percent: 15, endsAt: null } })
  expect(screen.getByText('Offer')).toBeInTheDocument()
  expect(screen.queryByText(/valid until/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /apply open15 now/i })).toBeInTheDocument()
})

it('stops offering the code the moment it ends, and tells the page once', () => {
  jest.setSystemTime(new Date('2026-10-13T22:59:58Z'))
  const { props } = setup({ applied: true })
  act(() => { jest.advanceTimersByTime(3000) })
  expect(props.onEnded).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toHaveTextContent('LAUNCH25 has ended, so it’s been taken off your order.')
  expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument()
})

it('says what happened as the code goes on and comes off, and moves focus to what undoes it', async () => {
  function Harness() {
    const [applied, setApplied] = useState(false)
    return (
      <CheckoutPromo
        promo={LAUNCH}
        before={97.56}
        after={77.97}
        scope="order"
        applied={applied}
        onApply={async () => { setApplied(true); return null }}
        onRemove={() => setApplied(false)}
        onEnded={() => {}}
      />
    )
  }
  render(<Harness />)

  await userEvent.click(screen.getByRole('button', { name: /apply launch25 now/i }))
  expect(screen.getByRole('status')).toHaveTextContent('LAUNCH25 applied. Your total is now £77.97.')
  expect(screen.getByRole('button', { name: /remove code/i })).toHaveFocus()

  await userEvent.click(screen.getByRole('button', { name: /remove code/i }))
  expect(screen.getByRole('status')).toHaveTextContent('LAUNCH25 removed.')
  expect(screen.getByRole('button', { name: /apply launch25 now/i })).toHaveFocus()
})

it('calls it a launch offer only when it is one', () => {
  const { unmount } = setup()
  expect(screen.getByText('Launch offer')).toBeInTheDocument()
  unmount()
  // An end date does not make it "limited-time": the end can be moved.
  setup({ promo: { code: 'AUTUMN15', percent: 15, endsAt: LAUNCH.endsAt } })
  expect(screen.getByText('Offer')).toBeInTheDocument()
  expect(screen.queryByText(/limited/i)).not.toBeInTheDocument()
})

it('for today’s code, says when the code is valid until — never that the discount ends', () => {
  setup({ promo: { code: 'SPARK25', percent: 25, endsAt: LAUNCH.endsAt, kind: 'daily' } })
  expect(screen.getByText('Today’s code')).toBeInTheDocument()
  expect(screen.getByText('This code is valid until Tue 13 Oct.')).toBeInTheDocument()
  expect(screen.queryByText(/offer ends|ends tonight|expires|left/i)).not.toBeInTheDocument()
})
