import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AffiliateJoin } from '../AffiliateJoin'

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=tok_123'),
  useRouter: () => ({ replace, push: jest.fn(), refresh: jest.fn() }),
}))

beforeEach(() => replace.mockClear())

const LIVE = {
  link: 'live',
  kind: 'affiliate',
  name: 'Alex Reed',
  email: 'alex@example.com',
  linkExpiresAt: '2026-10-01T00:00:00.000Z',
  hasPassword: false,
  code: { code: 'ALEX20', discountPct: 0.2 },
  earn: {
    commissionPct: 0.12,
    wording: '12% of the net on every order your code brings in, including renewals for 3 months from signup.',
  },
}

/** Answers the join read, then whatever the password POST is given. */
function serve(lookup: unknown, post: { ok?: boolean; body?: unknown } = {}) {
  const fetchMock = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    // The read and the write are the same path; the method is what tells them
    // apart, exactly as it does on the server.
    if (String(url).startsWith('/api/partner/join') && init?.method !== 'POST') {
      return { ok: true, status: 200, json: async () => lookup }
    }
    return { ok: post.ok ?? true, status: post.ok === false ? 400 : 200, json: async () => post.body ?? { ok: true } }
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('an affiliate opening their link', () => {
  it('shows the code and the rate before asking for anything', async () => {
    serve(LIVE)
    render(<AffiliateJoin />)

    expect(await screen.findByText('ALEX20')).toBeInTheDocument()
    expect(screen.getByText(/20% off for anyone who uses it/)).toBeInTheDocument()
    expect(screen.getByText(/you earn 12% of every order it brings in/)).toBeInTheDocument()
    // The full sentence, the same one their hub will show them.
    expect(screen.getByText(/including renewals for 3 months from signup/)).toBeInTheDocument()
    expect(screen.getByText(/Welcome, Alex/)).toBeInTheDocument()
  })

  it('pre-fills the email the account is on, and says what it is for', async () => {
    serve(LIVE)
    render(<AffiliateJoin />)

    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveValue('alex@example.com'))
    expect(screen.getByText('This is what you’ll sign in with.')).toBeInTheDocument()
  })

  it('sends the email and the password together', async () => {
    // One decision — "this account is mine, and this is how I get back into
    // it" — so one request. Landing on `/partner` afterwards is a real page
    // load, which only a browser can prove: see `07-partner.spec.ts`.
    const fetchMock = serve(LIVE)
    render(<AffiliateJoin />)
    await screen.findByText('ALEX20')

    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'a-long-enough-one')
    await userEvent.click(screen.getByRole('button', { name: /Set my password/ }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    )
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(post[0]).toBe('/api/partner/join')
    expect(JSON.parse(post[1]?.body ?? '{}')).toEqual({
      token: 'tok_123',
      email: 'alex@example.com',
      password: 'a-long-enough-one',
    })
  })

  it('sends the email they corrected rather than the one we guessed', async () => {
    // The founder typed it from a DM or a call. Being locked out of an account
    // that is already earning, because of somebody else's typo, is the failure
    // this field exists to stop.
    const fetchMock = serve(LIVE)
    render(<AffiliateJoin />)
    await screen.findByText('ALEX20')

    await userEvent.clear(screen.getByLabelText('Email'))
    await userEvent.type(screen.getByLabelText('Email'), 'alex.reed@gmail.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'a-long-enough-one')
    await userEvent.click(screen.getByRole('button', { name: /Set my password/ }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    )
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1]?.body ?? '{}').email).toBe('alex.reed@gmail.com')
  })

  it('will not submit without an email that looks like one', async () => {
    serve(LIVE)
    render(<AffiliateJoin />)
    await screen.findByText('ALEX20')

    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'a-long-enough-one')
    expect(screen.getByRole('button', { name: /Set my password/ })).toBeEnabled()

    await userEvent.clear(screen.getByLabelText('Email'))
    expect(screen.getByRole('button', { name: /Set my password/ })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Email'), 'alex@')
    expect(screen.getByText('That does not look like an email address.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Set my password/ })).toBeDisabled()
  })

  it('shows the server\'s words when the email is already on another account', async () => {
    serve(LIVE, {
      ok: false,
      body: { error: 'There is already an account on that email. Use another, or ask us to merge them.' },
    })
    render(<AffiliateJoin />)
    await screen.findByText('ALEX20')

    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'a-long-enough-one')
    await userEvent.click(screen.getByRole('button', { name: /Set my password/ }))

    expect(await screen.findByText(/already an account on that email/)).toBeInTheDocument()
  })

  it('will not submit a password that is too short or mistyped', async () => {
    serve(LIVE)
    render(<AffiliateJoin />)
    await screen.findByText('ALEX20')

    await userEvent.type(screen.getByLabelText('Password'), 'short')
    expect(screen.getByRole('button', { name: /Set my password/ })).toBeDisabled()
    expect(screen.getByText('At least 10 characters.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Password'))
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'a-long-enough-two')
    expect(screen.getByText('Those don’t match.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Set my password/ })).toBeDisabled()
  })

  it('shows what the server said when the link is spent mid-signup', async () => {
    serve(LIVE, { ok: false, body: { error: 'That link has expired or has already been used.' } })
    render(<AffiliateJoin />)
    await screen.findByText('ALEX20')

    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'a-long-enough-one')
    await userEvent.click(screen.getByRole('button', { name: /Set my password/ }))

    expect(await screen.findByText(/That link has expired or has already been used\./)).toBeInTheDocument()
  })

  it('says a dead link is dead, and offers the way back', async () => {
    serve({ link: 'dead' })
    render(<AffiliateJoin />)

    expect(await screen.findByText(/This link won’t work/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to sign-in' })).toHaveAttribute('href', '/partner')
    // Nothing to type: a form here would be a form that cannot work.
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('sends an influencer to their own front door, link intact', async () => {
    // Their link opens on an agreement for a free stack. Neither exists here,
    // and reading the link never spent it, so the redirect costs them nothing.
    serve({ ...LIVE, kind: 'influencer' })
    render(<AffiliateJoin />)

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/partner/claim?token=tok_123'))
    // …and does not flash an affiliate's welcome at them on the way.
    expect(screen.queryByText('ALEX20')).not.toBeInTheDocument()
  })

  it('tells a returning affiliate what a second visit does', async () => {
    serve({ ...LIVE, hasPassword: true })
    render(<AffiliateJoin />)

    expect(await screen.findByText(/signing in again sets a new password/i)).toBeInTheDocument()
  })
})
