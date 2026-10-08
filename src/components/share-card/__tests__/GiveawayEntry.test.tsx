import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GiveawayEntry } from '../GiveawayEntry'

/**
 * The giveaway at the foot of the results page: email in, one entry; share on
 * top, ten more. Nothing at all while no competition is open.
 */

const OPEN = { state: 'open', name: 'Launch', prize: 'Win £200 of supplements', test: false, closesAt: null, shareBonus: 10 }

function server(comp: unknown) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).includes('/api/competition/enter') && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, id: 'e1', tickets: 1, shared: false, already: false }) })
    }
    if (String(url).includes('/api/competition/bonus')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, tickets: 11, shared: true }) })
    }
    return Promise.resolve({ ok: true, json: async () => comp })
  }) as unknown as typeof fetch
}

afterEach(() => window.localStorage.clear())

it('renders nothing while no competition is open', async () => {
  server({ state: 'off' })
  const { container } = render(<GiveawayEntry onShare={() => {}} />)
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

it('asks for nothing until somebody chooses to enter', async () => {
  server(OPEN)
  render(<GiveawayEntry onShare={() => {}} />)
  expect(await screen.findByRole('button', { name: /enter the competition/i })).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

it('says entering is agreeing to the terms, offers included, then offers the share bonus', async () => {
  server(OPEN)
  const onShare = jest.fn()
  render(<GiveawayEntry onShare={onShare} />)

  await userEvent.click(await screen.findByRole('button', { name: /enter the competition/i }))
  // No separate tick: the agreement is the sentence beside the button.
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.getByText(/by entering you agree to the/i)).toHaveTextContent(/offers and news/i)
  expect(screen.getByRole('link', { name: /competition t&cs/i })).toHaveAttribute('href', '/legal/competition')
  await userEvent.type(screen.getByLabelText(/your email/i), 'Sam@Example.com')
  await userEvent.click(screen.getByRole('button', { name: /^enter$/i }))

  expect(await screen.findByText(/you’re in — 1 entry/i)).toBeInTheDocument()
  const post = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(post![1].body)).toEqual({ email: 'Sam@Example.com', agreedToTerms: true, route: 'quiz' })

  await userEvent.click(screen.getByRole('button', { name: /share your card for \+10 entries/i }))
  expect(onShare).toHaveBeenCalled()
})

it('claims a share made before entering as soon as the email goes in', async () => {
  window.localStorage.setItem('chrgd_competition_shared', JSON.stringify('Launch'))
  server(OPEN)
  render(<GiveawayEntry onShare={() => {}} />)

  expect(await screen.findByText(/you’ve already shared/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /enter the competition/i }))
  await userEvent.type(screen.getByLabelText(/your email/i), 'sam@example.com')
  await userEvent.click(screen.getByRole('button', { name: /^enter$/i }))

  expect(await screen.findByText(/you’re in — 11 entries/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /share your card/i })).not.toBeInTheDocument()
})
