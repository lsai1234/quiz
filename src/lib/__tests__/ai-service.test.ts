import {
  generateIdeas,
  pressureTestIdea,
  buildCarousel,
  optimiseInteraction,
  prepareExportRow,
} from '../ai-service'
import {
  MOCK_IDEAS,
  MOCK_SLIDES,
  MOCK_OPTIMISATION,
  MOCK_VISUAL_DIRECTION,
  MOCK_CLAIM_SAFETY,
  DEFAULT_SETTINGS,
} from '../mock-data'

// All tests run without an API key → mock mode is active throughout.
// Fake timers prevent the built-in delays from slowing tests down.

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const idea = MOCK_IDEAS[0]

// ─── generateIdeas ────────────────────────────────────────────────────────────

describe('generateIdeas (mock mode)', () => {
  it('returns an array of ContentIdea objects', async () => {
    const promise = generateIdeas('protein myths', null, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const ideas = await promise
    expect(Array.isArray(ideas)).toBe(true)
    expect(ideas.length).toBeGreaterThan(0)
  })

  it('every returned idea has required fields', async () => {
    const promise = generateIdeas('protein', 'Gym myth', DEFAULT_SETTINGS)
    jest.runAllTimers()
    const ideas = await promise
    for (const idea of ideas) {
      expect(typeof idea.id).toBe('string')
      expect(typeof idea.title).toBe('string')
      expect(typeof idea.hook).toBe('string')
      expect(idea.post_type).toBe('carousel')
    }
  })

  it('assigns unique IDs to each idea', async () => {
    const promise = generateIdeas('test', null, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const ideas = await promise
    const ids = ideas.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ─── pressureTestIdea ─────────────────────────────────────────────────────────

describe('pressureTestIdea (mock mode)', () => {
  it('returns a ScoreBreakdown with an overall score', async () => {
    const promise = pressureTestIdea(idea, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const result = await promise
    expect(typeof result.overall).toBe('number')
    expect(result.overall).toBeGreaterThan(0)
    expect(result.overall).toBeLessThanOrEqual(100)
  })

  it('includes all score dimension fields', async () => {
    const promise = pressureTestIdea(idea, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const result = await promise
    expect(typeof result.hook_strength).toBe('number')
    expect(typeof result.curiosity_gap).toBe('number')
    expect(typeof result.comment_potential).toBe('number')
    expect(typeof result.save_potential).toBe('number')
  })

  it('includes strengths and weaknesses arrays', async () => {
    const promise = pressureTestIdea(idea, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const result = await promise
    expect(Array.isArray(result.strengths)).toBe(true)
    expect(Array.isArray(result.weaknesses)).toBe(true)
    expect(result.strengths.length).toBeGreaterThan(0)
  })
})

// ─── buildCarousel ────────────────────────────────────────────────────────────

describe('buildCarousel (mock mode)', () => {
  it('returns exactly 5 carousel slides', async () => {
    const promise = buildCarousel(idea, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const slides = await promise
    expect(slides).toHaveLength(5)
  })

  it('slides are numbered 1–5', async () => {
    const promise = buildCarousel(idea, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const slides = await promise
    slides.forEach((slide, i) => {
      expect(slide.slide_number).toBe(i + 1)
    })
  })

  it('every slide has role, text, visual_note, text_position', async () => {
    const promise = buildCarousel(idea, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const slides = await promise
    for (const slide of slides) {
      expect(typeof slide.role).toBe('string')
      expect(typeof slide.text).toBe('string')
      expect(typeof slide.visual_note).toBe('string')
      expect(['top', 'middle', 'bottom']).toContain(slide.text_position)
    }
  })
})

// ─── optimiseInteraction ──────────────────────────────────────────────────────

describe('optimiseInteraction (mock mode)', () => {
  it('returns the requested interaction goal', async () => {
    const promise = optimiseInteraction(MOCK_SLIDES, 'comments', idea, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const result = await promise
    expect(result.goal).toBe('comments')
  })

  it('includes caption_angle and hashtags_hint', async () => {
    const promise = optimiseInteraction(MOCK_SLIDES, 'saves', idea, DEFAULT_SETTINGS)
    jest.runAllTimers()
    const result = await promise
    expect(typeof result.caption_angle).toBe('string')
    expect(typeof result.hashtags_hint).toBe('string')
  })
})

// ─── prepareExportRow ─────────────────────────────────────────────────────────

describe('prepareExportRow (mock mode)', () => {
  async function buildRow(overrides: Parameters<typeof prepareExportRow>) {
    const promise = prepareExportRow(...overrides)
    jest.runAllTimers()
    return promise
  }

  it('status is always "priority_queued"', async () => {
    const row = await buildRow([idea, MOCK_SLIDES, MOCK_OPTIMISATION, MOCK_VISUAL_DIRECTION, MOCK_CLAIM_SAFETY, 'G-001', 'myth-buster'])
    expect(row.status).toBe('priority_queued')
  })

  it('idea_id matches the provided nextId', async () => {
    const row = await buildRow([idea, MOCK_SLIDES, MOCK_OPTIMISATION, MOCK_VISUAL_DIRECTION, MOCK_CLAIM_SAFETY, 'G-099', 'myth-buster'])
    expect(row.idea_id).toBe('G-099')
  })

  it('title comes from the idea', async () => {
    const row = await buildRow([idea, MOCK_SLIDES, MOCK_OPTIMISATION, MOCK_VISUAL_DIRECTION, MOCK_CLAIM_SAFETY, 'G-001', 'myth-buster'])
    expect(row.title).toBe(idea.title)
  })

  it('experience_type matches the provided value', async () => {
    const row = await buildRow([idea, MOCK_SLIDES, MOCK_OPTIMISATION, MOCK_VISUAL_DIRECTION, MOCK_CLAIM_SAFETY, 'G-001', 'the-reveal'])
    expect(row.experience_type).toBe('the-reveal')
  })

  it('falls back to "myth-buster" when experienceType is null', async () => {
    const row = await buildRow([idea, MOCK_SLIDES, MOCK_OPTIMISATION, MOCK_VISUAL_DIRECTION, MOCK_CLAIM_SAFETY, 'G-001', null])
    expect(row.experience_type).toBe('myth-buster')
  })

  it('pulls slide text from the provided slides array', async () => {
    const customSlides = MOCK_SLIDES.map((s, i) => ({ ...s, text: `Custom slide ${i + 1}` }))
    const row = await buildRow([idea, customSlides, MOCK_OPTIMISATION, MOCK_VISUAL_DIRECTION, MOCK_CLAIM_SAFETY, 'G-001', 'myth-buster'])
    expect(row.slide_1_hook).toBe('Custom slide 1')
    expect(row.slide_5_cta).toBe('Custom slide 5')
  })

  it('builds caption from optimisation caption_angle and hashtags', async () => {
    const row = await buildRow([idea, MOCK_SLIDES, MOCK_OPTIMISATION, MOCK_VISUAL_DIRECTION, MOCK_CLAIM_SAFETY, 'G-001', 'myth-buster'])
    expect(row.caption).toContain(MOCK_OPTIMISATION.caption_angle)
    expect(row.caption).toContain(MOCK_OPTIMISATION.hashtags_hint)
  })

  it('falls back to idea.hook for caption when optimisation is null', async () => {
    const row = await buildRow([idea, MOCK_SLIDES, null, MOCK_VISUAL_DIRECTION, MOCK_CLAIM_SAFETY, 'G-001', 'myth-buster'])
    expect(row.caption).toContain(idea.hook)
  })

  it('has a generated_at ISO timestamp', async () => {
    const before = Date.now()
    const row = await buildRow([idea, MOCK_SLIDES, MOCK_OPTIMISATION, MOCK_VISUAL_DIRECTION, MOCK_CLAIM_SAFETY, 'G-001', 'myth-buster'])
    const after = Date.now()
    const ts = new Date(row.generated_at).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})
