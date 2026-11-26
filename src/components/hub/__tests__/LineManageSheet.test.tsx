import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LineManageSheet } from '../LineManageSheet'
import { createMockSubscription } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { MemberSubscription } from '@/lib/recharge/types'

/**
 * One product, everything a member does with it. Each control has to do what it
 * says: the old sheet's "Get one now" showed a charge and only closed, and its
 * one control ("how much do you get through?") meant nothing on a shop basket.
 */

const plan = () => createMockSubscription(MOCK_CATALOGUE, 'member@example.com')
const preWorkout = (sub: MemberSubscription) => sub.lines.find((l) => l.productTitle.includes('Pre-Workout'))!

const QUOTE_DATE = '2027-01-15T00:00:00.000Z'

function renderSheet(sub: MemberSubscription = plan(), over: { quote?: unknown } = {}) {
  const line = preWorkout(sub)
  const handlers = {
    onReviewSchedule: jest.fn(),
    onSkip: jest.fn(),
    onAddToNextBox: jest.fn().mockResolvedValue({ ok: true, message: 'Added to your box on Fri 15 January.' }),
    onRemove: jest.fn(),
    onClose: jest.fn(),
  }
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => over.quote ?? { quote: { price: 21.24, box: { id: '2027-01', date: QUOTE_DATE } }, refusal: null },
  }) as unknown as typeof fetch
  render(<LineManageSheet subscription={sub} line={line} product={MOCK_CATALOGUE.find((p) => p.id === line.productId)} {...handlers} />)
  return { line, ...handlers }
}

describe('LineManageSheet', () => {
  it('says how often it comes, when the next one is and how long one lasts', () => {
    renderSheet()
    const facts = within(document.querySelector<HTMLElement>('[data-line-facts]')!)
    expect(facts.getByText(/^Every 3 months/)).toHaveTextContent(/next one/)
    // Pre-workout at one scoop a session lasts about 2½ months.
    expect(screen.getByText('One lasts you about 11 weeks.')).toBeInTheDocument()
  })

  it('says plainly when the rhythm runs out before the next one, and when it doesn’t', async () => {
    renderSheet()
    expect(screen.getByText(/You’d run out about 2 weeks before each one comes/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Every 2 months' }))
    expect(screen.getByText(/You’ll have about 2 weeks spare each time/)).toBeInTheDocument()
  })

  it('reviews a new how often and how many, with the new monthly, before anything changes', async () => {
    const sub = plan()
    const { onReviewSchedule } = renderSheet(sub)
    const review = screen.getByRole('button', { name: /Review change/ })
    expect(review).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: 'Every 2 months' }))
    await userEvent.click(screen.getByRole('button', { name: 'One more' }))
    expect(screen.getByText(/your monthly/)).toHaveTextContent(new RegExp(`£${sub.flatMonthly.toFixed(2)} →`))
    expect(review).toBeEnabled()

    await userEvent.click(review)
    expect(onReviewSchedule).toHaveBeenCalledWith({ every: 2, quantity: 2 })
  })

  it('puts one in the next box for real, at the price the server quotes', async () => {
    const { onAddToNextBox } = renderSheet()
    const add = await screen.findByRole('button', { name: 'Add one to your next box' })
    expect(screen.getByText(/£21\.24, added to the payment for your box on/)).toBeInTheDocument()
    expect(screen.getByText(/Your usual ones still come every 3 months/)).toBeInTheDocument()
    await userEvent.click(add)
    expect(onAddToNextBox).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Added to your box on Fri 15 January.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Added' })).toBeDisabled()
  })

  it('says why one can’t go in the next box, when it can’t', async () => {
    renderSheet(plan(), { quote: { quote: null, refusal: { reason: 'full', error: 'Your next box already has 8 extras in it.' } } })
    expect(await screen.findByText('Your next box already has 8 extras in it.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add one to your next box' })).toBeNull()
  })

  it('skips the next one, saying which box and what comes off', async () => {
    const sub = plan()
    const { onSkip, line } = renderSheet(sub)
    expect(screen.getByText(new RegExp(`£${line.pricePerDelivery.toFixed(2)} comes off your next payment`))).toBeInTheDocument()
    expect(screen.getByText(/The one after comes on/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Skip the next one' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('offers no next-box moves on a paused plan', async () => {
    renderSheet({ ...plan(), status: 'paused' })
    expect(screen.queryByRole('button', { name: 'Skip the next one' })).toBeNull()
    expect(screen.queryByText('Need one sooner?')).toBeNull()
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled())
  })
})
