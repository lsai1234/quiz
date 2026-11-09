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
 * The results page's offer (plan Phase 4, then the clarity pass): "Your box",
 * every product Amp recommends with a switch, the hero first; the box opening
 * at or under £50; one button with the price the receipt charges; "Just want
 * one?" for the hero alone; the free bonus never said without its conditions,
 * and switching it on or off moving no price.
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

/** The free gift's line on the box's ladder, once the box comes with it. */
function giftRung(): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>('[data-rung="gift"][data-reached="true"]')
    expect(el).not.toBeNull()
    return el!
  })
}

function stickyBar(): HTMLElement {
  return document.querySelector<HTMLElement>('div.fixed.inset-x-0.bottom-0')!
}

function theBox(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-box]')!
}

const pounds = (text: string) => Number(/£([\d,]+\.\d\d)/.exec(text)?.[1].replace(',', ''))

function receiptTotal(): string {
  const label = screen.getByText('Total', { selector: 'span' })
  return label.closest('div.flex')?.parentElement?.textContent ?? ''
}

it('shows the member hub as a saving only while it is on sale on its own', async () => {
  offer = everything()
  const { unmount } = render(<StackReviewPage reducedMotion />)
  await screen.findByRole('region', { name: 'Your box' })
  expect(document.querySelector('[data-receipt-hub]')).toBeNull()
  expect(document.querySelector('[data-hub-card-value]')).toBeNull()
  unmount()

  resetOfferSettings()
  // On sale on its own: priced, switched on, and with the training plan in it to sell.
  const base = everything()
  offer = { ...base, services: { ...base.services, training: true }, hubPrice: { monthly: 10, standalone: true } }
  render(<StackReviewPage reducedMotion />)
  await screen.findByRole('region', { name: 'Your box' })
  const line = await waitFor(() => {
    const el = document.querySelector<HTMLElement>('[data-receipt-hub]')
    expect(el).not.toBeNull()
    return el!
  })
  expect(line).toHaveTextContent('Member hub · 90 days')
  expect(line).toHaveTextContent('£10.00 a month on its own · included')
  expect(line).toHaveTextContent(/£30\.00.*£0\.00/)
  expect(document.querySelector('[data-receipt-hub-save]')).toHaveTextContent('Your member hub saves you £30.00')
  expect(document.querySelector('[data-hub-card-value]')).toHaveTextContent(/£30\.00.*Free with your order.*no hub subscription/)
  expect(document.querySelector('[data-box-hub-line]')).toHaveTextContent('Includes 90 days of your member hub free, £30.00 on its own. No hub subscription, nothing to cancel.')
})

it('opens on the box: the hero first, under £50, one button with the receipt’s price', async () => {
  offer = everything()
  render(<StackReviewPage reducedMotion />)
  const box = await screen.findByRole('region', { name: 'Your box' })
  // No depths to choose between any more: the box is whatever is switched on.
  expect(screen.queryByRole('button', { name: /^(Essentials|Standard|Balanced|Complete)\b/ })).not.toBeInTheDocument()

  // The hero leads the list, and "Just want one?" buys it alone.
  const justOne = within(box).getByRole('button', { name: /^Just want one\? Start with the .* delivered$/ })
  const heroTitle = /Start with the (.+) · £/.exec(justOne.textContent!)![1]
  const rows = [...box.querySelectorAll<HTMLElement>('[data-box-row]')]
  expect(rows[0]).toHaveTextContent(heroTitle)
  // Every row says why it's there.
  for (const row of rows) expect(row.querySelector('button')!.textContent).toMatch(/\S+.*·\s*£/)

  // The box nobody chose opens at or under £50 at list price (£60 for a pair), never empty.
  const on = rows.filter((r) => r.dataset.on === 'true')
  expect(on.length).toBeGreaterThan(0)
  const list = on.reduce((sum, r) => sum + pounds(r.textContent!.split('·').pop()!), 0)
  expect(on.length === 1 || list <= (on.length === 2 ? 60.005 : 50.005)).toBe(true)
  expect(within(box).getByText(`${on.length} of ${rows.length} on`)).toBeInTheDocument()

  // One button, the receipt's total.
  const cta = box.querySelector<HTMLElement>('[data-box-cta]')!
  expect(cta).toHaveTextContent(/^Get my box · £/)
  expect(receiptTotal()).toContain(cta.textContent!.split('· ')[1])
  await waitFor(() => expect(stickyBar()).toHaveTextContent('Your box · one-off'))
  expect(stickyBar()).toHaveTextContent('Checkout →')

  // The receipt lists the box in order: the hero first.
  const order = screen.getByText(/^Your order ·/).nextElementSibling as HTMLElement
  expect(order.querySelector('.line-clamp-2')).toHaveTextContent(heroTitle)
})

