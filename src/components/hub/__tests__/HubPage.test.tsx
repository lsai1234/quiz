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
      hydrated: false,
      providers: [],
      hydrate: jest.fn(),
      authenticate: jest.fn(),
      logout: jest.fn(),
      ...state,
    }),
  )
}

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
    withState({ hydrated: true, session: { email: 'member@example.com', name: 'Sam Reed' } })
    render(<HubPage />)

    expect(screen.getByText('Your next box')).toBeInTheDocument()
    // Sign-out was a naked underlined link floating next to the greeting.
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
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
