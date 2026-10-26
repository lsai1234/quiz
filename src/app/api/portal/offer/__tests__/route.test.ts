/**
 * @jest-environment node
 */
/**
 * Settings → Offer's API: founders only, off by default, the hero checks
 * stamped with the signed-in founder, and the live rows for the review pack.
 */
const founder = { value: { email: 'founder@test', name: 'F' } as { email: string; name: string } | null }
jest.mock('@/lib/portal/guard', () => ({
  isPortalAuthed: async () => founder.value !== null,
  getFounder: async () => founder.value,
}))
jest.mock('@/lib/portal/store', () => ({ ...jest.requireActual('@/lib/portal/store'), syncPortalRuntime: async () => {} }))

import { GET, POST } from '../route'
import { GET as HERO_GET, POST as HERO_POST } from '../hero/route'
import { GET as ROWS_GET } from '../review-rows/route'
import type { OfferView } from '@/lib/offer/view'
import type { HeroView } from '@/lib/offer/view'

const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  founder.value = { email: 'founder@test', name: 'F' }
})

it('is founders only', async () => {
  founder.value = null
  expect((await GET()).status).toBe(401)
  expect((await POST(post({ heroEnabled: true }))).status).toBe(401)
  expect((await HERO_GET(new Request('http://x?id=a'))).status).toBe(401)
  expect((await HERO_POST(post({ id: 'a', approval: { hero: true } }))).status).toBe(401)
  expect((await ROWS_GET()).status).toBe(401)
})

it('starts with both switches off, and shows the numbers to set the bonus by', async () => {
  const view = (await (await GET()).json()) as OfferView
  expect(view.settings.heroEnabled).toBe(false)
  expect(view.settings.bonus.enabled).toBe(false)
  expect(view.active).toEqual({ heroes: [], bonusPool: [] })
  expect(view.economics.stacks.map((s) => s.name)).toEqual(['Essentials', 'Balanced', 'Complete'])
  expect(view.products.length).toBeGreaterThan(0)
})

it('saves a pool, and works out the proposal from it', async () => {
  const view = (await (await POST(post({ bonus: { pool: ['chrgd-vitamin-d3-k2'] } }))).json()) as OfferView
  expect(view.settings.bonus.pool).toEqual(['chrgd-vitamin-d3-k2'])
  expect(view.economics.rows).toHaveLength(1)
  expect(view.economics.proposal).not.toBeNull()
  // Still off: a pool is not a switch.
  expect(view.active.bonusPool).toEqual([])
  await POST(post({ bonus: { pool: [] } }))
})

it('records hero checks against the signed-in founder, and keeps a hero with gaps off', async () => {
  const res = await HERO_POST(post({ id: 'chrgd-whey-protein', approval: { hero: true, legalGB: true, updatedBy: 'spoof' } }))
  const view = (await res.json()) as HeroView
  expect(view.row.approval.updatedBy).toBe('founder@test')
  expect(view.row.status).toBe('incomplete')
  expect(view.row.missing).toEqual(expect.arrayContaining(['novel-food', 'safety', 'wording', 'checked-by', 'checked-at']))
  expect(view.claimChoices.map((c) => c.id)).toContain('protein-muscle-growth')

  const rows = await (await ROWS_GET()).text()
  expect(rows).toMatch(/Hero: CHRGD Whey Protein/)
  expect(rows).toMatch(/Checks missing/)
  expect(rows).toMatch(/First order only, one per customer/)
})
