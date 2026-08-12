/**
 * The consent gate — the step a signed-in member gets instead of the account
 * gate. Same documents, same tick-box, no account questions.
 *
 * The server enforces consent regardless (`checkout/__tests__/finalize.test.ts`),
 * so these pin the two things the UI is responsible for: that the member is
 * SHOWN the terms and the health information before they can agree, and that
 * what goes back names the versions the server asked for.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsentGate } from '../ConsentGate'
import { TERMS_VERSION, DISCLAIMER_VERSION } from '@/lib/legal/content'

const setup = (props: Partial<React.ComponentProps<typeof ConsentGate>> = {}) => {
  const onAccept = jest.fn()
  const onCancel = jest.fn()
  render(<ConsentGate onAccept={onAccept} onCancel={onCancel} {...props} />)
  return { onAccept, onCancel, user: userEvent.setup() }
}

const confirm = () => screen.getByRole('button', { name: /agree & start subscription/i })

describe('ConsentGate', () => {
  it('shows the billing terms and the health disclaimer before anyone can agree', () => {
    setup()
    expect(screen.getByText(/nothing we send you is medical advice/i)).toBeInTheDocument()
    expect(screen.getByText(/always read the label/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /subscription terms/i })).toHaveAttribute('href', '/legal/terms')
    expect(screen.getByRole('link', { name: /health and allergen information/i }))
      .toHaveAttribute('href', '/legal/disclaimer')
  })

  it('will not confirm until the box is ticked', async () => {
    const { onAccept, user } = setup()
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
    const { onAccept, user } = setup({ versions })

    await user.click(screen.getByRole('checkbox'))
    await user.click(confirm())

    expect(onAccept).toHaveBeenCalledWith({
      accepted: true,
      termsVersion: '2099-01-01',
      disclaimerVersion: '2099-02-02',
    })
  })

  it('explains itself when the terms changed mid-checkout', () => {
    setup({ notice: 'Our terms were updated while you were here.' })
    expect(screen.getByText(/our terms were updated/i)).toBeInTheDocument()
  })

  it('lets the member back out without subscribing', async () => {
    const { onCancel, onAccept, user } = setup()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
    expect(onAccept).not.toHaveBeenCalled()
  })
})
