import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StackReviewPage } from '../StackReviewPage'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { invalidateCatalogue } from '@/lib/catalogue/load'
import { useQuizStore } from '@/lib/store'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { defaultAnswers } from '@/lib/quiz-answers'
import type { QuizAnswers } from '@/lib/types'
import { resetOfferSettings } from '@/hooks/useOfferSettings'
import { publicOffer } from '@/lib/offer/public'
import { DEFAULT_OFFER, type OfferSettings } from '@/lib/offer/settings'
import { allOn } from '@/lib/offer/__tests__/fixtures'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The results page's offer (plan Phase 4), wired into the page: "Start here"
 * first with the hero, the full stack under it with the hero leading every
 * depth, the sticky bar following whichever was chosen, the free bonus never
 * said without its conditions, and switching it on or off moving no price.
 */

const answers = {
  ...defaultAnswers,
  name: 'Alex',
  track: 'performance',
  goals: ['muscle'],
  trainingFrequency: '3-4x',
  budget: '50-80',
  diet: 'mostly-good',
  caffeineLevel: 'medium',
  stimPreference: 'yes',
} as QuizAnswers

let offer: OfferSettings = DEFAULT_OFFER
let code: { discountPct: number } | null = null

function respond(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body })
}

beforeEach(() => {
  invalidateCatalogue()
  resetOfferSettings()
  code = null
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/api/offer')) return respond({ offer })
    if (u.includes('/api/checkout-promo')) return respond({ promo: null })
    if (u.includes('/api/competition')) return respond({ state: 'off' })
    if (u.includes('/api/partner-code')) {
      const typed = String(JSON.parse(String(init?.body ?? '{}')).code ?? '').toUpperCase()
      return respond(code ? { ok: true, code: typed, partnerName: null, ...code } : { ok: false, reason: 'Nope' })
    }
    return respond({ products: MOCK_CATALOGUE, source: 'mock' })
  }) as unknown as typeof fetch
  act(() => {
    useQuizStore.setState({ answers, stackBlueprint: buildStackBlueprint(answers, MOCK_CATALOGUE), stackLevel: 'performance', planType: 'oneoff' })
  })
})

afterEach(() => {
  act(() => useQuizStore.setState({ answers: defaultAnswers, stackBlueprint: null }))
  document.cookie = 'partner_ref=; path=/; max-age=0'
})

const shown = (o: OfferSettings) => publicOffer(o, MOCK_CATALOGUE, { bonusShown: true })
// Every depth over the minimum, so the bonus is on whichever one is chosen.
const everything = () => shown(allOn({ minSubtotal: 1 }))

function stickyBar(): HTMLElement {
  return document.querySelector<HTMLElement>('div.fixed.inset-x-0.bottom-0')!
}

function receiptTotal(): string {
  const label = screen.getByText('Total', { selector: 'span' })
  return label.closest('div.flex')?.parentElement?.textContent ?? ''
}

it('starts with the hero, labelled, and the bar follows it until a depth is chosen', async () => {
  offer = everything()
  render(<StackReviewPage reducedMotion />)
  // The single-product offer's own card, moved up and led by "Start here".
  const core = await screen.findByRole('region', { name: /Start here.*Not the obvious pick/ })
  // The last-chance card at the foot is gone: its offer is now the first thing.
  expect(screen.queryByText(/Not ready for the whole stack/)).not.toBeInTheDocument()

  const heroTitle = within(core).getByRole('heading', { level: 3 }).textContent!
  expect(within(core).getByRole('button', { name: /Start with this/ })).toBeInTheDocument()
  expect(screen.getByText('Or get the full stack', { selector: 'p' })).toBeInTheDocument()
  expect(within(core).getByRole('button', { name: 'Or get the full stack' })).toBeInTheDocument()

  await waitFor(() => expect(stickyBar()).toHaveTextContent('Start with this →'))
  expect(stickyBar()).toHaveTextContent(/Start here/)

  await userEvent.click(screen.getByRole('button', { name: /^Complete/ }))
  await waitFor(() => expect(stickyBar()).toHaveTextContent('Checkout →'))
  expect(screen.getByRole('button', { name: /^Complete/ })).toHaveAttribute('aria-pressed', 'true')
  // The receipt lists the chosen depth in order: the hero first.
  const order = screen.getByText(/^Your order ·/).nextElementSibling as HTMLElement
  expect(order.querySelector('.line-clamp-2')).toHaveTextContent(heroTitle)
})

