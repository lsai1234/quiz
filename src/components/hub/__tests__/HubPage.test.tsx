import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { render, screen } from '@testing-library/react'
import { HubPage } from '../HubPage'
import { useHubStore } from '@/lib/hub-store'

jest.mock('@/lib/hub-store', () => ({ useHubStore: jest.fn() }))
jest.mock('../SubscriptionDashboard', () => ({
  SubscriptionDashboard: () => <div>Your next box</div>,
}))

const mockStore = useHubStore as unknown as jest.Mock

/** The store is read with selectors, so the mock has to answer like one. */
function withState(state: Record<string, unknown>) {
  mockStore.mockImplementation((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      session: null,
      subscription: null,
      hydrated: false,
      providers: [],
      hydrate: jest.fn(),
      authenticate: jest.fn(),
      logout: jest.fn(),
      ...state,
    }),
  )
}

const SESSION = { email: 'member@example.com', name: 'Sam Reed' }
/** Enough of a plan to pick the dashboard branch; the dashboard itself is mocked. */
const PLAN = { status: 'active', lines: [] }

describe('HubPage', () => {
  afterEach(() => mockStore.mockReset())

  it('never flashes the login screen at a member who is signed in', () => {
    // "No session yet" and "signed out" are not the same thing, and this used
    // to treat them as one — so the whole hydration round-trip rendered
    // "Sign in to manage your stack" before the dashboard arrived.
    withState({ hydrated: false, session: null })
    render(<HubPage />)

    expect(screen.queryByText(/sign in to swap products/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('shows the login screen once we actually know they are signed out', () => {
    withState({ hydrated: true, session: null })
    render(<HubPage />)
    expect(screen.getByRole('heading', { name: /manage your stack/i })).toBeInTheDocument()
  })

  it('shows the dashboard, with somewhere to sign out, once the session lands', () => {
    withState({ hydrated: true, session: SESSION, subscription: PLAN })
    render(<HubPage />)

    expect(screen.getByText('Your next box')).toBeInTheDocument()
    // Sign-out was a naked underlined link floating next to the greeting.
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  /**
   * Signed in with no plan.
   *
   * `SubscriptionDashboard` renders nothing at all without a subscription, so
   * this was a header over an empty page — invisible only because the API used
   * to invent a plan for anyone who lacked one.
   */
  it('shows the no-plan screen rather than an empty page', () => {
    withState({ hydrated: true, session: SESSION, subscription: null })
    render(<HubPage />)

    expect(screen.getByRole('heading', { name: /hi sam/i })).toBeInTheDocument()
    expect(screen.getByText(/no plan on this account yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Your next box')).not.toBeInTheDocument()
  })

  it('keeps the sign-out action on the no-plan screen', () => {
    // Getting to a different account is the fix for the member whose plan is
    // under another email — it must not need a sign-out that isn't there.
    withState({ hydrated: true, session: SESSION, subscription: null })
    render(<HubPage />)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('never shows the no-plan screen while it is still finding out', () => {
    // Hydration starts with `subscription: null`, and flashing "you have no
    // plan" at a paying member is the same bug the login screen had.
    withState({ hydrated: false, session: SESSION, subscription: null })
    render(<HubPage />)
    expect(screen.queryByText(/no plan on this account yet/i)).not.toBeInTheDocument()
  })
})

describe('the hub', () => {
  it('never puts a browser dialog in front of a paying member', () => {
    // `alert('Live, this opens your Recharge billing portal.')` shipped on the
    // billing panel while the route it needed sat unused.
    const offences: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
          if (entry !== '__tests__') walk(path)
        } else if (/\.tsx?$/.test(entry)) {
          const source = readFileSync(path, 'utf8')
          if (/(?<![\w.])(alert|confirm|prompt)\s*\(/.test(source.replace(/\/\*[\s\S]*?\*\//g, ''))) {
            offences.push(path)
          }
        }
      }
    }
    walk('src/components/hub')

    expect(offences).toEqual([])
  })
})
