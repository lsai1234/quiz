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

const payload = { subscription: { lines: [] }, lines: [] } as unknown as CheckoutPayload

/** Renders and lets the mounted provider fetch settle, so no assertion races it. */
async function setup() {
  const onAuthenticated = jest.fn()
  await act(async () => {
    render(<AccountGate payload={payload} onAuthenticated={onAuthenticated} onCancel={jest.fn()} />)
  })
  return { onAuthenticated, user: userEvent.setup() }
}

const submitButton = () => screen.getByRole('button', { name: /create account & subscribe/i })
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