it('switches a product off and back on, and every price follows at once', async () => {
  offer = everything()
  render(<StackReviewPage reducedMotion />)
  const box = await screen.findByRole('region', { name: 'Your box' })
  const cta = () => box.querySelector<HTMLElement>('[data-box-cta]')!.textContent!
  const before = cta()
  const onRows = [...box.querySelectorAll<HTMLElement>('[data-box-row][data-on="true"]')]
  const all = box.querySelectorAll('[data-box-row]').length
  const row = onRows[onRows.length - 1]
  const toggle = within(row).getByRole('switch')
  expect(toggle).toHaveAttribute('aria-checked', 'true')

  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(within(box).getByText(`${onRows.length - 1} of ${all} on`)).toBeInTheDocument()
  if (onRows.length > 1) {
    expect(pounds(cta())).toBeLessThan(pounds(before))
    expect(receiptTotal()).toContain(cta().split('· ')[1])
  }

  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(cta()).toBe(before)
})

it('adds a product switched on, and leaves every other switch where it was', async () => {
  offer = everything()
  render(<StackReviewPage reducedMotion />)
  const box = await screen.findByRole('region', { name: 'Your box' })
  const state = () => Object.fromEntries([...box.querySelectorAll<HTMLElement>('[data-box-row]')].map((r) => [r.dataset.boxRow, r.dataset.on]))
  const before = state()
  // "+ Add" on the deck's last card: a product that isn't in the box yet.
  await userEvent.click(screen.getAllByRole('button', { name: /\+ Add/ })[0])
  const after = state()
  const added = Object.keys(after).filter((id) => !(id in before))
  expect(added).toHaveLength(1)
  expect(after[added[0]]).toBe('true')
  for (const [id, on] of Object.entries(before)) expect(after[id]).toBe(on)
})

it('puts what is switched on onto their day, and follows the switches', async () => {
  offer = everything()
  render(<StackReviewPage reducedMotion />)
  const box = await screen.findByRole('region', { name: 'Your box' })
  const day = within(box).getByRole('region', { name: 'Your day' })
  // The original quiz has no sleep times: the stated day, said so.
  expect(day).toHaveTextContent('placed around a 7am start and an 11pm bedtime')
  const onTitles = [...box.querySelectorAll<HTMLElement>('[data-box-row][data-on="true"]')].map((r) => r.querySelector('.font-semibold')!.textContent!)
  for (const t of onTitles) expect(day).toHaveTextContent(t)
  const off = box.querySelector<HTMLElement>('[data-box-row][data-on="false"]')!
  const offTitle = off.querySelector('.font-semibold')!.textContent!
  expect(day).not.toHaveTextContent(offTitle)
  await userEvent.click(within(off).getByRole('switch'))
  expect(within(box).getByRole('region', { name: 'Your day' })).toHaveTextContent(offTitle)
})

it('keeps the box honest when everything is switched off: no order, and it says so', async () => {
  offer = everything()
  render(<StackReviewPage reducedMotion />)
  const box = await screen.findByRole('region', { name: 'Your box' })
  for (const s of within(box).getAllByRole('switch')) if (s.getAttribute('aria-checked') === 'true') await userEvent.click(s)
  expect(box.querySelector('[data-box-cta]')).toBeDisabled()
  expect(within(box).getByText('Switch on at least one product to make your box.')).toBeInTheDocument()
})

it('says why monthly is off on a small box, and what turns it on', async () => {
  offer = everything()
  render(<StackReviewPage reducedMotion />)
  const box = await screen.findByRole('region', { name: 'Your box' })
  for (const s of within(box).getAllByRole('switch')) if (s.getAttribute('aria-checked') === 'true') await userEvent.click(s)
  // The cheapest product alone: well under £25 a month.
  const rows = [...box.querySelectorAll<HTMLElement>('[data-box-row]')]
  const cheapest = rows.reduce((a, r) => (pounds(r.textContent!.split('·').pop()!) < pounds(a.textContent!.split('·').pop()!) ? r : a))
  await userEvent.click(within(cheapest).getByRole('switch'))
  const monthly = within(box).getByRole('radio', { name: /^Keep me stocked/ })
  expect(monthly).toBeDisabled()
  expect(monthly).toHaveTextContent('From £25.00 a month')
  expect(box.querySelector('[data-monthly-min]')).toHaveTextContent(/^Monthly starts at £25\.00 a month, and this box comes to £\d+\.\d\d\. Switch on another product to choose it\.$/)
})

