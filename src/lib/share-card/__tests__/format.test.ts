import { buildShareCardView, FORMATS, isShareFormat, splitPrize, type ShareFormat } from '../format'
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

  it('says nothing about what the stack is for, even from a stored card', () => {
    // The second column used to list the AI's focus areas, or the customer's
    // goals, as what the stack is "built for": a goal printed beside a stack is
    // a health claim. A card stored with focus areas must not bring it back.
    const stored = {
      ...PERSONAS.complete,
      focusAreas: [{ label: 'Faster Recovery', glyph: 'refresh' }],
      coverage: [{ label: 'Sleep', score: 80, targeted: true }],
    }
    for (const format of FORMAT_IDS) {
      const view = buildShareCardView(stored, format)
      expect(view).not.toHaveProperty('builtFor')
      const text = JSON.stringify({ ...view, spec: undefined })
      expect(text).not.toMatch(/Faster Recovery|Sleep/)
    }
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
    // address and the handle are not printed on it, nobody who sees the repost
    // can reach the quiz and the share is worth nothing. This is the single
    // most load-bearing assertion on the entry card.
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.entry?.domain).toBe('getchrgd.co.uk')
    expect(view.entry?.handle).toBe('@getchrgd_')
  })

  it('carries what the CAP Code needs on the promotion itself', () => {
    // Significant conditions have to be on the advert, not only behind a link —
    // and a reshared image cannot carry a link either.
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.entry?.small).toBe('Closes 30 Nov · No purchase needed · T&Cs apply')
    expect(view.entry?.steps).toHaveLength(3)
  })

  it('prints the three steps as written, whatever the hub holds', () => {
    const view = buildShareCardView(PERSONAS.complete, 'entry', { ...BAND, steps: ['a', 'b', 'c', 'd'] })
    expect(view.entry?.steps).toEqual([
      'Take the free 90-sec quiz',
      'Pop your email in at the end',
      'Share for 10 bonus entries',
    ])
  })

  it('sets the prize as a hero and a remainder, so the amount can be cyan', () => {
    const view = buildShareCardView(PERSONAS.complete, 'entry', { ...BAND, prize: 'Win £200 of supplements' })
    expect(view.entry).toMatchObject({ prizeHero: 'Win £200', prizeRest: 'of supplements' })
  })

  it('keeps the personalisation — it is the hook', () => {
    const view = buildShareCardView(PERSONAS['long-everything'], 'entry', BAND)
    expect(view.entry).toMatchObject({
      hook: 'Alexandria built their stack.',
      invite: 'Build yours and you’re entered.',
      owner: 'ALEXANDRIA’S STACK',
      title: PERSONAS['long-everything'].stackName,
    })
  })

  it('speaks in the first person when no name was opted in', () => {
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.entry?.hook).toBe('I built my stack.')
    expect(view.entry?.owner).toBe('MY STACK')
  })

  it('titles the panel with the stack’s name, never an archetype', () => {
    // Cards stored while the AI identity existed still hold its archetype.
    const stored = { ...PERSONAS['no-identity'], archetype: 'The Strength Builder' }
    const view = buildShareCardView(stored, 'entry', BAND)
    expect(view.entry?.title).toBe(stored.stackName)
  })

  it('lists at most five products, by name only', () => {
    // No doses and no charge index: this card is an advert, not a protocol.
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(PERSONAS.complete.lineup.length).toBeGreaterThan(5)
    expect(view.entry?.products.map((p) => p.name)).toEqual(PERSONAS.complete.lineup.slice(0, 5).map((r) => r.product))
    expect(view.entry?.products.every((p) => !/\d\s*(MG|G)\b/.test(p.category))).toBe(true)
  })

  it('names each product’s type beside it, not the benefit its slot is for', () => {
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.entry?.products.map((p) => p.category))
      .toEqual(PERSONAS.complete.lineup.slice(0, 5).map((r) => r.slot.toUpperCase()))
    expect(view.entry?.products.map((p) => p.category)).toContain('WHEY PROTEIN')
  })

  it('prints no category on a card stored before rows carried a product type', () => {
    // Stored payloads are never rewritten, and the old ones hold slot titles.
    // A benefit label beside a product is a claim, so it is dropped; a stored
    // title that is also a type still prints.
    const legacy = {
      ...PERSONAS.complete,
      lineup: [
        { slot: 'Immune Support', product: 'Vitamin C 1000', reason: '' },
        { slot: 'Energy / Pre-Workout', product: 'Pre Fuel', reason: '' },
        { slot: 'Sleep', product: 'Night Blend', reason: '' },
        { slot: 'Omega-3', product: 'Omega-3 Fish Oil', reason: '' },
        { slot: 'Amino Acids', product: 'EAA Matrix', reason: '' },
      ],
    }
    const view = buildShareCardView(legacy, 'entry', BAND)
    expect(view.entry?.products.map((p) => p.category)).toEqual(['', '', '', 'OMEGA-3', 'AMINO ACIDS'])
    expect(view.entry?.products.map((p) => p.name)).toEqual(legacy.lineup.map((r) => r.product))
  })

  it('says so on the card while the draw is a rehearsal', () => {
    expect(buildShareCardView(PERSONAS.complete, 'entry', BAND).entry?.label).toBe('LAUNCH GIVEAWAY')
    expect(buildShareCardView(PERSONAS.complete, 'entry', { ...BAND, test: true }).entry?.label)
      .toBe('TEST — NOT A LIVE PROMOTION')
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
  it('are the product count, and nothing invented or goal-shaped', () => {
    // "Routine fit" was a number the AI made up without seeing the products,
    // and "Built mainly for" put a goal beside the stack. A stored card that
    // still holds a fit score must not print it.
    const stored = { ...PERSONAS.complete, fitScore: 88 }
    const view = buildShareCardView(stored, 'story')
    expect(view.stats).toEqual([{ label: 'Products', value: String(stored.lineup.length) }])
    expect(Number(view.stats[0].value)).toBeGreaterThanOrEqual(view.lineup.length)
  })

  it('are dropped where the format has no room', () => {
    expect(buildShareCardView(PERSONAS.complete, 'og').stats).toEqual([])
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
    expect(view.stackName).toBe(PERSONAS['long-everything'].stackName)
  })
})

