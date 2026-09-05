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

const BAND = {
  prize: '£200 of free supplements',
  mechanic: 'Follow, repost and share to your story',
  closes: 'Closes 30 Nov',
  terms: 'Full T&Cs at getchrgd.co.uk',
  test: false,
  handle: '@getchrgd_',
  route: 'Take the quiz — link in our bio',
  steps: ['Follow @getchrgd_', 'Take the quiz', 'Share it to your story tagging us'],
}

describe('formats', () => {
  it('are all real', () => {
    expect(FORMAT_IDS.sort()).toEqual(['entry', 'og', 'square', 'story'])
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
    // A quarter on the entry card, where the advert needs the room more; a
    // third or better everywhere the stack is the subject.
    for (const format of FORMAT_IDS) {
      expect(FORMATS[format].imageRatio).toBeGreaterThanOrEqual(format === 'entry' ? 0.25 : 0.3)
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

describe('the entry card', () => {
  it('is a different card, not a badge on the story one', () => {
    // The whole reason it is its own format: picking the competition loads a
    // different picture, and the advert is what the card *is*.
    const entry = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    const story = buildShareCardView(PERSONAS.complete, 'story', BAND)

    expect(entry.entry).not.toBeNull()
    expect(entry.callout).toBeNull()
    expect(story.entry).toBeNull()
    expect(story.callout).toMatchObject({ kind: 'competition' })
  })

  it('prints the way back to the quiz', () => {
    // A story somebody reshares is a flat image — no link, no swipe-up. If the
    // handle and the route are not printed on it, nobody who sees the repost
    // can reach the quiz and the share is worth nothing. This is the single
    // most load-bearing assertion on the entry card.
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.entry?.handle).toBe('@getchrgd_')
    expect(view.entry?.route).toBe('Take the quiz — link in our bio')
  })

  it('carries what the CAP Code needs on the promotion itself', () => {
    // Significant conditions have to be on the advert, not only behind a link —
    // and a reshared image cannot carry a link either.
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.entry).toMatchObject({
      prize: '£200 of free supplements',
      closes: 'Closes 30 Nov',
      terms: 'Full T&Cs at getchrgd.co.uk',
    })
    expect(view.entry?.steps).toHaveLength(3)
  })

  it('keeps the personalisation — it is the hook', () => {
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.stackName).toBe('Iron Foundations')
    expect(view.archetype).toBe('The Strength Builder')
    // The same five as the story card. A two-product version of somebody's
    // stack undersells both the stack and the quiz that built it; the room for
    // the prize block and the entry steps comes out of the type scale instead.
    expect(view.lineup).toHaveLength(5)
  })

  it('caps the steps at three', () => {
    const many = { ...BAND, steps: ['a', 'b', 'c', 'd', 'e'] }
    expect(buildShareCardView(PERSONAS.complete, 'entry', many).entry?.steps).toHaveLength(3)
  })

  it('has no advert when no competition is running', () => {
    // The band is read live and returns null once the closing date passes, so
    // this is the state an entry card falls into rather than a separate one.
    expect(buildShareCardView(PERSONAS.complete, 'entry', null).entry).toBeNull()
  })
})

/**
 * What the card says it is.
 *
 * The card explained itself only to somebody who already knew us: the biggest
 * words on it are a stack name that means nothing to a stranger, and everything
 * under them is a list of supplements with no stated origin. These two lines are
 * the whole of the fix, so they are pinned rather than left as copy.
 */
describe('saying what this is', () => {
  it('names the quiz under the headline', () => {
    const view = buildShareCardView(PERSONAS.complete, 'story')
    expect(view.standfirst).toContain('CHRGD QUIZ')
    expect(view.standfirst).toContain('SUPPLEMENT STACK')
  })

  it('is on every format — a stranger sees whichever one got shared', () => {
    for (const format of ['story', 'square', 'og', 'entry'] as const) {
      expect(buildShareCardView(PERSONAS.complete, format).standfirst).toBeTruthy()
    }
  })

  it('tells a reader what to do, and where', () => {
    /*
      The card's whole job on a stranger's story is to send them to the quiz,
      and the address used to be the quietest thing on it — 21px mono at 42%
      opacity, fainter than the serving counts. Somebody who liked the card had
      nowhere to go.

      Two lines because they answer different questions, and the domain is the
      one they have to remember.
    */
    const view = buildShareCardView(PERSONAS.complete, 'story')
    expect(view.cta.domain).toBe('getchrgd.co.uk')
    expect(view.cta.label).toMatch(/90 SECONDS/)
    expect(view.cta.label).toMatch(/FREE/i)
  })

  it('does not then repeat the instruction in the rail underneath it', () => {
    // It said "TAKE THE QUIZ · 90 SECONDS" directly below a band already
    // saying the same thing in two sizes.
    expect(buildShareCardView(PERSONAS.complete, 'story').footNote).toBe('')
  })

  it('gives the closing date the footer instead while a draw is running', () => {
    // A significant condition has to be on the promotion itself, and it outranks
    // the call to action — the entry steps are carrying that job on this card.
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.footNote).toContain('CLOSES 30 NOV')
    expect(view.footNote).toContain('T&CS APPLY')
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

  it('gives an influencer’s code the band, not a footer chip', () => {
    // Their whole reason to post is the code. In the footer it was a caption.
    const view = buildShareCardView(PERSONAS.complete, 'story')
    expect(view.callout).toEqual({
      kind: 'code',
      code: 'SARAH20',
      caption: 'Use this code at checkout',
    })
  })

  it('has no band on an ordinary share, or on a link preview', () => {
    expect(buildShareCardView(PERSONAS.essentials, 'story').callout).toBeNull()
    expect(buildShareCardView(PERSONAS.complete, 'og').callout).toBeNull()
  })

  it('picks the picture from what the stack is for', () => {
    // Not shuffled: two people with the same goals get the same card, and a
    // strength stack never gets the wellbeing image.
    expect(buildShareCardView(PERSONAS.complete, 'story').artKey).toBe('strength')
    expect(buildShareCardView(PERSONAS.wellbeing, 'story').artKey).toBe('recovery')
  })

  it('says out loud that the art is still a placeholder', () => {
    // So nobody signs the card off believing the house renders are the art.
    expect(buildShareCardView(PERSONAS.complete, 'story').artIsPlaceholder).toBe(true)
  })

  it('passes a real product picture through when the catalogue has one', () => {
    // Every mock product carries `imageUrl: null` today, so this is the path
    // that has to keep working for the day they do not.
    expect(buildShareCardView(PERSONAS.complete, 'story').heroImage).toBeNull()
    const withArt = { ...PERSONAS.complete, heroImage: 'https://cdn.example/whey.png' }
    expect(buildShareCardView(withArt, 'story').heroImage).toBe('https://cdn.example/whey.png')
  })
})

/**
 * The handle, and the fact that it has an underscore on the end.
 *
 * `@getchrgd_` is not `@getchrgd`, and on a reshared story the handle is the
 * only route back to us — a wrong one sends every entrant to somebody else's
 * account, or to nothing. It is founder-editable, so what is pinned here is the
 * fallback and the fact that the entry rules survive a handle with an underscore
 * in it.
 */
describe('the way back', () => {
  it('carries the handle exactly as configured, underscore and all', () => {
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.entry?.handle).toBe('@getchrgd_')
  })

  it('tells people to tag us, as its own step', () => {
    // Bundled into "post this to your story and tag us" it read as one action
    // and got done as one. Tagging is how an entry is found at all.
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.entry?.steps.some((s) => /tag/i.test(s))).toBe(true)
  })
})
