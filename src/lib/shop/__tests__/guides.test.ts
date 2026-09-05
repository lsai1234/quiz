import { GUIDES, allGuides, guideFor, guideHref } from '../guides'
import { claimFlags } from '../claim-safety'
import { categorySlug } from '../categories'

/**
 * The category guides.
 *
 * These pages tell somebody what a supplement is for, which makes them the
 * highest-risk copy in the app: advertising rules govern what a supplement may
 * be said to do, and a page that reads as an article is exactly where a careless
 * sentence ends up. Most of what is below is not testing code — it is testing
 * the words, because the words are the thing that can get this wrong.
 */

describe('the copy stays the right side of the claims line', () => {
  /*
    The whole point. `claim-safety` flags cure / treat / prevent / proven /
    guarantee / "see results" / "speeds up" / eliminates. Structure-function
    language — supports, helps, is used for — is what is left, and is what
    these guides are written in.

    Every string is checked, not a sample: the intro of the one guide nobody
    edits is as public as the rest.
  */
  it.each(GUIDES.map((g) => [g.slug, g] as const))('%s', (_slug, guide) => {
    const strings = [
      guide.title,
      guide.summary,
      guide.intro,
      ...guide.sections.flatMap((s) => [s.heading, ...s.body]),
    ]
    for (const copy of strings) {
      const flags = claimFlags(copy)
      expect(
        flags.length === 0 ? null : `"${copy}" — ${flags.map((f) => `${f.match}: ${f.why}`).join('; ')}`,
      ).toBeNull()
    }
  })
})

describe('the shelf summary fits where it is drawn', () => {
  /*
    The summary sits under a shelf heading on a phone, above the products. Past
    about 90 characters it wraps to three lines and pushes the first row of
    products off the screen, which costs more than the sentence adds.
  */
  it.each(GUIDES.map((g) => [g.slug, g.summary] as const))('%s', (_slug, summary) => {
    expect(summary.length).toBeLessThanOrEqual(90)
    expect(summary.trim()).toBe(summary)
  })
})

describe('every guide is reachable', () => {
  it('resolves by its own slug', () => {
    for (const g of GUIDES) expect(guideFor(g.slug)).toBe(g)
  })

  it('resolves by every alias it declares', () => {
    for (const g of GUIDES) {
      for (const alias of g.aliases ?? []) expect(guideFor(alias)).toBe(g)
    }
  })

  /*
    The reason aliases exist at all. Category names come from the supplier
    feed, so the same shelf arrived as "Amino Acids" and later as "Amino Acids
    and BCAAs" — and a rename that silently drops the guide off the shelf is
    the kind of failure nobody notices for a month.
  */
  it('resolves the real supplier names seen on the live shop', () => {
    const seen = ['Protein', 'Amino Acids and BCAAs', 'Amino Acids', 'Accessories', 'Pre-Workout', 'Gut Health']
    for (const name of seen) {
      expect(guideFor(categorySlug(name))).not.toBeNull()
    }
  })

  it('is case-insensitive, because a slug is not guaranteed to arrive lowercased', () => {
    expect(guideFor('PROTEIN')).toBe(guideFor('protein'))
  })

  /*
    Null is an ordinary answer, not a failure: the catalogue is supplier data
    and a shelf we have not written about can appear at any time. That shelf
    shows its products and no summary, exactly as it did before guides existed.
  */
  it('returns null for a shelf nobody has written about', () => {
    expect(guideFor('mushroom-coffee')).toBeNull()
    expect(guideFor('')).toBeNull()
    expect(guideFor(null)).toBeNull()
    expect(guideFor(undefined)).toBeNull()
  })
})

describe('the registry itself', () => {
  it('has no duplicate slug or alias, so a lookup is never ambiguous', () => {
    const keys = GUIDES.flatMap((g) => [g.slug, ...(g.aliases ?? [])])
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses slugs the category grouping would actually produce', () => {
    // A guide keyed on something `categorySlug` can never emit is a guide that
    // is only reachable by typing its URL.
    for (const g of GUIDES) expect(categorySlug(g.slug)).toBe(g.slug)
  })

  it('gives every guide a summary, an intro and something to read', () => {
    for (const g of GUIDES) {
      expect(g.summary.length).toBeGreaterThan(20)
      expect(g.intro.length).toBeGreaterThan(60)
      expect(g.sections.length).toBeGreaterThan(0)
      for (const s of g.sections) {
        expect(s.heading.length).toBeGreaterThan(0)
        expect(s.body.length).toBeGreaterThan(0)
        for (const para of s.body) expect(para.length).toBeGreaterThan(30)
      }
    }
  })

  it('points at a page under /guide', () => {
    expect(guideHref(GUIDES[0])).toBe(`/guide/${GUIDES[0].slug}`)
  })

  it('exposes every guide for the route to pre-render', () => {
    expect(allGuides()).toHaveLength(GUIDES.length)
  })
})

describe('the shelves a shopper is most likely to be unsure about are covered', () => {
  /*
    Protein needs no explaining to most people. The ones that sell badly to a
    beginner are the ones whose name does not say what they do — which is the
    whole reason this exists.
  */
  it.each(['amino-acids-and-bcaas', 'creatine', 'pre-workout', 'gut-health'])('%s', (slug) => {
    expect(guideFor(slug)).not.toBeNull()
  })
})
