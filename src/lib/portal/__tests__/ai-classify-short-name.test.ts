/**
 * The short name written during import.
 *
 * A new product is classified once on the way in, and that pass now names it
 * too — so a founder importing three hundred products gets three hundred card
 * names without pressing a second button.
 *
 * What is under test is that the name arriving inside a CLASSIFICATION is held
 * to exactly the same standard as one from the dedicated pass. It would be very
 * easy for it not to be: it comes back in the same JSON as the stack slots,
 * which are validated by "is it in this list", and a name has no list.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'

const create = jest.fn()
jest.mock('openai', () => ({
  __esModule: true,
  default: class { chat = { completions: { create: (...a: unknown[]) => create(...a) } } },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { aiClassifyProduct } = require('../ai-classify') as typeof import('../ai-classify')

const PRODUCT = {
  id: 'p', title: 'Marine Collagen Peptides - Skin & Joints - 300g', handle: 'p',
  description: 'Hydrolysed marine collagen peptides.', category: 'Collagen',
  imageUrl: null, stackSlots: [], goals: [], dietaryTags: [], formats: ['powder'],
  variants: [], basePrice: 30, compareAtPrice: null, subscriptionEligible: true,
  servings: 30, swapGroup: 'general', recommendationPriority: 5, marginPriority: 5,
  isCoreEligible: true, isBoosterEligible: true, hasStimulants: false,
  shortReason: '', warnings: [],
} as unknown as CatalogueProduct

const answers = (obj: Record<string, unknown>) =>
  create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(obj) } }] })

const BASE = { stackSlots: ['recovery'], goals: ['recovery'], swapGroup: 'collagen', servings: 30 }

describe('the import classifier names the product too', () => {
  const KEY = process.env.OPENAI_API_KEY
  beforeEach(() => { create.mockReset(); process.env.OPENAI_API_KEY = 'test-key' })
  afterAll(() => { if (KEY === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = KEY })

  it('keeps a good name, alongside the classification', async () => {
    answers({ ...BASE, shortName: 'Marine Collagen' })
    const { patch, source } = await aiClassifyProduct(PRODUCT)
    expect(source).toBe('ai')
    expect(patch.shortName).toBe('Marine Collagen')
    expect(patch.swapGroup).toBe('collagen')
  })

  it('refuses an invented name, and still keeps the classification', async () => {
    // The important half is the second clause: a bad NAME must not cost the
    // product its slots and goals. They are independent answers in one reply.
    answers({ ...BASE, shortName: 'Glow Complex' })
    const { patch } = await aiClassifyProduct(PRODUCT)
    expect(patch.shortName).toBeUndefined()
    expect(patch.stackSlots).toEqual(['recovery'])
    expect(patch.swapGroup).toBe('collagen')
  })

  it('refuses a health claim', async () => {
    answers({ ...BASE, shortName: 'Joint Cure' })
    expect((await aiClassifyProduct(PRODUCT)).patch.shortName).toBeUndefined()
  })

  it('refuses one that will not fit the card', async () => {
    answers({ ...BASE, shortName: 'Marine Collagen Peptides Skin And Joints' })
    expect((await aiClassifyProduct(PRODUCT)).patch.shortName).toBeUndefined()
  })

  it('survives the field being missing, empty, or the wrong type', async () => {
    for (const shortName of [undefined, '', '   ', 42, null, []]) {
      answers({ ...BASE, shortName })
      const { patch } = await aiClassifyProduct(PRODUCT)
      expect(patch.shortName).toBeUndefined()
      expect(patch.swapGroup).toBe('collagen')
    }
  })

  it('a refused name leaves the product usable, not nameless', async () => {
    // Nothing downstream needs the field: `shortNameOf` derives from the title.
    const { shortNameOf } = require('@/lib/catalogue/short-name')
    answers({ ...BASE, shortName: 'Glow Complex' })
    const { patch } = await aiClassifyProduct(PRODUCT)
    expect(shortNameOf({ ...PRODUCT, ...patch })).toBe('Marine Collagen Peptides')
  })
})
