/**
 * What the results page may know of the offer: the heroes that take effect,
 * without the hub's audit fields, and the bonus only once the checkout can put
 * it on the order (or on a preview server).
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { BONUS_AT_CHECKOUT, bonusShown, publicOffer } from '../public'
import { activeHeroIds, DEFAULT_OFFER } from '../settings'
import { HERO_IDS, TODAY, allOn, approved } from './fixtures'

it('keeps the bonus from customers until the checkout carries it', () => {
  expect(BONUS_AT_CHECKOUT).toBe(false)
  expect(bonusShown({})).toBe(false)
  expect(bonusShown({ OFFER_BONUS_PREVIEW: '1' })).toBe(true)
  const shown = publicOffer(allOn(), MOCK_CATALOGUE, { today: TODAY, bonusShown: false })
  expect(shown.bonus.enabled).toBe(false)
  expect(shown.bonus.pool).toEqual([])
})

it('shows the bonus on a preview server, its pool limited to the catalogue', () => {
  const settings = allOn()
  settings.bonus.pool = [...settings.bonus.pool, 'not-a-product']
  const shown = publicOffer(settings, MOCK_CATALOGUE, { today: TODAY, bonusShown: true })
  expect(shown.bonus.enabled).toBe(true)
  expect(shown.bonus.pool).not.toContain('not-a-product')
})

it('sends only heroes that take effect, without who checked them or their notes', () => {
  const settings = allOn()
  settings.heroes['chrgd-bcaa'] = { ...approved('chrgd-bcaa'), legalGB: false }
  const shown = publicOffer(settings, MOCK_CATALOGUE, { today: TODAY })
  expect(Object.keys(shown.heroes).sort()).toEqual([...HERO_IDS].sort())
  for (const a of Object.values(shown.heroes)) {
    expect(a.safetyNotes).toBe('')
    expect(a.updatedBy).toBeNull()
    expect(a.checkedBy).toBe('checked')
  }
  // And the page's own re-run of the checks reaches the same heroes.
  expect(activeHeroIds(shown, MOCK_CATALOGUE, TODAY)).toEqual(activeHeroIds(settings, MOCK_CATALOGUE, TODAY))
})

it('reads as everything off when the hub has nothing on', () => {
  const shown = publicOffer(DEFAULT_OFFER, MOCK_CATALOGUE, { today: TODAY, bonusShown: true })
  expect(shown.heroEnabled).toBe(false)
  expect(shown.bonus.enabled).toBe(false)
})
