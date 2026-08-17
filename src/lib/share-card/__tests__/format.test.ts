import { buildShareCardView, FORMATS, isShareFormat, type ShareFormat } from '../format'
import { sharePersonas } from '../personas'

/**
 * The layout decisions, pinned.
 *
 * Everything conditional about the card is resolved in `format.ts` rather than
 * in the renderer, and this is why: Satori fails by producing a wrong-looking
 * PNG, not by throwing, so a branch left in JSX is a branch nothing can assert.
 * What is checked here is what each format shows; what it *looks* like is
 * `/styleguide/share`, and no test replaces it.
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

  it('give the picture a share of every card', () => {
    // The single biggest thing separating the card from a screenshot of the app.
    for (const format of FORMAT_IDS) {
      expect(FORMATS[format].imageRatio).toBeGreaterThan(0.3)
    }
  })
})

describe('the lists', () => {
  it('never run deeper than the format declares', () => {
    for (const payload of Object.values(PERSONAS)) {
      for (const format of FORMAT_IDS) {
        const view = buildShareCardView(payload, format)
        expect(view.lineup.length).toBeLessThanOrEqual(FORMATS[format].lineupRows)
        expect(view.builtFor.length).toBeLessThanOrEqual(FORMATS[format].lineupRows)
        expect(view.lineup.length).toBeGreaterThan(0)
      }
    }
  })

  it('counts what it could not show', () => {
    const view = buildShareCardView(PERSONAS.complete, 'story')
    expect(view.overflow).toBe(PERSONAS.complete.lineup.length - view.lineup.length)
    expect(view.overflow).toBeGreaterThan(0)
  })

  it('reports no overflow on a format that does not draw the line', () => {
    // Square hides it, so counting it would leave the renderer holding a number
    // it has to remember not to draw.
    expect(FORMATS.square.showOverflow).toBe(false)
    expect(buildShareCardView(PERSONAS.complete, 'square').overflow).toBe(0)
  })

  it('answers "why" with the focus areas when there is an identity', () => {
    const view = buildShareCardView(PERSONAS.complete, 'story')
    expect(view.builtFor).toEqual(['Performance Output', 'Faster Recovery', 'Daily Energy'])
  })

  it('falls back to the customer’s own goals when there is no identity', () => {
    // Same question, answered from the other end. A card with an empty second
    // column is a card with a hole in it.
    const view = buildShareCardView(PERSONAS['no-identity'], 'story')
    expect(view.builtFor.length).toBeGreaterThan(0)
    expect(view.builtFor.every((l) => typeof l === 'string' && l.length > 0)).toBe(true)
  })
})

describe('the stat pairs', () => {
  it('pair a number with a word', () => {
    // Two words side by side reads as a caption; two numbers reads as a table.
    const [number, word] = buildShareCardView(PERSONAS.complete, 'story').stats
    expect(number).toEqual({ label: 'Routine fit', value: String(PERSONAS.complete.fitScore) })
    expect(word.value).toMatch(/^[A-Z]/)
    expect(Number.isNaN(Number(word.value))).toBe(true)
  })

  it('are dropped where the format has no room', () => {
    expect(buildShareCardView(PERSONAS.complete, 'og').stats).toEqual([])
  })

  it('falls back to the product count when there is no fit score', () => {
    // No AI identity means no routine fit, and a stat row with one pair in it
    // reads as a card that lost something.
    const view = buildShareCardView(PERSONAS['no-identity'], 'story')
    expect(view.stats).toHaveLength(2)
    expect(view.stats[0]).toEqual({
      label: 'Products',
      value: String(PERSONAS['no-identity'].lineup.length),
    })
    expect(Number(view.stats[0].value)).toBeGreaterThanOrEqual(view.lineup.length)
  })
})

describe('the eyebrow', () => {
  it('carries the tier where the format shows it', () => {
    expect(buildShareCardView(PERSONAS.complete, 'story').eyebrow).toBe('CHRGD STACK · Complete')
    expect(buildShareCardView(PERSONAS.complete, 'og').eyebrow).toBe('CHRGD STACK')
  })

  it('reframes for drinks mode', () => {
    expect(buildShareCardView(PERSONAS.drinks, 'story').eyebrow).toContain('CHRGD LQD')
  })

  it('is where an opted-in first name goes, not the headline', () => {
    // The headline is the stack's name. A card that says "SAM'S IRON FOUNDATIONS"
    // has two subjects and no hook.
    const view = buildShareCardView(PERSONAS['long-everything'], 'story')
    expect(view.eyebrow).toMatch(/^ALEXANDRIA’S CHRGD STACK/)
    expect(view.stackName).toBe('Uncompromising Foundations')
  })
})

describe('the rest of the view', () => {
  it('drops the identity furniture rather than drawing empty holders', () => {
    const view = buildShareCardView(PERSONAS['no-identity'], 'story')
    expect(view.archetype).toBeNull()
    expect(view.fit).toBeNull()
    expect(view.lineup.length).toBeGreaterThan(0)
  })

  it('keeps the code off the link preview, where the URL already carries it', () => {
    expect(buildShareCardView(PERSONAS.complete, 'story').code).toBe('SARAH20')
    expect(buildShareCardView(PERSONAS.complete, 'og').code).toBeNull()
  })

  it('passes a real product picture through when the catalogue has one', () => {
    // Every mock product carries `imageUrl: null` today, so this is the path
    // that has to keep working for the day they do not.
    expect(buildShareCardView(PERSONAS.complete, 'story').heroImage).toBeNull()
    const withArt = { ...PERSONAS.complete, heroImage: 'https://cdn.example/whey.png' }
    expect(buildShareCardView(withArt, 'story').heroImage).toBe('https://cdn.example/whey.png')
  })
})
