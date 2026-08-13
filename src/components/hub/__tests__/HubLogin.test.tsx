/**
 * What the hub login says after a social sign-in that didn't work.
 *
 * The failure path used to be silent: the callback appended
 * `?auth_error=<provider>` and nothing read it, so a member whose Google
 * sign-in fell over landed back on a login screen identical to the one they had
 * just left — no error, nothing to suggest their tap had done anything.
 */
import { render, screen, waitFor } from '@testing-library/react'
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
