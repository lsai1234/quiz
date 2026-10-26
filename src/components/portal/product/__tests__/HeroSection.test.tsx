import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeroSection } from '../HeroSection'
import { emptyHeroApproval } from '@/lib/offer/settings'
import { heroRow, type HeroView } from '@/lib/offer/view'

/**
 * A product's Hero section: what it is missing, and a save that sends only the
 * checks. Drawn from what the server page read — it asks nothing on render.
 */
const product = { id: 'whey', title: 'Whey', swapGroup: 'protein-whey' } as never

function view(approval = emptyHeroApproval('whey')): HeroView {
  return {
    row: heroRow('whey', approval, product),
    claimChoices: [{ id: 'protein-muscle-growth', wording: 'Protein contributes to a growth in muscle mass' }],
    heroEnabled: false,
  }
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
})

it('asks nothing on render, and says the switch in Settings is off', () => {
  global.fetch = jest.fn() as unknown as typeof fetch
  render(<HeroSection initial={view()} onDirty={() => {}} />)
  expect(global.fetch).not.toHaveBeenCalled()
  expect(screen.getByText('Not a hero')).toBeInTheDocument()
})

it('shows what a hero is missing, and saves the checks', async () => {
  const started = { ...emptyHeroApproval('whey'), hero: true }
  const saved = { ...started, legalGB: true }
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => view(saved) })) as unknown as typeof fetch
  render(<HeroSection initial={view(started)} onDirty={() => {}} />)
  expect(screen.getByText('Hero, checks missing')).toBeInTheDocument()
  expect(screen.getByText(/No effect until these are done: Legal to sell in GB/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: /Legal to sell in GB/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Save hero checks' }))
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toBe('/api/portal/offer/hero')
  expect(JSON.parse(init.body)).toMatchObject({ id: 'whey', approval: { hero: true, legalGB: true } })
  expect(await screen.findByText(/No effect until these are done: Novel food/)).toBeInTheDocument()
})
