import { render, screen } from '@testing-library/react'
import { StackReviewPage } from '../StackReviewPage'

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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ products: [] }),
  }) as unknown as typeof fetch
})

it('offers a share button on the results screen', async () => {
  render(<StackReviewPage />)
  expect(await screen.findByRole('button', { name: /share your stack/i })).toBeInTheDocument()
})
