import { buildShareCardView, FORMATS, isShareFormat, __budget, type ShareFormat } from '../format'
import { sharePersonas } from '../personas'
import type { ShareCardPayload } from '../types'

/**
 * The layout decisions, pinned.
 *
 * Everything conditional about the card is resolved here rather than in the
 * renderer, and this is why: Satori fails by producing a wrong-looking PNG, not
 * by throwing, so a branch left in JSX is a branch nothing can assert. The row
 * counts below were arrived at by rendering the six personas and looking at
 * them, and they are pinned so that a change to a block height or a token has to
 * come back through here rather than silently pushing a row off a card.
 */

const FORMAT_IDS = Object.keys(FORMATS) as ShareFormat[]
const PERSONAS = Object.fromEntries(sharePersonas().map((p) => [p.id, p.payload]))

describe('formats', () => {
  it('are all real', () => {
    expect(FORMAT_IDS.sort()).toEqual(['og', 'square', 'story'])
    expect(isShareFormat('story')).toBe(true)
    expect(isShareFormat('reel')).toBe(false)
  })

  it('carry the dimensions each platform actually wants', () => {
    expect(FORMATS.story).toMatchObject({ width: 1080, height: 1920 })
    expect(FORMATS.square).toMatchObject({ width: 1080, height: 1080 })
    expect(FORMATS.og).toMatchObject({ width: 1200, height: 630 })
  })
})

describe('the row budget', () => {
  /**
   * The counts every persona resolves to. Rendered and eyeballed at
   * `/styleguide/share`; a diff here means a card's composition moved and wants
   * looking at, not that the number should be updated to match.
   */
  const EXPECTED: Record<string, Record<ShareFormat, number>> = {
    complete:         { story: 4, square: 2, og: 2 },
    essentials:       { story: 2, square: 2, og: 2 },
    wellbeing:        { story: 4, square: 2, og: 2 },
    drinks:           { story: 3, square: 2, og: 2 },
    'no-identity':    { story: 4, square: 2, og: 2 },
    // One row on the square, and that is not a bug: a 26-character name takes
    // two lines of a 1080px frame, and what is left is 142px — less than a row.
    // Checked against the render rather than assumed.
    'long-everything':{ story: 3, square: 1, og: 2 },
  }

  it.each(Object.entries(EXPECTED))('%s', (id, byFormat) => {
    for (const format of FORMAT_IDS) {
      expect(buildShareCardView(PERSONAS[id], format).lineup).toHaveLength(byFormat[format])
    }
  })

  it('never draws more rows than the format declares', () => {
    for (const payload of Object.values(PERSONAS)) {
      for (const format of FORMAT_IDS) {
        const view = buildShareCardView(payload, format)
        expect(view.lineup.length).toBeLessThanOrEqual(FORMATS[format].lineupRows)
        expect(view.lineup.length).toBeGreaterThan(0)
      }
    }
  })

  it('gives a card with no identity the rows the header would have taken', () => {
    // No archetype, no ring, no focus chips — about 300px of header back. A
    // constant row count cannot spend it, which is the reason this is a budget.
    const bare = { ...PERSONAS.complete, archetype: '', fitScore: null, focusAreas: [] }
    const budget = (p: ShareCardPayload) =>
      __budget.rowBudget(p, FORMATS.story, 'story', p.focusAreas, 936)

    expect(budget(bare).headerHeight).toBeLessThan(budget(PERSONAS.complete).headerHeight)
    expect(budget(bare).available).toBeGreaterThan(budget(PERSONAS.complete).available)
  })

  it('charges a wrapping headline to the lineup', () => {
    // Asserted on the budget, not the row count: one extra headline line is
    // ~112px against a ~178px row, so it does not always cost a whole row — and
    // a test that says it must would be pinning the wrong thing.
    const budget = (name: string) => {
      const p = { ...PERSONAS.complete, stackName: name }
      return __budget.rowBudget(p, FORMATS.story, 'story', p.focusAreas, 936).available
    }
    expect(budget('Uncompromising Daily Foundations Protocol')).toBeLessThan(budget('Peak'))
  })

  it('does not charge the OG lineup for a header sitting beside it', () => {
    // The two-column layout was collapsing to one row because the budget billed
    // the right column for the left column's height.
    expect(buildShareCardView(PERSONAS.complete, 'og').lineup.length).toBe(2)
  })
})