describe('the rest of the view', () => {
  it('prints none of a stored card’s AI identity', () => {
    // Cards shared while the AI identity existed carry its archetype, focus
    // areas and fit score. They still render, and none of the three is drawn.
    const stored = {
      ...PERSONAS.complete,
      archetype: 'The Strength Builder',
      focusAreas: [{ label: 'Faster Recovery', glyph: 'refresh' }],
      fitScore: 88,
    }
    for (const format of FORMAT_IDS) {
      const view = buildShareCardView(stored, format, format === 'entry' ? BAND : null)
      expect(view).not.toHaveProperty('archetype')
      expect(view).not.toHaveProperty('fit')
      const text = JSON.stringify({ ...view, spec: undefined })
      expect(text).not.toMatch(/Strength Builder|STRENGTH BUILDER|Faster Recovery|Routine fit|"88"/)
      expect(view.lineup.length).toBeGreaterThan(0)
    }
    expect(buildShareCardView(stored, 'story').kicker).toBe('YOUR STACK')
  })

  it('prints no reason, even from a stored card that holds one', () => {
    const stored = {
      ...PERSONAS.complete,
      lineup: PERSONAS.complete.lineup.map((row) => ({ ...row, reason: 'Supports restful sleep' })),
    }
    for (const format of FORMAT_IDS) {
      const view = buildShareCardView(stored, format, format === 'entry' ? BAND : null)
      const printed = JSON.stringify({ ...view, spec: undefined })
      expect(printed).not.toContain('restful sleep')
    }
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

  it('tells people the email is the entry and the share is the bonus', () => {
    // The email at the end of the quiz is what enters somebody; a share on top
    // is ten more tickets. The card is the only instruction a reshared story
    // carries, so it has to say both.
    const view = buildShareCardView(PERSONAS.complete, 'entry', BAND)
    expect(view.entry?.steps.some((s) => /email/i.test(s))).toBe(true)
    expect(view.entry?.steps.some((s) => /10 bonus/i.test(s))).toBe(true)
  })
})

describe('splitting the prize', () => {
  it('is always "Win" and the amount, over the rest of the prize', () => {
    expect(splitPrize('Win £200 of supplements')).toEqual({ hero: 'Win £200', rest: 'of supplements' })
    expect(splitPrize('£200 of free supplements')).toEqual({ hero: 'Win £200', rest: 'of free supplements' })
  })

  it('keeps the template\u2019s two lines when the prize is typed as just an amount', () => {
    // The live campaign reads "Up to £200": the hero is the template's, and the
    // second line falls back rather than disappearing.
    expect(splitPrize('Up to £200')).toEqual({ hero: 'Win £200', rest: 'of supplements' })
    expect(splitPrize('Win £1,000')).toEqual({ hero: 'Win £1,000', rest: 'of supplements' })
  })

  it('prints a prize with no amount whole', () => {
    expect(splitPrize('A free stack')).toEqual({ hero: 'A free stack', rest: '' })
  })
})
