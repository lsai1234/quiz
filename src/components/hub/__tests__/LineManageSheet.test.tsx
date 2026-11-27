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
    onReviewChoice: jest.fn(),
    onOpenRoutine: jest.fn(),
    onSkip: jest.fn(),
    onAddToNextBox: jest.fn().mockResolvedValue({ ok: true, message: 'Added to your box on Fri 15 January.' }),
    onRemove: jest.fn(),
    onClose: jest.fn(),
  }
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => over.quote ?? { quote: { price: 21.24, box: { id: '2027-01', date: QUOTE_DATE } }, refusal: null },
  }) as unknown as typeof fetch
  render(<LineManageSheet subscription={sub} line={line} product={MOCK_CATALOGUE.find((p) => p.id === line.productId)} catalogue={MOCK_CATALOGUE} {...handlers} />)
  return { line, ...handlers }
}

describe('LineManageSheet', () => {
  it('says how often it comes, when the next one is, how long one lasts and what that’s worked out from', () => {
    renderSheet()
    const facts = within(document.querySelector<HTMLElement>('[data-line-facts]')!)
    // A 30-serving tub at about three training days a week lasts 2½ months: it comes in the box before it runs out.
    expect(facts.getByText(/^About every 11 weeks/)).toHaveTextContent(/next one/)
    expect(facts.getByText(/One lasts you about 11 weeks: 1 scoop each training day, about 3 days a week \(our estimate\)/)).toBeInTheDocument()
  })

  it('offers "when you’d run out" first, and says plainly what a rhythm they choose would do', async () => {
    renderSheet()
    expect(screen.getByRole('radio', { name: /About every 11 weeks/ })).toBeChecked()
    expect(screen.getByText('Each one comes about when you run out.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Every 3 months' }))
    expect(screen.getByText(/You’d run out about 2 weeks before each one comes/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Every 2 months' }))
    expect(screen.getByText(/You’ll have about 2 weeks spare each time/)).toBeInTheDocument()
  })

  it('reviews a chosen rhythm, with the new monthly, before anything changes', async () => {
    const sub = plan()
    const { onReviewChoice } = renderSheet(sub)
    const review = screen.getByRole('button', { name: /Review change/ })
    expect(review).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: 'Every 2 months' }))
    expect(screen.getByText(/your monthly/)).toHaveTextContent(new RegExp(`£${sub.flatMonthly.toFixed(2)} →`))
    expect(review).toBeEnabled()

    await userEvent.click(review)
    expect(onReviewChoice).toHaveBeenCalledWith(expect.objectContaining({ every: 2, quantity: 1, follows: false, usageLevel: 'standard' }))
  })

  it('refines the estimate: how much they take changes how long one lasts and when it comes', async () => {
    const { onReviewChoice, onOpenRoutine } = renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }))
    await userEvent.click(screen.getByRole('radio', { name: '2 scoops' }))
    // Twice as much each time: one lasts about 5 weeks, and "when you'd run out" follows.
    expect(screen.getByText(/One lasts you about 5 weeks: 2 scoops each training day/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /About every 5 weeks/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: /Review change/ }))
    expect(onReviewChoice).toHaveBeenCalledWith(expect.objectContaining({ usageLevel: 'heavy', every: 1.25, follows: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Change your routine' }))
    expect(onOpenRoutine).toHaveBeenCalled()
  })

  it('puts one in the next box for real, at the price the server quotes', async () => {
    const { onAddToNextBox } = renderSheet()
    const add = await screen.findByRole('button', { name: 'Add one to your next box' })
    expect(screen.getByText(/£21\.24, added to the payment for your box on/)).toBeInTheDocument()
    expect(screen.getByText(/Your usual ones still come about every 11 weeks/)).toBeInTheDocument()
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