it('never says "free" about the gift without its conditions and the terms beside it', async () => {
  offer = everything()
  render(<StackReviewPage reducedMotion />)
  const note = await screen.findByText(/^Comes with a free /)
  const box = note.closest('[data-bonus-note]') as HTMLElement
  expect(box).toHaveTextContent(/First order only, one per customer\. Stacks from £1\.00 before any discount\. While stocks last\./)
  expect(within(box).getByRole('link', { name: 'Free gift terms' })).toHaveAttribute('href', '/legal/free-gift')

  const line = document.querySelector('[data-receipt-bonus]') as HTMLElement
  expect(line).toHaveTextContent(/^Free: .*£0\.00$/)
  expect(within(line).getByRole('link', { name: 'Free gift terms' })).toBeInTheDocument()

  // Every other "free" on the page is about delivery or a starter, and says so.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const loose: string[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? ''
    if (!/\bfree\b/i.test(text) || /free (UK mainland )?delivery|delivery is free|Free$|free order|starter/i.test(text)) continue
    if (n.parentElement?.closest('[data-bonus-note], [data-receipt-bonus]')) continue
    loose.push(text)
  }
  expect(loose).toEqual([])
})

it('moves no price: the receipt is the same with the bonus on and off', async () => {
  offer = everything()
  const first = render(<StackReviewPage reducedMotion />)
  await screen.findByText(/^Comes with a free /)
  const withBonus = receiptTotal()
  first.unmount()

  resetOfferSettings()
  offer = shown({ ...allOn({ minSubtotal: 1 }), bonus: { ...allOn().bonus, enabled: false } })
  render(<StackReviewPage reducedMotion />)
  await screen.findByText('Not the obvious pick')
  expect(screen.queryByText(/^Comes with a free /)).not.toBeInTheDocument()
  expect(document.querySelector('[data-receipt-bonus]')).toBeNull()
  expect(receiptTotal()).toBe(withBonus)
})

it('says "Free … on stacks from £…" on a depth under the minimum', async () => {
  offer = shown(allOn({ minSubtotal: 1_000 }))
  render(<StackReviewPage reducedMotion />)
  await screen.findByText('Not the obvious pick')
  // No depth reaches £1,000, so no bonus anywhere, and nothing to point at.
  expect(document.querySelector('[data-bonus-note]')).toBeNull()
})

it('keeps the gift and takes off a code worth less, saying why', async () => {
  offer = everything()
  code = { discountPct: 0.01 }
  render(<StackReviewPage reducedMotion />)
  await screen.findByText(/^Comes with a free /)
  await userEvent.click(screen.getByRole('button', { name: /got a discount code/i }))
  await userEvent.type(screen.getByPlaceholderText('Discount code'), 'SMALL1')
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(await screen.findByText(/^Not applied: the free .* is worth more on this order/)).toBeInTheDocument()
  expect(document.querySelector('[data-receipt-bonus]')).not.toBeNull()
})

it('gives the code when it is worth more, and the receipt says so', async () => {
  offer = everything()
  code = { discountPct: 0.25 }
  render(<StackReviewPage reducedMotion />)
  await screen.findByText(/^Comes with a free /)
  await userEvent.click(screen.getByRole('button', { name: /got a discount code/i }))
  await userEvent.type(screen.getByPlaceholderText('Discount code'), 'BIG25')
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(await screen.findByText(/^Your code is worth more than the free .*, so you’ve got the code\.$/)).toBeInTheDocument()
  expect(document.querySelector('[data-receipt-bonus]')).toBeNull()
})

it('is their top pick with the hero switch off, and no bonus with it off', async () => {
  offer = DEFAULT_OFFER
  render(<StackReviewPage reducedMotion />)
  expect(await screen.findByText('Your top pick')).toBeInTheDocument()
  expect(screen.queryByText('Not the obvious pick')).not.toBeInTheDocument()
  expect(document.querySelector('[data-bonus-note]')).toBeNull()
})
