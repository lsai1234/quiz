/**
 * @jest-environment node
 */
/**
 * The finder asks five quick questions and every answer is one of the shop's
 * own filters. These hold that promise: answers round-trip through the query
 * and the address, counts are the shelves' own, and no option on offer ever
 * leads to an empty shop.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { isClaimSafe } from '@/lib/shop/claim-safety'
import { EMPTY_QUERY, applyShopQuery } from '../shop-query'
import { decodeShopQuery, encodeShopQuery } from '../query-url'
import { buildIndex } from '../search'
import {
  clearAnswer,
  countFor,
  finderCanShow,
  finderQuestions,
  firstOpen,
  isAnswered,
  isSelected,
  optionCount,
  pick,
  readTyped,
} from '../finder'

const products = MOCK_CATALOGUE
const index = buildIndex(products)
const questions = finderQuestions(products)
const formats = questions.find((q) => q.id === 'format')!.options.map((o) => o.id)

describe('the questions', () => {
  it('asks five, in order, the last one only ordering', () => {
    expect(questions.map((q) => q.id)).toEqual(['goal', 'avoid', 'format', 'budget', 'sort'])
    expect(questions.map((q) => q.counts)).toEqual([true, true, true, true, false])
  })

  it('offers only what the catalogue can answer', () => {
    const goals = new Set(products.flatMap((p) => p.goals))
    for (const o of questions[0].options) expect(goals.has(o.id as never)).toBe(true)
    // No product here is nut-free, so nuts are not offered.
    expect(questions[1].options.map((o) => o.id)).not.toContain('nut-free')
    expect(questions[1].options.map((o) => o.id)).toContain('caffeine')
    expect(questions[2].options.map((o) => o.label)).toEqual(expect.arrayContaining(['Scoop and shake', 'Capsules', 'Fizzy tablets']))
  })

  it('never offers an option that leaves an empty shop, from a standing start', () => {
    for (const q of questions) {
      for (const o of q.options) {
        const n = optionCount(products, EMPTY_QUERY, q, o.id, index)
        if (q.counts) expect(n).toBeGreaterThan(0)
        else expect(n).toBeNull()
      }
    }
  })

  it('labels are names, never claims', () => {
    for (const q of questions) {
      expect(isClaimSafe(q.title)).toBe(true)
      for (const o of q.options) expect(isClaimSafe(o.label)).toBe(true)
    }
  })
})

describe('answers are the shop filters', () => {
  it('round-trips every option through the query and the address', () => {
    for (const q of questions) {
      for (const o of q.options) {
        const answered = pick(EMPTY_QUERY, q.id, o.id)
        expect(isSelected(answered, q.id, o.id)).toBe(true)
        const back = decodeShopQuery(encodeShopQuery(answered))
        expect(isSelected(back, q.id, o.id)).toBe(true)
        if (!(q.id === 'sort' && o.id === 'relevance')) expect(isAnswered(back, q.id)).toBe(true)
      }
    }
  })

  it('a single answer replaces, the same tap takes it back; a multi answer toggles', () => {
    let q = pick(EMPTY_QUERY, 'goal', 'muscle')
    q = pick(q, 'goal', 'energy')
    expect(q.goals).toEqual(['energy'])
    expect(pick(q, 'goal', 'energy').goals).toEqual([])

    let a = pick(EMPTY_QUERY, 'avoid', 'vegan')
    a = pick(a, 'avoid', 'caffeine')
    expect(a.dietary).toEqual(['vegan'])
    expect(a.stimFree).toBe(true)
    a = pick(a, 'avoid', 'vegan')
    expect(a.dietary).toEqual([])
    expect(clearAnswer(pick(a, 'avoid', 'dairy-free'), 'avoid')).toMatchObject({ dietary: [], stimFree: false })
  })

  it('counts are what the shelves then show', () => {
    const q = pick(pick(EMPTY_QUERY, 'goal', 'muscle'), 'avoid', 'vegan')
    expect(countFor(products, q, index)).toBe(applyShopQuery(products, q, index).products.length)
    expect(countFor(products, q, index)).toBe(3)
    const avoid = questions[1]
    // Dairy on top of vegan leaves the same three; an option already on shows the current count.
    expect(optionCount(products, q, avoid, 'dairy-free', index)).toBe(3)
    expect(optionCount(products, q, avoid, 'vegan', index)).toBe(3)
  })

  it('picks up where the query leaves off, and past questions stay passed', () => {
    const q = pick(EMPTY_QUERY, 'goal', 'muscle')
    expect(firstOpen(questions, q)).toBe(1)
    expect(firstOpen(questions, q, new Set(['avoid']))).toBe(2)
    expect(firstOpen(questions, pick(pick(pick(pick(q, 'avoid', 'vegan'), 'format', 'powder'), 'budget', '30'), 'sort', 'rating'))).toBe(5)
  })

  it('knows a query it can show as answers from one it cannot', () => {
    expect(finderCanShow(pick(pick(EMPTY_QUERY, 'goal', 'muscle'), 'budget', '20'))).toBe(true)
    expect(finderCanShow({ ...EMPTY_QUERY, categories: ['Protein'] })).toBe(false)
    expect(finderCanShow({ ...EMPTY_QUERY, onDealOnly: true })).toBe(false)
    expect(finderCanShow({ ...EMPTY_QUERY, goals: ['muscle', 'energy'] })).toBe(false)
  })
})

describe('typed answers', () => {
  it('reads "vegan protein under £40" into two answers and a search', () => {
    const r = readTyped('vegan protein under £40', EMPTY_QUERY, formats)
    expect(r.query).toMatchObject({ dietary: ['vegan'], priceMax: 40, q: 'protein' })
    expect(r.answered.sort()).toEqual(['avoid', 'budget'])
    expect(r.matched).toEqual(expect.arrayContaining(['vegan', 'under £40', 'protein']))
    expect(countFor(products, r.query, index)).toBe(1)
  })

  it('turns goal and format words into those answers', () => {
    const r = readTyped('sleep capsules, no caffeine', EMPTY_QUERY, formats)
    expect(r.query).toMatchObject({ goals: ['sleep-better'], formats: ['capsules'], stimFree: true, q: '' })
    expect(r.answered.sort()).toEqual(['avoid', 'format', 'goal'])
  })

  it('keeps answers already given, and leaves phrasing it does not answer to the search', () => {
    const before = pick(EMPTY_QUERY, 'goal', 'energy')
    const r = readTyped('on sale', before, formats)
    expect(r.query.goals).toEqual(['energy'])
    expect(r.query.q).toBe('on sale')
    expect(r.answered).toEqual([])
  })
})
