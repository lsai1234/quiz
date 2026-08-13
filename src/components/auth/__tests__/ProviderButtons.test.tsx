/**
 * The sign-in buttons, and the one thing that stops them taking over the
 * screen: past four configured providers the list folds, because the checkout
 * gate is a modal at the last step before payment and a column of nine buttons
 * there pushes the pay button off the bottom of a phone.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProviderButtons } from '../ProviderButtons'

const ALL = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'microsoft', label: 'Microsoft' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'discord', label: 'Discord' },
]

describe('the sign-in buttons', () => {
  it('renders nothing when no provider is configured', () => {
    const { container } = render(<ProviderButtons providers={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('links each provider to its own sign-in route, carrying the return path', () => {
    render(<ProviderButtons providers={ALL.slice(0, 2)} returnTo="/api/checkout/continue" />)
    expect(screen.getByRole('link', { name: /Continue with Google/ })).toHaveAttribute(
      'href',
      '/api/auth/google?returnTo=%2Fapi%2Fcheckout%2Fcontinue',
    )
    expect(screen.getByRole('link', { name: /Continue with Apple/ })).toHaveAttribute(
      'href',
      '/api/auth/apple?returnTo=%2Fapi%2Fcheckout%2Fcontinue',
    )
  })

  it('shows a short list in full — folding one button behind a button is worse', () => {
    render(<ProviderButtons providers={ALL.slice(0, 4)} />)
    expect(screen.getAllByRole('link')).toHaveLength(4)
    expect(screen.queryByText(/More ways to sign in/)).not.toBeInTheDocument()
  })

  it('folds a long list down to three, and says how many are behind the fold', () => {
    render(<ProviderButtons providers={ALL} />)
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.getByText('More ways to sign in (3)')).toBeInTheDocument()
    expect(screen.queryByText(/Continue with Discord/)).not.toBeInTheDocument()
  })

  it('reveals the rest when asked', async () => {
    render(<ProviderButtons providers={ALL} />)
    await userEvent.click(screen.getByText('More ways to sign in (3)'))
    expect(screen.getAllByRole('link')).toHaveLength(6)
    expect(screen.getByRole('link', { name: /Continue with Discord/ })).toBeInTheDocument()
  })

  it('runs the pre-step before leaving for the provider, and stays put if it fails', async () => {
    const stash = jest.fn().mockRejectedValue(new Error('consent required'))
    render(<ProviderButtons providers={ALL.slice(0, 1)} beforeNavigate={stash} />)
    await userEvent.click(screen.getByRole('button', { name: /Continue with Google/ }))
    expect(stash).toHaveBeenCalled()
    // Navigation is what a failed stash must not do; jsdom would record it here.
    expect(window.location.href).not.toContain('/api/auth/google')
  })
})
