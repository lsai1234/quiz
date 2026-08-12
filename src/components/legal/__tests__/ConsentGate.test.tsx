/**
 * The consent gate — the step a signed-in member gets instead of the account
 * gate. Same documents, same tick-box, no account questions.
 *
 * The server enforces consent regardless (`checkout/__tests__/finalize.test.ts`),
 * so these pin the two things the UI is responsible for: that the member is
 * SHOWN the terms and the health information before they can agree, and that
 * what goes back names the versions the server asked for.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsentGate } from '../ConsentGate'
import { fetchAuthContext } from '@/lib/auth-client'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'

jest.mock('@/lib/auth-client', () => ({
  fetchAuthContext: jest.fn().mockResolvedValue({ user: null, providers: [] }),
}))

const signedInAs = (email: string | null) =>
  (fetchAuthContext as jest.Mock).mockResolvedValue({
    user: email ? { id: 'u1', email, name: 'Member' } : null,
    providers: [],
  })

const setup = async (props: Partial<React.ComponentProps<typeof ConsentGate>> = {}) => {
  const onAccept = jest.fn()
  const onCancel = jest.fn()
  await act(async () => {
    render(<ConsentGate onAccept={onAccept} onCancel={onCancel} {...props} />)
  })
  return { onAccept, onCancel, user: userEvent.setup() }
}

const confirm = () => screen.getByRole('button', { name: /agree & start subscription/i })

describe('ConsentGate', () => {
  it('shows the billing terms and the health disclaimer before anyone can agree', async () => {
    await setup()
    expect(screen.getByText(/nothing we send you is medical advice/i)).toBeInTheDocument()
    expect(screen.getByText(/always read the label/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /subscription terms/i })).toHaveAttribute('href', '/legal/terms')
    expect(screen.getByRole('link', { name: /health and allergen information/i }))
      .toHaveAttribute('href', '/legal/disclaimer')
  })

  it('will not confirm until the box is ticked', async () => {
    const { onAccept, user } = await setup()
    expect(confirm()).toBeDisabled()

    await user.click(screen.getByRole('checkbox'))
    expect(confirm()).toBeEnabled()
    await user.click(confirm())

    expect(onAccept).toHaveBeenCalledWith({
      accepted: true,
      termsVersion: TERMS_VERSION,
      disclaimerVersion: DISCLAIMER_VERSION,
    })
  })

  it('submits the versions the server says it is serving, not this build’s', async () => {
    // The whole point of the handshake: a member on a tab opened before a
    // deploy would otherwise fail `stale-version` however often they tick.
    const versions = { terms: '2099-01-01', disclaimer: '2099-02-02' }
    const { onAccept, user } = await setup({ versions })

    await user.click(screen.getByRole('checkbox'))
    await user.click(confirm())

    expect(onAccept).toHaveBeenCalledWith({
      accepted: true,
      termsVersion: '2099-01-01',
      disclaimerVersion: '2099-02-02',
    })
  })

  it('explains itself when the terms changed mid-checkout', async () => {
    await setup({ notice: 'Our terms were updated while you were here.' })
    expect(screen.getByText(/our terms were updated/i)).toBeInTheDocument()
  })

  it('lets the member back out without subscribing', async () => {
    const { onCancel, onAccept, user } = await setup()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
    expect(onAccept).not.toHaveBeenCalled()
  })

  describe('the account being subscribed', () => {
    // Nobody signed in weeks ago is asked to log in again, so this is the only
    // place they find out WHICH account is about to be billed monthly.
    it('names the signed-in account', async () => {
      signedInAs('lewis@example.com')
      await setup()
      expect(screen.getByText('lewis@example.com')).toBeInTheDocument()
      expect(screen.getByText(/already signed in/i)).toBeInTheDocument()
    })

    it('offers a way out to the wrong account', async () => {
      signedInAs('someone.else@example.com')
      const logout = jest.fn().mockResolvedValue({ ok: true })
      global.fetch = logout as unknown as typeof fetch
      const { onCancel, onAccept, user } = await setup()

      await user.click(screen.getByRole('button', { name: /not you/i }))

      expect(logout).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
      // Back to the basket, signed out and not subscribed to anything.
      expect(onCancel).toHaveBeenCalled()
      expect(onAccept).not.toHaveBeenCalled()
    })

    it('says nothing when there is no session to name', async () => {
      signedInAs(null)
      await setup()
      expect(screen.queryByText(/already signed in/i)).not.toBeInTheDocument()
    })
  })
})
