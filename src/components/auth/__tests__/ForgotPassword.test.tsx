/**
 * The "email me a link" panel, shared by the hub's sign-in screen and the
 * account gate at checkout.
 *
 * Most of what matters here is what the screen refuses to say. The server is
 * careful to answer identically whether an address has an account, has none, or
 * has asked three times already (see `/api/auth/forgot-password`); a screen that
 * helpfully reports the difference throws all of that away and turns the form
 * into a way of asking the site whether a given person is a customer.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForgotPassword } from '../ForgotPassword'

const mockRequest = jest.fn()

jest.mock('@/lib/auth-client', () => ({
  requestPasswordReset: (email: string) => mockRequest(email),
}))

beforeEach(() => {
  mockRequest.mockReset()
  mockRequest.mockResolvedValue(null)
})

function setup(props: Partial<React.ComponentProps<typeof ForgotPassword>> = {}) {
  const onBack = jest.fn()
  render(<ForgotPassword onBack={onBack} {...props} />)
  return { onBack, user: userEvent.setup() }
}

const submit = () => screen.getByRole('button', { name: /email me a link/i })

describe('asking for a link', () => {
  it('carries across the address already typed on the sign-in form', () => {
    // Retyping the address you just got wrong is the last thing this screen
    // should be asking someone to do.
    setup({ initialEmail: 'member@example.com' })
    expect(screen.getByLabelText(/email address/i)).toHaveValue('member@example.com')
  })

  it('will not send an address that isn’t one', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(/email address/i), 'not-an-email')
    expect(submit()).toBeDisabled()
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('trims what it sends', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(/email address/i), '  member@example.com  ')
    await user.click(submit())
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('member@example.com'))
  })
})

describe('what it says afterwards', () => {
  it('does not claim an account exists', async () => {
    const { user } = setup({ initialEmail: 'member@example.com' })
    await user.click(submit())

    // `status`, not `alert`: this is an outcome rather than a failure, so it
    // waits for a pause instead of interrupting. The refusal below is still an
    // `alert`, which is the distinction worth keeping.
    const confirmation = await screen.findByRole('status')
    expect(confirmation).toHaveTextContent(/if we have an account/i)
    // The tell-tale phrasings, both of which answer a question nobody may ask
    // this form: "we've emailed you" and "no account with that address".
    expect(confirmation).not.toHaveTextContent(/we've sent|we have sent|no account/i)
  })

  it('looks identical whoever typed what', async () => {
    // Unknown address, known address, one over its throttle — the server returns
    // the same thing, and so must this.
    const { user } = setup({ initialEmail: 'stranger@example.com' })
    await user.click(submit())
    const first = (await screen.findByRole('status')).textContent

    expect(first).toContain('stranger@example.com')
    expect(first).toMatch(/if we have an account/i)
    expect(first).toMatch(/60 minutes/)
  })

  it('does not offer the button again, so nobody burns their own throttle', async () => {
    // Someone who tapped it and saw the form reset would reasonably tap again,
    // and each new link cancels the last one they were sent.
    const { user } = setup({ initialEmail: 'member@example.com' })
    await user.click(submit())

    await screen.findByRole('status')
    expect(screen.queryByRole('button', { name: /email me a link/i })).not.toBeInTheDocument()
  })

  it('offers the way back to signing in', async () => {
    const { user, onBack } = setup({ initialEmail: 'member@example.com' })
    await user.click(submit())
    await user.click(await screen.findByRole('button', { name: /back to sign in/i }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('when it cannot work', () => {
  it('passes on a server refusal instead of pretending a link is coming', async () => {
    // A deployment with no email provider configured is a fact about this
    // server rather than about anybody's account, and the member has to be told
    // — otherwise they wait forever for an email nobody was going to send.
    mockRequest.mockResolvedValue('Password resets aren’t switched on yet.')
    const { user } = setup({ initialEmail: 'member@example.com' })
    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(/aren’t switched on yet/i)
    expect(screen.queryByText(/if we have an account/i)).not.toBeInTheDocument()
  })
})
