import { fieldLabels, needsPull, pullSummary, stopFor, supplierGaps, unanswered, unansweredStop } from '../queue-model'
import { pendingProduct } from './fixtures'

describe('needsPull', () => {
  it('skips a product that already has a picture, a description and every SKU’s PowerBody id', () => {
    expect(needsPull(pendingProduct())).toBe(false)
  })

  it('wants one missing a picture, a description, or any SKU’s id', () => {
    expect(needsPull(pendingProduct({ imageUrl: null }))).toBe(true)
    expect(needsPull(pendingProduct({ description: '   ' }))).toBe(true)
    expect(
      needsPull(
        pendingProduct({
          variants: [
            { id: 'a', title: 'A', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, sku: 'P1', supplierProductId: '1' },
            { id: 'b', title: 'B', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, sku: 'P2' },
          ],
        }),
      ),
    ).toBe(true)
  })

  it('counts a one-SKU product’s id held on the product', () => {
    const p = pendingProduct({
      supplierProductId: '55',
      variants: [{ id: 'a', title: 'A', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, sku: 'P55' }],
    })
    expect(supplierGaps(p)).toMatchObject({ skus: 1, withIds: 1 })
    expect(needsPull(p)).toBe(false)
  })

  it('never asks about a product with no SKU — there is nothing to ask', () => {
    const p = pendingProduct({
      imageUrl: null,
      variants: [{ id: 'a', title: 'A', flavour: null, size: null, price: 30, compareAtPrice: null, available: true }],
    })
    expect(needsPull(p)).toBe(false)
  })
})

describe('stopFor', () => {
  it('carries on when PowerBody answered, even with nothing new', () => {
    expect(stopFor({ ok: true, answered: 1, filled: [], unresolved: [] })).toBeNull()
  })

  it('carries on past a SKU that was simply not reached in time', () => {
    expect(stopFor({ ok: true, answered: 0, unresolved: [{ sku: 'P1', message: 'Not reached this time — pull again to carry on.' }] })).toBeNull()
  })

  it('stops on a rate limit, a DEMO account or a refused login, with PowerBody’s words', () => {
    const limited = 'PowerBody are limiting how fast we can ask (“429 Too Many Requests”). It passes on its own — wait a minute, then carry on.'
    expect(stopFor({ ok: true, answered: 0, unresolved: [{ sku: 'P1', message: limited }] })).toEqual({ kind: 'rate-limited', message: limited })
    expect(stopFor({ ok: true, answered: 0, unresolved: [{ sku: 'P1', message: 'PowerBody’s answer suggests this API account is still their DEMO sandbox' }] })?.kind).toBe('sandbox')
    expect(stopFor({ ok: true, answered: 0, unresolved: [{ sku: 'P1', message: 'PowerBody did not accept our login (“bad key”).' }] })?.kind).toBe('credentials')
  })

  it('carries on past a refusal the pull got round — every SKU answered in the end', () => {
    expect(stopFor({ ok: true, answered: 2, unresolved: [], refused: { kind: 'supplier-error', message: 'PowerBody would not answer: fault' } })).toBeNull()
  })

  it('goes by the refusal the pull names, whatever words it comes in', () => {
    expect(stopFor({ ok: true, answered: 0, unresolved: [], refused: { kind: 'credentials', message: 'Nope.' } })).toEqual({ kind: 'credentials', message: 'Nope.' })
    expect(stopFor({ ok: true, answered: 1, unresolved: [{ sku: 'P2', message: 'Slow down.', refusal: 'rate-limited' }] })?.kind).toBe('rate-limited')
  })

  it('stops when the detail call itself was refused before anything was searched', () => {
    const stop = stopFor({ ok: true, answered: 0, unresolved: [], trace: [{ message: 'PowerBody would not answer: SOAP fault' }] })
    expect(stop).toEqual({ kind: 'supplier-error', message: 'PowerBody would not answer: SOAP fault' })
  })

  it('stops when our own server could not save, but not over one product that has gone', () => {
    expect(stopFor({ ok: false, status: 500, error: 'Not saved — database locked' })?.kind).toBe('server')
    expect(stopFor({ ok: false, status: 404, error: 'There is no such product.' })).toBeNull()
  })

  it('stops when the supplier is the sample one — nothing reaches PowerBody', () => {
    const message = 'P1 is not in the sample catalogue — the supplier is set to Sample, so nothing is being asked of PowerBody.'
    expect(stopFor({ ok: true, answered: 0, unresolved: [{ sku: 'P1', message }] })?.kind).toBe('sample')
  })
})

describe('pullSummary', () => {
  it('says what was filled, in words', () => {
    expect(pullSummary({ ok: true, filled: ['imageUrl', 'description', 'cost'], changed: { P1: 'cost £10' } })).toEqual({
      tone: 'positive',
      text: 'Filled the picture, description; updated 1 SKU.',
    })
  })

  it('says when PowerBody had nothing new, with the next step', () => {
    expect(pullSummary({ ok: true, filled: [], changed: {} }).text).toMatch(/nothing new.*open it/i)
  })
})

describe('fieldLabels', () => {
  it('names review fields the way the product page does', () => {
    expect(fieldLabels(['stackSlots', 'shortReason', 'mystery'])).toEqual(['Stack slots', 'Card copy', 'mystery'])
  })
})

describe('unanswered', () => {
  it('is a pull with no result line, or one the route had to stop', () => {
    expect(unanswered(null)).toBe(true)
    expect(unanswered({ ok: true, timedOut: true, answered: 2 })).toBe(true)
    expect(unanswered({ ok: false, status: 504, timedOut: true, error: 'PowerBody did not answer in time' })).toBe(true)
    expect(unanswered({ ok: true, answered: 0, unresolved: [] })).toBe(false)
  })

  it('stops a run at the second in a row, not the first', () => {
    expect(unansweredStop(1)).toBeNull()
    expect(unansweredStop(2)).toMatchObject({ kind: 'unanswered', message: expect.stringMatching(/stopped answering/) })
  })
})
