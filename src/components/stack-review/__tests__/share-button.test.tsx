import { render, screen } from '@testing-library/react'
import { StackReviewPage } from '../StackReviewPage'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { invalidateCatalogue } from '@/lib/catalogue/load'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The Share button is on the results screen.
 *
 * Written because it went missing in production while being plainly present in
 * the source — which is the shape of question a test answers in a second and a
 * conversation cannot answer at all. It renders `StackReviewPage` with no quiz
 * state, the direct-navigation path that falls back to `MOCK_BLUEPRINT`, so what
 * it asserts is that the button is unconditional rather than dependent on
 * having finished a quiz.
 */
beforeEach(() => {
  // The page resolves every slot's product id against the served catalogue, and
  // `MOCK_BLUEPRINT` holds mock ids — so serve the mock catalogue, the one that
  // pairing is true of. An empty response is a shop with nothing in it, and the
  // page says so instead of rendering the stack.
  invalidateCatalogue()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ products: MOCK_CATALOGUE, source: 'mock' }),
  }) as unknown as typeof fetch
})

it('offers a share button on the results screen', async () => {
  render(<StackReviewPage />)
  expect(await screen.findByRole('button', { name: /share your stack/i })).toBeInTheDocument()
})
