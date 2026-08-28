/**
 * The short-name derivation, tested against the titles it actually has to
 * survive: the CHRGD mock catalogue and the real supplier roster in
 * `docs/rosters/chrgd-roster.csv`, which is where the awkward shapes live
 * ("ZMA - Sports Recovery - 90 vcaps", "Kre-Alkalyn EFX (Clear Caps) - 120
 * caps").
 */
import { deriveShortName, shortNameOf, shortNameNeedsWork, SHORT_NAME_MAX } from '../short-name'
import { MOCK_CATALOGUE } from '@/lib/catalogue'

describe('deriveShortName', () => {
  it.each([
    // Our own brand is the card, not the product.
    ['CHRGD Whey Protein', 'Whey Protein'],
    ['CHRGD Creatine Monohydrate', 'Creatine Monohydrate'],
    // A hyphenated WORD is not a sub-clause: only a spaced dash splits.
    ['CHRGD Stim-Free Pre-Workout', 'Stim-Free Pre-Workout'],
    ['Kre-Alkalyn EFX (Clear Caps) - 120 caps', 'Kre-Alkalyn EFX'],
    // Pack sizes, in every shape the roster writes them.
    ['Creatine Monohydrate Powder - 250g', 'Creatine Monohydrate'],
    ['Vitamin D3 + K2 - 90 softgels', 'Vitamin D3 + K2'],
    ['Vegan Multivitamin - 60 tablets', 'Vegan Multivitamin'],
    ['Collagen Peptides - Joints & Bones - 153g', 'Collagen Peptides'],
    ['ZMA - Sports Recovery - 90 vcaps', 'ZMA'],
    ['Neuro Optimizer - 120 caps', 'Neuro Optimizer'],
    // A leading percentage claim, then a trailing tier word.
    ['100% Whey Protein Professional', 'Whey Protein'],
    // Already short enough — left completely alone.
    ['Ultimate Omega + CoQ10', 'Ultimate Omega + CoQ10'],
    ['Super Strong Omega 3', 'Super Strong Omega 3'],
    ['Hydration+', 'Hydration+'],
    ['L-Glutamine', 'L-Glutamine'],
  ])('%s → %s', (title, expected) => {
    expect(deriveShortName({ title })).toBe(expected)
  })

  it('never returns an empty name for a product that has one', () => {
    for (const title of ['CHRGD', '250g', '- 90 vcaps', 'x', 'CHRGD 1kg']) {
      expect(deriveShortName({ title }).length).toBeGreaterThan(0)
    }
  })

  it('returns nothing only when there was nothing', () => {
    expect(deriveShortName({ title: '' })).toBe('')
  })

  it('never ends on dangling punctuation', () => {
    for (const p of MOCK_CATALOGUE) {
      expect(deriveShortName(p)).not.toMatch(/[\s,;:&+/–—-]$/)
    }
  })

  it('keeps the whole real catalogue inside the poster budget', () => {
    for (const p of MOCK_CATALOGUE) {
      expect(deriveShortName(p).length).toBeLessThanOrEqual(SHORT_NAME_MAX)
    }
  })

  it('a name too long to break stays a name rather than becoming nothing', () => {
    // One word, no spaces, over budget: there is nowhere to cut on a boundary.
    const out = deriveShortName({ title: 'Methylsulfonylmethanesulfonate' })
    expect(out.length).toBeLessThanOrEqual(SHORT_NAME_MAX)
    expect(out.length).toBeGreaterThan(0)
  })

  it('does not drop the word that says WHICH product it is', () => {
    // "Isolate", "Hydrolysed" and "Monohydrate" distinguish two products that
    // would otherwise both shorten to the same thing. They are not filler.
    expect(deriveShortName({ title: 'Whey Protein Isolate' })).toContain('Isolate')
    expect(deriveShortName({ title: 'Creatine Monohydrate Powder - 250g' })).toContain('Monohydrate')
    expect(deriveShortName({ title: 'Collagen Hydrolysed Type I & III' })).toContain('Hydrolysed')
  })
})

describe('shortNameOf', () => {
  it('prefers the stored name', () => {
    expect(shortNameOf({ title: 'CHRGD Whey Protein', shortName: 'Whey' })).toBe('Whey')
  })

  it('falls back to the derivation when the field is absent, null or blank', () => {
    const title = 'CHRGD Whey Protein'
    expect(shortNameOf({ title })).toBe('Whey Protein')
    expect(shortNameOf({ title, shortName: null })).toBe('Whey Protein')
    expect(shortNameOf({ title, shortName: '   ' })).toBe('Whey Protein')
  })
})

