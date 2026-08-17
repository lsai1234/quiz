import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareStackButton } from '../ShareStackButton'

/**
 * The Share button, and the competition attached to it.
 *
 * Most of what is asserted here is restraint. The reveal page's job is checkout,
 * and a giveaway shouted loudly enough on this screen turns a person who came to
 * buy a stack into a person who entered a draw — so the tests that matter most
 * are the ones about what does *not* appear: no second button, no dialog, no
 * block of its own, and nothing at all while the competition is off.
 */

function respond(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => body }) as unknown as typeof fetch
}

const OPEN = {
  state: 'open',
  prize: 'Win £200 of supplements',
  test: false,
  closesAt: '2026-11-30T23:59:00.000Z',
}

describe('with no competition running', () => {
  it('is exactly the button that was there before', async () => {
    // The default state of the campaign is `off`, so this is what almost every
    // visitor sees. An inactive draw must cost nothing.
    respond({ state: 'off' })
    render(<ShareStackButton onOpen={() => {}} />)

    const button = await screen.findByRole('button', { name: /share your stack/i })
    expect(button).toBeInTheDocument()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    expect(screen.queryByText(/win/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/enter/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('says nothing while it does not yet know', async () => {
    // The fetch is live on purpose (§3.7). Until it lands, showing no prize is
    // the correct thing to show — never a placeholder that might be wrong.
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch
    render(<ShareStackButton onOpen={() => {}} />)
    expect(await screen.findByRole('button', { name: /share your stack/i })).toBeInTheDocument()
    expect(screen.queryByText(/£200/)).not.toBeInTheDocument()
  })

  it('shows the plain button when the endpoint fails', async () => {
    respond(null, false)
    render(<ShareStackButton onOpen={() => {}} />)
    expect(await screen.findByRole('button', { name: /share your stack/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link')).not.toBeInTheDocument())
  })
})

describe('with a competition running', () => {
  it('puts the prize on the share button rather than in a block of its own', async () => {
    respond(OPEN)
    render(<ShareStackButton onOpen={() => {}} />)

    const button = await screen.findByRole('button', { name: /share your stack/i })
    await waitFor(() => expect(button).toHaveTextContent(/win £200/i))

    // Inside the button, not beside it: the chip cannot be read before the
    // action it belongs to, and it costs no vertical space above the fold.
    expect(button).toHaveTextContent(/share your stack/i)
  })

  it('adds no second thing to press', async () => {
    // The failure this guards against is an "Enter the competition" button
    // competing with checkout. There is one action here and it is Share.
    respond(OPEN)
    render(<ShareStackButton onOpen={() => {}} />)
    await screen.findByRole('button', { name: /share your stack/i })
    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says how you enter, when it closes, and where the terms are', async () => {
    respond(OPEN)
    render(<ShareStackButton onOpen={() => {}} />)

    await waitFor(() => expect(screen.getByText(/share it to your story to enter/i)).toBeInTheDocument())
    expect(screen.getByText(/closes 30 nov/i)).toBeInTheDocument()

    // Significant conditions have to be reachable from the claim — but not at
    // the cost of navigating away from a page with a stack on it.
    const terms = screen.getByRole('link', { name: /t&cs apply/i })
    expect(terms).toHaveAttribute('href', '/legal/competition')
    expect(terms).toHaveAttribute('target', '_blank')
  })

  it('still opens the share sheet, which is the whole point', async () => {
    respond(OPEN)
    const onOpen = jest.fn()
    render(<ShareStackButton onOpen={onOpen} />)
    await userEvent.click(await screen.findByRole('button', { name: /share your stack/i }))
    expect(onOpen).toHaveBeenCalled()
  })
})

describe('during a test run', () => {
  it('never advertises the prize as real', async () => {
    // `test` exists for one failure: somebody entering a rehearsal believing
    // they are in the draw. The chip says so and the caption says so.
    respond({ ...OPEN, test: true })
    render(<ShareStackButton onOpen={() => {}} />)

    await waitFor(() => expect(screen.getByText(/test draw/i)).toBeInTheDocument())
    expect(screen.getByText(/won’t enter you into a real draw/i)).toBeInTheDocument()
    expect(screen.queryByText(/£200/)).not.toBeInTheDocument()
  })
})
