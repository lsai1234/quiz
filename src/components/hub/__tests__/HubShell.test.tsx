import { render, screen, within } from '@testing-library/react'
import { HubShell } from '../HubShell'

const mockSettings: { current: unknown } = { current: null }
jest.mock('@/hooks/useOfferSettings', () => ({ useOfferSettings: () => ({ settings: mockSettings.current }) }))
const mockTrainerLive = jest.fn(() => true)
jest.mock('@/lib/offer/settings', () => ({ trainerLive: () => mockTrainerLive() }))

/**
 * The hub's chrome: on a phone, a tab bar at the thumb; on a wide screen, the
 * same places as links in the header. Both are in the page and CSS shows one
 * (`.hub-tabbar`, `.hub-header-nav` in `system.css`), so each is asserted by
 * its own mark.
 */
describe('HubShell', () => {
  beforeEach(() => mockTrainerLive.mockReturnValue(true))

  it('gives a signed-in member a tab bar with the place they are in marked', () => {
    const { container } = render(
      <HubShell nav="training" onSignOut={() => {}}>
        <p>Your week</p>
      </HubShell>,
    )
    const bar = container.querySelector('[data-hub-tabbar]') as HTMLElement
    expect(bar).toBeInTheDocument()
    const tabs = within(bar).getAllByRole('link')
    expect(tabs.map((t) => t.textContent)).toEqual(['Home', 'Training', 'Trainer'])
    expect(within(bar).getByRole('link', { name: 'Training' })).toHaveAttribute('aria-current', 'page')
    expect(within(bar).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    expect(within(bar).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/myhub')
    // The same places in the header, for a wide screen.
    expect(container.querySelector('[data-hub-nav="training"]')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('has no tab bar while signed out: there is nowhere to go yet', () => {
    const { container } = render(
      <HubShell>
        <p>Sign in</p>
      </HubShell>,
    )
    expect(container.querySelector('[data-hub-tabbar]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-hub-nav]')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('offers the trainer only while there is one to ask, or you are already there', () => {
    mockTrainerLive.mockReturnValue(false)
    const home = render(
      <HubShell nav="home" onSignOut={() => {}}>
        <p>Home</p>
      </HubShell>,
    )
    expect(home.container.querySelector('[data-hub-tab="trainer"]')).not.toBeInTheDocument()
    expect(home.container.querySelectorAll('[data-hub-tab]')).toHaveLength(2)
    home.unmount()

    const there = render(
      <HubShell nav="trainer" onSignOut={() => {}}>
        <p>Trainer</p>
      </HubShell>,
    )
    expect(there.container.querySelector('[data-hub-tab="trainer"]')).toHaveAttribute('aria-current', 'page')
  })

  it('carries the region class the focus floor hangs off', () => {
    const { container } = render(
      <HubShell>
        <p>x</p>
      </HubShell>,
    )
    expect(container.querySelector('.my-hub')).toBeInTheDocument()
  })
})
