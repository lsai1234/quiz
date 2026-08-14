/**
 * The consent gate at checkout. The server enforces consent regardless (see
 * `checkout/__tests__/finalize.test.ts`), so these tests exist to stop the UI
 * quietly letting someone through to a request that will only fail — and to
 * pin down that the tick-box is genuinely required rather than decorative.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountGate } from '../AccountGate'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'
import type { CheckoutPayload } from '@/lib/checkout/types'

jest.mock('@/lib/auth-client', () => ({
  fetchAuthContext: jest.fn().mockResolvedValue({ providers: [] }),
  authenticateAccount: jest.fn().mockResolvedValue(null),
}))

const payload = {
  subscription: { flatMonthly: 52.18, firstMonth: 41.74, lines: [{ id: 'l1' }, { id: 'l2' }] },
} as unknown as CheckoutPayload

/** Renders and lets the mounted provider fetch settle, so no assertion races it. */
async function setup() {
  const onAuthenticated = jest.fn()
  await act(async () => {
    render(<AccountGate payload={payload} onAuthenticated={onAuthenticated} onCancel={jest.fn()} />)
  })
  return { onAuthenticated, user: userEvent.setup() }
}

const submitButton = () => screen.getByRole('button', { name: /continue to payment/i })
const consentBox = () => screen.getByRole('checkbox')

describe('AccountGate consent', () => {
  it('shows the health disclaimer before the member can subscribe', async () => {
    await setup()
    expect(screen.getByText(/nothing we send you is medical advice/i)).toBeInTheDocument()
    expect(screen.getByText(/always read the label/i)).toBeInTheDocument()
    expect(screen.getByText(/speak to a doctor before starting/i)).toBeInTheDocument()
  })

  it('links to both documents in a new tab', async () => {
    await setup()
    const terms = screen.getByRole('link', { name: /subscription terms/i })
    expect(terms).toHaveAttribute('href', '/legal/terms')
    expect(terms).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: /health and allergen information/i }))
      .toHaveAttribute('href', '/legal/disclaimer')
  })

  it('keeps subscribe disabled until the box is ticked, even with valid credentials', async () => {
    const { user } = await setup()
    await user.type(screen.getByPlaceholderText(/you@email.com/i), 'sam@example.com')
    await user.type(screen.getByPlaceholderText(/choose a password/i), 'password123')

    expect(submitButton()).toBeDisabled()

    await user.click(consentBox())
    expect(submitButton()).toBeEnabled()
  })

  it('passes the consent, with the versions displayed, once submitted', async () => {
    const { user, onAuthenticated } = await setup()
    await user.type(screen.getByPlaceholderText(/you@email.com/i), 'sam@example.com')
    await user.type(screen.getByPlaceholderText(/choose a password/i), 'password123')
    await user.click(consentBox())
    await user.click(submitButton())

    await waitFor(() =>
      expect(onAuthenticated).toHaveBeenCalledWith({
        accepted: true,
        termsVersion: TERMS_VERSION,
        disclaimerVersion: DISCLAIMER_VERSION,
      }),
    )
  })

  it('never authenticates while the box is unticked', async () => {
    const { user, onAuthenticated } = await setup()
    await user.type(screen.getByPlaceholderText(/you@email.com/i), 'sam@example.com')
    await user.type(screen.getByPlaceholderText(/choose a password/i), 'password123')

    await user.click(submitButton()) // disabled, but click it anyway
    expect(onAuthenticated).not.toHaveBeenCalled()
  })
})

describe('AccountGate placement', () => {
  /**
   * The bug this pins: the gate was a bare `fixed inset-0` div rendered inline
   * on a page whose wrapper is GSAP-animated. A transformed ancestor makes
   * `position: fixed` resolve against that ancestor rather than the viewport, so
   * the sign-in box opened halfway down the page — below the fold, at the exact
   * moment someone was trying to buy something. Portalling is the fix, and it is
   * only observable from outside the React tree.
   */
  it('renders outside its own tree, so no transformed ancestor can catch it', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      render(<AccountGate payload={payload} onAuthenticated={jest.fn()} onCancel={jest.fn()} />, {
        container,
      })
    })
    const dialog = screen.getByRole('dialog')
    expect(container.contains(dialog)).toBe(false)
    expect(document.body.contains(dialog)).toBe(true)
  })

  it('shows what is being bought, and says payment happens on Stripe', async () => {
    await setup()
    expect(screen.getByText('£52.18')).toBeInTheDocument()
    expect(screen.getByText(/first month £41\.74/i)).toBeInTheDocument()
    expect(screen.getByText(/card details are taken on stripe/i)).toBeInTheDocument()
    // Three named steps, so terms-then-Stripe is not a surprise.
    expect(screen.getByRole('list', { name: /checkout progress/i })).toBeInTheDocument()
  })
})