it('says what the box comes with, and the monthly rate its size earns', async () => {
  offer = everything()
  act(() => useQuizStore.setState({ planType: 'subscription' }))
  render(<StackReviewPage reducedMotion />)
  const box = await screen.findByRole('region', { name: 'Your box' })
  // Fill it: a monthly box over the minimum.
  for (const s of within(box).getAllByRole('switch')) if (s.getAttribute('aria-checked') === 'false') await userEvent.click(s)
  const services = await waitFor(() => {
    const el = box.querySelector<HTMLElement>('[data-box-services]')
    expect(el).not.toBeNull()
    return el!
  })
  // Every box: the guide, reminders, check-ins; monthly: free swaps and its rate.
  for (const id of ['guide', 'reminders', 'checkIns', 'swaps']) expect(services.querySelector(`[data-service="${id}"][data-unlocked="true"]`)).not.toBeNull()
  expect(services.querySelector('[data-service="rate"][data-unlocked="true"]')).toHaveTextContent(/^\d+% off every month$/)
  expect(services.querySelector('[data-charge-level]')).toHaveTextContent(/^(Charged|Supercharged|Fully charged)$/)
  // Switched off in the hub, so never said.
  expect(services.textContent).not.toMatch(/guarantee/i)
  expect(box.querySelector('[data-box-cta]')).toHaveTextContent(/^Start monthly · £.* a month$/)
})

it('names the guarantee, with its conditions and terms beside it, once the hub switches it on', async () => {
  offer = { ...everything(), services: { checkIns: true, guarantee: true, training: false, deals: false, trainer: false, coaching: false, video: false, programmes: false } }
  render(<StackReviewPage reducedMotion />)
  const box = await screen.findByRole('region', { name: 'Your box' })
  const guarantee = box.querySelector<HTMLElement>('[data-box-services] [data-service="guarantee"]')!
  expect(guarantee).toHaveTextContent('First box only, one per customer.')
  expect(within(guarantee).getByRole('link', { name: 'Guarantee terms' })).toHaveAttribute('href', '/legal/guarantee')
})

it('never says "free" about the gift without its conditions and the terms beside it', async () => {
  offer = everything()
  render(<StackReviewPage reducedMotion />)
  // On the box's ladder: the gift's line, its conditions and the terms beside it.
  const box = await giftRung()
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
    if (n.parentElement?.closest('[data-bonus-note], [data-receipt-bonus], [data-offer-gift]')) continue
    // Build your stack: its card carries the gift's conditions and terms whenever the gift is on it.
    const ladder = n.parentElement?.closest('[data-ladder]')
    if (ladder && /First order only, one per customer\./.test(ladder.textContent ?? '') && ladder.querySelector('a[href="/legal/free-gift"]')) continue
    loose.push(text)
  }
  expect(loose).toEqual([])
})

it('moves no price: the receipt is the same with the bonus on and off', async () => {
  offer = everything()
  const first = render(<StackReviewPage reducedMotion />)
  await giftRung()
  const withBonus = receiptTotal()
  first.unmount()

  resetOfferSettings()
  offer = shown({ ...allOn({ minSubtotal: 1 }), bonus: { ...allOn().bonus, enabled: false } })
  render(<StackReviewPage reducedMotion />)
  await screen.findByRole('region', { name: 'Your box' })
  expect(document.querySelector('[data-rung="gift"]')).toBeNull()
  expect(document.querySelector('[data-receipt-bonus]')).toBeNull()
  expect(receiptTotal()).toBe(withBonus)
})

it('says nothing about a gift no box could reach', async () => {
  offer = shown(allOn({ minSubtotal: 1_000 }))
  render(<StackReviewPage reducedMotion />)
  await screen.findByRole('region', { name: 'Your box' })
  // Not even every product on reaches £1,000, so no bonus anywhere, and nothing to point at.
  expect(document.querySelector('[data-bonus-note]')).toBeNull()
  expect(document.querySelector('[data-rung="gift"]')).toBeNull()
})

it('keeps the gift and takes off a code worth less, saying why', async () => {
  offer = everything()
  code = { discountPct: 0.01 }
  render(<StackReviewPage reducedMotion />)
  await giftRung()
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
  await giftRung()
  // A bigger box, so a quarter off is worth more than the gift.
  for (const s of within(theBox()).getAllByRole('switch')) if (s.getAttribute('aria-checked') === 'false') await userEvent.click(s)
  await userEvent.click(screen.getByRole('button', { name: /got a discount code/i }))
  await userEvent.type(screen.getByPlaceholderText('Discount code'), 'BIG25')
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
  expect(await screen.findByText(/^Your code is worth more than the free .*, so you’ve got the code\.$/)).toBeInTheDocument()
  expect(document.querySelector('[data-receipt-bonus]')).toBeNull()
})

it('is their top pick with the hero switch off, and no bonus with it off', async () => {
  offer = DEFAULT_OFFER
  render(<StackReviewPage reducedMotion />)
  const box = await screen.findByRole('region', { name: 'Your box' })
  const justOne = within(box).getByRole('button', { name: /^Just want one\?/ })
  // Their top pick: the first product in the box.
  const first = box.querySelector<HTMLElement>('[data-box-row]')!
  expect(first).toHaveTextContent(/Start with the (.+) · £/.exec(justOne.textContent!)![1])
  expect(document.querySelector('[data-rung="gift"]')).toBeNull()
  expect(document.querySelector('[data-bonus-note]')).toBeNull()
})
