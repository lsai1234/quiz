import { cleanDescription, looksLikeHtml } from '../description'

// The two products from the shop that showed raw markup to customers, verbatim
// from PowerBody's `description_en`.
const OSAVI_SHAKER =
  '<div class="RichText3-paragraph--withVSpacingSmall RichText3-paragraph Typography Typography--m">OSAVI shaker in blue, 700 ml capacity.</div> ' +
  '<div class="RichText3-paragraph--withVSpacingSmall RichText3-paragraph Typography Typography--m">Ideal for preparing drinks with Osavi powder products - collagen or inulin.</div> ' +
  '<div class="RichText3-paragraph--withVSpacingSmall RichText3-paragraph Typography Typography--m">Food safe, BPA free.</div>'

const SKILL_SHAKER =
  '<strong>Welcome to the world of intense workouts and an active lifestyle!</strong> The Skill Nutrition Water Bottle 700 ml, is an indispensable companion.<br /><br />' +
  '<strong>Technical Specifications:</strong><br /> <ul> <li>Capacity: 700 ml, the ideal size.</li> <li>Stainless steel Ball: ensures a uniform mixture.</li> <li>Size: &phi;9.7*H21.8 cm, Weight: 132 g</li> </ul>'

describe('cleanDescription', () => {
  it('strips the RichText3 div soup and keeps every sentence', () => {
    expect(cleanDescription(OSAVI_SHAKER)).toBe(
      'OSAVI shaker in blue, 700 ml capacity.\n' +
        'Ideal for preparing drinks with Osavi powder products - collagen or inulin.\n' +
        'Food safe, BPA free.',
    )
  })

  it('never welds two sentences together across a block boundary', () => {
    // The naive `replace(/<[^>]*>/g, '')` bug: "capacity.Ideal for preparing".
    expect(cleanDescription(OSAVI_SHAKER)).not.toMatch(/[a-z]\.[A-Z]/)
  })

  it('turns list items into bullets and keeps inline emphasis as words', () => {
    const out = cleanDescription(SKILL_SHAKER)
    expect(out).toContain('Welcome to the world of intense workouts and an active lifestyle!')
    expect(out).toContain('• Capacity: 700 ml, the ideal size.')
    expect(out).toContain('• Stainless steel Ball: ensures a uniform mixture.')
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
  })

  it('decodes the entities their dimension lines use', () => {
    expect(cleanDescription('Size: &phi;9.7*H21.8 cm')).toBe('Size: φ9.7*H21.8 cm')
    expect(cleanDescription('Protein &amp; creatine')).toBe('Protein & creatine')
    expect(cleanDescription('20&nbsp;g protein')).toBe('20 g protein')
    expect(cleanDescription('&#8211; 30 servings')).toBe('– 30 servings')
    expect(cleanDescription('&#x2013; 30 servings')).toBe('– 30 servings')
  })

  it('decodes each entity exactly once — no double-decoding', () => {
    // `&amp;lt;` is a literal "&lt;", not a "<".
    expect(cleanDescription('a &amp;lt; b')).toBe('a &lt; b')
  })

  it('leaves an unknown entity visible rather than deleting it', () => {
    expect(cleanDescription('50 &zzz; units')).toBe('50 &zzz; units')
  })

  it('drops script and style content entirely', () => {
    expect(cleanDescription('Good<script>alert(1)</script>copy')).toBe('Good copy')
    expect(cleanDescription('Good<style>.a{color:red}</style>copy')).toBe('Good copy')
  })

  it('is idempotent — running it on clean text changes nothing', () => {
    const once = cleanDescription(SKILL_SHAKER)
    expect(cleanDescription(once)).toBe(once)
  })

  it('leaves already-clean supplier copy alone', () => {
    const clean = 'Whey protein blend with 24g protein per serving, fast-absorbing.'
    expect(cleanDescription(clean)).toBe(clean)
  })

  it('handles empty, null and undefined without a guard at the call site', () => {
    expect(cleanDescription('')).toBe('')
    expect(cleanDescription(null)).toBe('')
    expect(cleanDescription(undefined)).toBe('')
    expect(cleanDescription('<div></div>')).toBe('')
  })

  it('drops empty list items instead of leaving orphan bullets', () => {
    expect(cleanDescription('<ul><li>Real point</li><li></li></ul>')).toBe('• Real point')
  })
})

describe('looksLikeHtml', () => {
  it('flags descriptions that still need backfilling', () => {
    expect(looksLikeHtml(OSAVI_SHAKER)).toBe(true)
    expect(looksLikeHtml(SKILL_SHAKER)).toBe(true)
    expect(looksLikeHtml('Size: &phi;9.7 cm')).toBe(true)
  })

  it('does not flag clean copy', () => {
    expect(looksLikeHtml('Whey protein blend, 24g per serving.')).toBe(false)
    expect(looksLikeHtml('Under 1g sugar & 27g protein')).toBe(false)
    expect(looksLikeHtml('')).toBe(false)
    expect(looksLikeHtml(null)).toBe(false)
  })
})
