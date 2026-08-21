import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaveStackCard } from '../SaveStackCard'
import { MARKETING_CONSENT_STATEMENT } from '@/lib/legal/content'

/**
 * The capture card.
 *
 * What is asserted here is the shape of the ask, not the styling: the tick
 * starts empty, the button works without it, and the wording beside the tick is
 * the string the consent record hashes rather than a copy of it that can drift.
 */

const STACK = {
  stackName: 'The Strength Foundation',
  items: [{ title: 'Whey Protein', reason: 'Builds and repairs muscle' }],
  monthly: 48.14,
  oneOff: 64.37,
}

function setup(over: Partial<React.ComponentProps<typeof SaveStackCard>> = {}) {
  const onDone = jest.fn()
  render(
    <SaveStackCard
      defaultEmail={null}
      defaultFirstName="Sam"
      source="quiz-reveal"
      track="performance"
      primaryGoal="muscle"
      stack={STACK}
      onDone={onDone}
      {...over}
    />,
  )
  return { onDone }
}

const fetchMock = () => jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })

beforeEach(() => {
  global.fetch = fetchMock() as unknown as typeof fetch
})

/**
 * The capture request, out of everything the component sent.
 *
 * The funnel events go out through `fetch` too when a browser has no
 * `sendBeacon` (jsdom does not), so "the first call" is an analytics beacon
 * about half the time. Match on the URL instead.
 */
function captureCall(): { body: Record<string, unknown> } | null {
  const call = (global.fetch as jest.Mock).mock.calls.find(
    ([url]) => typeof url === 'string' && url.includes('/api/audience/subscribe'),
  )
  return call ? { body: JSON.parse(call[1].body) } : null
}

describe('the ask', () => {
  it('offers the marketing tick unticked', async () => {
    setup()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('shows the exact sentence the consent record stores', () => {
    setup()
    expect(screen.getByText(MARKETING_CONSENT_STATEMENT)).toBeInTheDocument()
  })

  it('links the privacy notice at the field, where the law wants it', () => {
    setup()
    expect(screen.getByRole('link', { name: /how we handle your data/i })).toHaveAttribute(
      'href',
      '/legal/privacy',
    )
  })

  it('pre-fills an address we already hold rather than asking for it again', () => {
    setup({ defaultEmail: 'member@example.com' })
    expect(screen.getByLabelText(/email address/i)).toHaveValue('member@example.com')
  })
})

describe('submitting', () => {
  it('sends the stack with the box untouched — the tick is not the price', async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText(/email address/i), 'sam@example.com')
    await user.click(screen.getByRole('button', { name: /email me my stack/i }))

    await waitFor(() => expect(captureCall()).not.toBeNull())
    const body = captureCall()!.body as { email: string; marketingOptIn: boolean; stack: { items: { title: string }[] } }
    expect(body.email).toBe('sam@example.com')
    expect(body.marketingOptIn).toBe(false)
    expect(body.stack.items[0].title).toBe('Whey Protein')
  })

  it('passes the opt-in when it is ticked', async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText(/email address/i), 'sam@example.com')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /email me my stack/i }))

    await waitFor(() => expect(captureCall()).not.toBeNull())
    expect(captureCall()!.body.marketingOptIn).toBe(true)
  })

  it('will not submit something that is not an address', async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText(/email address/i), 'sam')
    await user.click(screen.getByRole('button', { name: /email me my stack/i }))

    expect(captureCall()).toBeNull()
  })

  it('confirms where it went, so the address can be checked for a typo', async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText(/email address/i), 'sam@example.com')
    await user.click(screen.getByRole('button', { name: /email me my stack/i }))

    expect(await screen.findByText(/sam@example.com/)).toBeInTheDocument()
  })

  it('says so plainly when it did not go through, and keeps what was typed', async () => {
    // Everything fails, analytics included — which is the honest simulation of
    // a phone that has just lost signal.
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText(/email address/i), 'sam@example.com')
    await user.click(screen.getByRole('button', { name: /email me my stack/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t go through/i)
    expect(screen.getByLabelText(/email address/i)).toHaveValue('sam@example.com')
  })
})

describe('refusing', () => {
  it('lets somebody wave it away without giving anything', async () => {
    const user = userEvent.setup()
    const { onDone } = setup()

    await user.click(screen.getByRole('button', { name: /no thanks/i }))
    expect(onDone).toHaveBeenCalled()
    // Waving it away sends no address anywhere.
    expect(captureCall()).toBeNull()
  })
})
