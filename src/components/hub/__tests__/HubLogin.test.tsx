/**
 * What the hub login says after a social sign-in that didn't work.
 *
 * The failure path used to be silent: the callback appended
 * `?auth_error=<provider>` and nothing read it, so a member whose Google
 * sign-in fell over landed back on a login screen identical to the one they had
 * just left — no error, nothing to suggest their tap had done anything.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HubLogin } from '../HubLogin'

const PROVIDERS = [
  { id: 'google', label: 'Google' },
  { id: 'microsoft', label: 'Microsoft' },
]

function renderAt(search: string, providers = PROVIDERS) {
  window.history.replaceState({}, '', `/myhub${search}`)
  return render(<HubLogin onAuthenticate={async () => null} providers={providers} />)
}

describe('the hub login', () => {
  afterEach(() => window.history.replaceState({}, '', '/myhub'))

  it('says nothing about sign-in failures when there weren’t any', () => {
    renderAt('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('names the provider that failed', async () => {
    renderAt('?auth_error=microsoft')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Microsoft sign-in didn’t complete/),
    )
  })

  it('clears the failure from the URL, so a refresh doesn’t replay it', async () => {
    renderAt('?auth_error=google')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(window.location.search).toBe('')
  })

  it('refuses to print a provider it doesn’t offer, rather than echoing the URL', async () => {
    renderAt('?auth_error=<script>alert(1)</script>')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That sign-in didn’t complete. Try again, or use your email and password.',
    )
  })

  it('still names the provider when the list arrives after the failure is read', async () => {
    // The provider list comes from the server a beat after mount, which is
    // exactly when the query parameter has already been consumed.
    const { rerender } = renderAt('?auth_error=microsoft', [])
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    rerender(<HubLogin onAuthenticate={async () => null} providers={PROVIDERS} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Microsoft sign-in didn’t complete/)
  })
})

/**
 * Getting to the reset flow from the hub's sign-in screen.
 *
 * The gating is the interesting part: with no email provider configured nothing
 * can be sent, and a "forgotten your password?" link would send the one member
 * who most needs help off to watch an inbox forever.
 */
describe('the way to a reset', () => {
  afterEach(() => window.history.replaceState({}, '', '/myhub'))

  function renderLogin(props: Partial<React.ComponentProps<typeof HubLogin>> = {}) {
    return render(
      <HubLogin onAuthenticate={async () => null} providers={PROVIDERS} {...props} />,
    )
  }

  const forgotLink = () => screen.queryByRole('button', { name: /forgotten your password/i })

  it('offers no link when no email provider is configured', () => {
    renderLogin({ canResetPassword: false })
    expect(forgotLink()).not.toBeInTheDocument()
  })

  it('offers one when a link can actually be sent', () => {
    renderLogin({ canResetPassword: true })
    expect(forgotLink()).toBeInTheDocument()
  })

  it('does not offer it while creating an account', async () => {
    // There is no password to reset yet, and offering to reset one is a
    // confusing thing to read on a sign-up form.
    const user = userEvent.setup()
    renderLogin({ canResetPassword: true })
    await user.click(screen.getByRole('button', { name: /new here\? create an account/i }))
    expect(forgotLink()).not.toBeInTheDocument()
  })

  it('carries the typed address into the reset form', async () => {
    const user = userEvent.setup()
    renderLogin({ canResetPassword: true })
    await user.type(screen.getByPlaceholderText('you@email.com'), 'member@example.com')
    await user.click(forgotLink()!)
    expect(screen.getByLabelText(/email address/i)).toHaveValue('member@example.com')
  })

  it('opens straight into the reset form on ?forgot=1', async () => {
    // Where "send me a new link" points from a dead reset link.
    window.history.replaceState({}, '', '/myhub?forgot=1')
    renderLogin({ canResetPassword: true })

    await waitFor(() => expect(screen.getByLabelText(/email address/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /email me a link/i })).toBeInTheDocument()
    // And cleaned out of the URL, so a refresh doesn't reopen it.
    expect(window.location.search).toBe('')
  })

  it('goes back to signing in', async () => {
    const user = userEvent.setup()
    renderLogin({ canResetPassword: true })
    await user.click(forgotLink()!)
    await user.click(screen.getByRole('button', { name: /back to sign in/i }))
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
