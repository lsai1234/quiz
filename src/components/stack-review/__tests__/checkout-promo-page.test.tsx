import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StackReviewPage } from '../StackReviewPage'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { invalidateCatalogue } from '@/lib/catalogue/load'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The advertised code on the results page, wired into the page around it.
 *
 * The card on its own is tested next door; what can only go wrong here is the
 * joining: the price the card promises against the receipt it produces, the
 * code box stepping aside and back, and a Remove that has to beat the referral
 * cookie an ad's `?ref=` link leaves behind — which re-applies the code on the
 * client and is read again by the checkout on the server.
 */

const ENDS = new Date(Date.now() + 6 * 3600_000).toISOString()

const CODES: Record<string, { discountPct: number; partnerName: string | null }> = {
  LAUNCH25: { discountPct: 0.25, partnerName: null },
  SARAH20: { discountPct: 0.2, partnerName: 'Sarah' },
}

let codeChecks: string[] = []

function respond(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body })
}

beforeEach(() => {
  invalidateCatalogue()
  codeChecks = []
  document.cookie = 'partner_ref=; path=/; max-age=0'
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/api/checkout-promo')) return respond({ promo: { code: 'LAUNCH25', percent: 25, endsAt: ENDS } })
    if (u.includes('/api/partner-code')) {
      const code = String(JSON.parse(String(init?.body ?? '{}')).code ?? '').toUpperCase()
      codeChecks.push(code)
      const known = CODES[code]
      return respond(known ? { ok: true, code, ...known } : { ok: false, reason: 'We don’t recognise that code.' })
    }
    if (u.includes('/api/competition')) return respond({ state: 'off' })
    return respond({ products: MOCK_CATALOGUE, source: 'mock' })
  }) as unknown as typeof fetch
})

afterEach(() => {
  document.cookie = 'partner_ref=; path=/; max-age=0'
})

async function oneOff() {
  await userEvent.click(await screen.findByRole('button', { name: /just this once/i }))
}

/** The receipt's total row, as text. */
function receiptTotal(): string {
  const label = screen.getByText('Total', { selector: 'span' })
  return label.closest('div.flex')?.parentElement?.textContent ?? ''
}

it('applies the advertised code, and the receipt comes to the price the card promised', async () => {
  render(<StackReviewPage />)
  await oneOff()

  const card = await screen.findByRole('region', { name: /LAUNCH25: 25% off/ })
  expect(screen.getByRole('button', { name: /got a different code/i })).toBeInTheDocument()

  await userEvent.click(within(card).getByRole('button', { name: /apply launch25 now/i }))

  // The visible line, not the live region announcing the same words.
  const now = await screen.findByText(/your total is now/i, { selector: 'p:not([role="status"])' })
  const promised = now.textContent!.match(/£\d[\d,]*\.\d{2}/)![0]
  expect(receiptTotal()).toContain(promised)
  expect(screen.getByText(/LAUNCH25 · 25% off/)).toBeInTheDocument()
  // The card carries the applied state, so the box steps aside rather than repeat it.
  expect(screen.queryByRole('button', { name: /got a different code/i })).not.toBeInTheDocument()
  // Focus lands on the control that undoes it, not on <body>.
  expect(screen.getByRole('button', { name: /remove code/i })).toHaveFocus()
  expect(codeChecks).toEqual(['LAUNCH25'])
})

it('keeps the code off after Remove for somebody who arrived on ?ref=LAUNCH25', async () => {
  document.cookie = 'partner_ref=LAUNCH25; path=/'
  render(<StackReviewPage />)
  await oneOff()

  // The link's cookie applies it on arrival.
  const remove = await screen.findByRole('button', { name: /remove code/i })
  await userEvent.click(remove)

  expect(await screen.findByRole('button', { name: /apply launch25 now/i })).toBeInTheDocument()
  // Let the code box remount and run its referral check.
  await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
  expect(screen.queryByText(/LAUNCH25 applied/)).not.toBeInTheDocument()
  expect(document.cookie).not.toMatch(/partner_ref=LAUNCH25/)
  expect(codeChecks).toEqual(['LAUNCH25'])
})

it('does not advertise a code beside a partner’s, and leaves the partner’s link alone', async () => {
  document.cookie = 'partner_ref=SARAH20; path=/'
  render(<StackReviewPage />)
  await oneOff()

  // Named in the code box and on the receipt's discount line.
  expect((await screen.findAllByText(/SARAH20 · 20% off/)).length).toBeGreaterThan(0)
  await waitFor(() => expect(codeChecks).toContain('SARAH20'))
  expect(screen.queryByRole('region', { name: /LAUNCH25/ })).not.toBeInTheDocument()
  expect(document.cookie).toMatch(/partner_ref=SARAH20/)
})