describe('shortNameNeedsWork', () => {
  it('flags absent, over-budget, and copied-title names', () => {
    const title = 'Collagen Peptides - Joints & Bones - 153g'
    expect(shortNameNeedsWork({ title })).toBe(true)
    expect(shortNameNeedsWork({ title, shortName: title })).toBe(true)
    expect(shortNameNeedsWork({ title, shortName: 'A name well over the poster budget' })).toBe(true)
    expect(shortNameNeedsWork({ title, shortName: 'Collagen Peptides' })).toBe(false)
  })
})

// ─── The AI pass ──────────────────────────────────────────────────────────────
// The model is stubbed. What is under test is the set of checks around it —
// which is the whole point of the design: the prompt is a request, the checks
// are the rule, and the checks are what makes it safe to run over the catalogue.

const create = jest.fn()
jest.mock('openai', () => ({
  __esModule: true,
  default: class { chat = { completions: { create: (...a: unknown[]) => create(...a) } } },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { aiShortName } = require('../short-name') as typeof import('../short-name')

const PRODUCT = {
  title: 'Marine Collagen Peptides - Skin & Joints - 300g',
  description: 'Hydrolysed marine collagen peptides.',
  category: 'Collagen',
}
const answers = (text: string) => create.mockResolvedValue({ choices: [{ message: { content: text } }] })

describe('aiShortName', () => {
  const KEY = process.env.OPENAI_API_KEY
  beforeEach(() => { create.mockReset(); process.env.OPENAI_API_KEY = 'test-key' })
  afterAll(() => { if (KEY === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = KEY })

  it('uses a grounded, short, claim-free answer', async () => {
    answers('Marine Collagen')
    await expect(aiShortName(PRODUCT)).resolves.toMatchObject({ shortName: 'Marine Collagen', source: 'ai' })
  })

  it('strips the quotes a model wraps a one-line answer in', async () => {
    answers('"Marine Collagen"')
    await expect(aiShortName(PRODUCT)).resolves.toMatchObject({ shortName: 'Marine Collagen', source: 'ai' })
  })

  it('rejects an invented name — the check that makes a bulk run safe', async () => {
    answers('Glow Complex')
    const r = await aiShortName(PRODUCT)
    expect(r.source).toBe('derived')
    expect(r.reason).toBe('ungrounded')
    expect(r.invented).toEqual(expect.arrayContaining(['glow']))
    expect(r.shortName).toBe('Marine Collagen Peptides')
  })

  it('rejects a health claim, however short', async () => {
    answers('Joint Cure')
    const r = await aiShortName(PRODUCT)
    expect(r.reason).toBe('claim-flagged')
    expect(r.flags?.length).toBeGreaterThan(0)
    expect(r.source).toBe('derived')
  })

  it('rejects an answer over the poster budget', async () => {
    answers('Marine Collagen Peptides Skin And Joints')
    await expect(aiShortName(PRODUCT)).resolves.toMatchObject({ reason: 'too-long', source: 'derived' })
  })

  it('rejects an empty answer', async () => {
    answers('   ')
    await expect(aiShortName(PRODUCT)).resolves.toMatchObject({ reason: 'empty-answer', source: 'derived' })
  })

  it('survives the call failing', async () => {
    create.mockRejectedValue(new Error('timeout'))
    await expect(aiShortName(PRODUCT)).resolves.toMatchObject({ reason: 'api-error', source: 'derived' })
  })

  it('does not call the model at all without a key', async () => {
    delete process.env.OPENAI_API_KEY
    const r = await aiShortName(PRODUCT)
    expect(r).toMatchObject({ reason: 'no-api-key', source: 'derived', shortName: 'Marine Collagen Peptides' })
    expect(create).not.toHaveBeenCalled()
  })

  it('joining words are not treated as inventions', async () => {
    // "and" is not in the title; rejecting for it would be pedantry, not safety.
    answers('Collagen and Peptides')
    await expect(aiShortName(PRODUCT)).resolves.toMatchObject({ source: 'ai' })
  })

  it('every failure path still returns a usable name', async () => {
    for (const text of ['Glow Complex', 'Joint Cure', '', 'A name that is very much too long for the card']) {
      answers(text)
      const r = await aiShortName(PRODUCT)
      expect(r.shortName.length).toBeGreaterThan(0)
      expect(r.shortName.length).toBeLessThanOrEqual(SHORT_NAME_MAX)
    }
  })
})