describe('the view model', () => {
  it('counts what it could not show', () => {
    const view = buildShareCardView(PERSONAS.complete, 'story')
    expect(view.overflow).toBe(PERSONAS.complete.lineup.length - view.lineup.length)
    expect(view.overflow).toBeGreaterThan(0)
  })

  it('reports no overflow on a format that does not draw the line', () => {
    // Square hides it, so counting it would leave the renderer holding a number
    // it must remember not to draw.
    expect(FORMATS.square.showOverflow).toBe(false)
    expect(buildShareCardView(PERSONAS.complete, 'square').overflow).toBe(0)
  })

  it('reframes the eyebrow for drinks mode', () => {
    expect(buildShareCardView(PERSONAS.drinks, 'story').eyebrow).toBe('CHRGD LQD PACKAGE')
    expect(buildShareCardView(PERSONAS.complete, 'story').eyebrow).toBe('CHRGD STACK')
  })

  it('puts an opted-in first name in the eyebrow, not the headline', () => {
    // The headline is the stack's name. A card that says "SAM'S IRON FOUNDATIONS"
    // has two subjects and no hook.
    const view = buildShareCardView(PERSONAS['long-everything'], 'story')
    expect(view.eyebrow).toBe('ALEXANDRIA’S CHRGD STACK')
    expect(view.stackName).toBe('Uncompromising Foundations')
  })

  it('drops the identity furniture rather than drawing empty holders', () => {
    const view = buildShareCardView(PERSONAS['no-identity'], 'story')
    expect(view.archetype).toBeNull()
    expect(view.fit).toBeNull()
    expect(view.focusAreas).toEqual([])
    expect(view.lineup.length).toBeGreaterThan(0)
  })

  it('shows coverage and the tier only where the format has room', () => {
    expect(buildShareCardView(PERSONAS.complete, 'story').coverage).toHaveLength(4)
    expect(buildShareCardView(PERSONAS.complete, 'square').coverage).toEqual([])
    expect(buildShareCardView(PERSONAS.complete, 'og').coverage).toEqual([])

    expect(buildShareCardView(PERSONAS.complete, 'story').tier).toBe('Complete')
    expect(buildShareCardView(PERSONAS.complete, 'og').tier).toBeNull()
  })

  it('keeps the code off the link preview, where the URL already carries it', () => {
    expect(buildShareCardView(PERSONAS.complete, 'story').code).toBe('SARAH20')
    expect(buildShareCardView(PERSONAS.complete, 'og').code).toBeNull()
  })

  it('caps focus chips at three', () => {
    const many = {
      ...PERSONAS.complete,
      focusAreas: ['One', 'Two', 'Three', 'Four', 'Five'].map((l) => ({ label: l, glyph: 'sparkle' })),
    }
    expect(buildShareCardView(many, 'story').focusAreas).toHaveLength(3)
  })
})

describe('the wrap estimates', () => {
  it('knows when a name fits one line and when it does not', () => {
    expect(__budget.headlineLines('Peak Protocol', 936)).toBe(1)
    expect(__budget.headlineLines('Iron Foundations', 936)).toBe(1)
    expect(__budget.headlineLines('Uncompromising Foundations', 936)).toBe(2)
  })

  it('knows when focus chips wrap', () => {
    expect(__budget.focusChipRows(['Performance Output', 'Faster Recovery', 'Daily Energy'], 936)).toBe(1)
    expect(__budget.focusChipRows(
      ['Sustained Performance Output', 'Accelerated Recovery', 'Daily Energy Balance'], 936,
    )).toBe(2)
  })
})
