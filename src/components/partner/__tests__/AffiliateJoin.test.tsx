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
  const fetchMock = jest.fn(async (url: string, init?: { body?: string }) => {
    void init
    if (String(url).startsWith('/api/partner/join')) {
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

  it('sets the password through the one endpoint that sets passwords', async () => {
    // Not its own implementation of "burn the link, write the password, start a
    // session" — the shared route, so the two programmes cannot drift apart.
    // Landing on `/partner` afterwards is a real page load, which only a
    // browser can prove: see the affiliate journey in `07-partner.spec.ts`.
    const fetchMock = serve(LIVE)
    render(<AffiliateJoin />)
    await screen.findByText('ALEX20')

    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-one')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'a-long-enough-one')
    await userEvent.click(screen.getByRole('button', { name: /Set my password/ }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/partner/set-password')).toBe(true),
    )
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/partner/set-password')!
    expect(JSON.parse(post[1]?.body ?? '{}')).toEqual({
      token: 'tok_123',
      password: 'a-long-enough-one',
    })
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
