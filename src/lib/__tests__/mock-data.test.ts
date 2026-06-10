import {
  EXPERIENCE_TYPES,
  MOCK_IDEAS,
  MOCK_PRESSURE_TEST,
  MOCK_SLIDES,
  MOCK_OPTIMISATION,
  MOCK_VISUAL_DIRECTION,
  MOCK_CLAIM_SAFETY,
  MOCK_EXPORT_ROW,
  DEFAULT_SETTINGS,
  PROMPT_CHIPS,
} from '../mock-data'

const VALID_EXPERIENCE_TYPES = [
  'myth-buster', 'the-reveal', 'insider-leak', 'identity-mirror',
  'confession', 'plot-twist', 'debate-starter', 'the-challenge',
] as const

// ─── EXPERIENCE_TYPES ─────────────────────────────────────────────────────────

describe('EXPERIENCE_TYPES', () => {
  it('has exactly 8 entries — one per psychological experience type', () => {
    expect(EXPERIENCE_TYPES).toHaveLength(8)
  })

  it('contains all 8 valid type identifiers', () => {
    const types = EXPERIENCE_TYPES.map((e) => e.type)
    for (const valid of VALID_EXPERIENCE_TYPES) {
      expect(types).toContain(valid)
    }
  })

  it('every entry has all required fields', () => {
    for (const exp of EXPERIENCE_TYPES) {
      expect(typeof exp.label).toBe('string')
      expect(exp.label.length).toBeGreaterThan(0)
      expect(typeof exp.emoji).toBe('string')
      expect(typeof exp.tagline).toBe('string')
      expect(typeof exp.mechanism).toBe('string')
      expect(Array.isArray(exp.slideRoles)).toBe(true)
      expect(exp.slideRoles).toHaveLength(5)
      expect(typeof exp.example).toBe('string')
    }
  })

  it('every entry has a non-empty example hook', () => {
    for (const exp of EXPERIENCE_TYPES) {
      expect(exp.example.length).toBeGreaterThan(10)
    }
  })
})

// ─── MOCK_IDEAS ───────────────────────────────────────────────────────────────

describe('MOCK_IDEAS', () => {
  it('has 5 ideas', () => {
    expect(MOCK_IDEAS).toHaveLength(5)
  })

  it('every idea has all required ContentIdea fields', () => {
    for (const idea of MOCK_IDEAS) {
      expect(typeof idea.id).toBe('string')
      expect(typeof idea.title).toBe('string')
      expect(typeof idea.hook).toBe('string')
      expect(typeof idea.target_viewer).toBe('string')
      expect(typeof idea.pain_point).toBe('string')
      expect(typeof idea.core_tension).toBe('string')
      expect(typeof idea.content_category).toBe('string')
      expect(idea.post_type).toBe('carousel')
      expect(['comments', 'shares', 'saves', 'tags', 'follows', 'debate', 'relatability', 'swipe-through'])
        .toContain(idea.interaction_goal)
      expect(['low', 'medium', 'high']).toContain(idea.claim_risk_initial)
    }
  })

  it('all idea IDs are unique', () => {
    const ids = MOCK_IDEAS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('initial scores are between 0 and 100', () => {
    for (const idea of MOCK_IDEAS) {
      if (idea.initial_score !== undefined) {
        expect(idea.initial_score).toBeGreaterThanOrEqual(0)
        expect(idea.initial_score).toBeLessThanOrEqual(100)
      }
    }
  })
})

// ─── MOCK_PRESSURE_TEST ───────────────────────────────────────────────────────

describe('MOCK_PRESSURE_TEST', () => {
  it('overall score is in valid range', () => {
    expect(MOCK_PRESSURE_TEST.overall).toBeGreaterThan(0)
    expect(MOCK_PRESSURE_TEST.overall).toBeLessThanOrEqual(100)
  })

  it('has all score dimension fields', () => {
    const fields = [
      'hook_strength', 'relatability', 'curiosity_gap', 'comment_potential',
      'share_potential', 'save_potential', 'visual_potential', 'brand_fit',
      'claim_safety', 'pipeline_readiness',
    ] as const
    for (const f of fields) {
      expect(typeof MOCK_PRESSURE_TEST[f]).toBe('number')
    }
  })

  it('has non-empty strengths, weaknesses, improvements', () => {
    expect(MOCK_PRESSURE_TEST.strengths.length).toBeGreaterThan(0)
    expect(MOCK_PRESSURE_TEST.weaknesses.length).toBeGreaterThan(0)
    expect(MOCK_PRESSURE_TEST.improvements.length).toBeGreaterThan(0)
  })
})

// ─── MOCK_SLIDES ──────────────────────────────────────────────────────────────

describe('MOCK_SLIDES', () => {
  it('has exactly 5 slides', () => {
    expect(MOCK_SLIDES).toHaveLength(5)
  })

  it('slide numbers are 1–5 in order', () => {
    MOCK_SLIDES.forEach((slide, i) => {
      expect(slide.slide_number).toBe(i + 1)
    })
  })

  it('every slide has required fields', () => {
    for (const slide of MOCK_SLIDES) {
      expect(typeof slide.role).toBe('string')
      expect(typeof slide.text).toBe('string')
      expect(typeof slide.visual_note).toBe('string')
      expect(['top', 'middle', 'bottom']).toContain(slide.text_position)
    }
  })
})

// ─── MOCK_EXPORT_ROW ──────────────────────────────────────────────────────────

describe('MOCK_EXPORT_ROW', () => {
  it('status is exactly "priority_queued"', () => {
    expect(MOCK_EXPORT_ROW.status).toBe('priority_queued')
  })

  it('has a non-empty title', () => {
    expect(typeof MOCK_EXPORT_ROW.title).toBe('string')
    expect(MOCK_EXPORT_ROW.title.length).toBeGreaterThan(0)
  })

  it('has a non-empty caption containing hashtags', () => {
    expect(typeof MOCK_EXPORT_ROW.caption).toBe('string')
    expect(MOCK_EXPORT_ROW.caption).toContain('#')
  })

  it('experience_type is a valid ContentExperienceType', () => {
    expect(VALID_EXPERIENCE_TYPES as readonly string[]).toContain(MOCK_EXPORT_ROW.experience_type)
  })

  it('has slide_count of exactly 5', () => {
    expect(MOCK_EXPORT_ROW.slide_count).toBe(5)
  })

  it('has all 5 slide hook/text fields populated', () => {
    expect(MOCK_EXPORT_ROW.slide_1_hook.length).toBeGreaterThan(0)
    expect(MOCK_EXPORT_ROW.slide_2_problem.length).toBeGreaterThan(0)
    expect(MOCK_EXPORT_ROW.slide_3_mechanism.length).toBeGreaterThan(0)
    expect(MOCK_EXPORT_ROW.slide_4_takeaway.length).toBeGreaterThan(0)
    expect(MOCK_EXPORT_ROW.slide_5_cta.length).toBeGreaterThan(0)
  })

  it('has valid claim_risk', () => {
    expect(['low', 'medium', 'high']).toContain(MOCK_EXPORT_ROW.claim_risk)
  })

  it('has a generated_at ISO date string', () => {
    expect(() => new Date(MOCK_EXPORT_ROW.generated_at)).not.toThrow()
    expect(new Date(MOCK_EXPORT_ROW.generated_at).getFullYear()).toBeGreaterThanOrEqual(2024)
  })
})

// ─── DEFAULT_SETTINGS ─────────────────────────────────────────────────────────

describe('DEFAULT_SETTINGS', () => {
  it('has all required AppSettings fields', () => {
    expect(typeof DEFAULT_SETTINGS.brandVoice).toBe('string')
    expect(typeof DEFAULT_SETTINGS.targetAudience).toBe('string')
    expect(Array.isArray(DEFAULT_SETTINGS.bannedPhrases)).toBe(true)
    expect(Array.isArray(DEFAULT_SETTINGS.defaultContentCategories)).toBe(true)
    expect(typeof DEFAULT_SETTINGS.defaultInteractionGoal).toBe('string')
    expect(typeof DEFAULT_SETTINGS.minimumIdeaScore).toBe('number')
    expect(typeof DEFAULT_SETTINGS.openAIModel).toBe('string')
  })

  it('minimumIdeaScore is between 0 and 100', () => {
    expect(DEFAULT_SETTINGS.minimumIdeaScore).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_SETTINGS.minimumIdeaScore).toBeLessThanOrEqual(100)
  })

  it('has at least one banned phrase', () => {
    expect(DEFAULT_SETTINGS.bannedPhrases.length).toBeGreaterThan(0)
  })
})

// ─── PROMPT_CHIPS ─────────────────────────────────────────────────────────────

describe('PROMPT_CHIPS', () => {
  it('has at least 4 chips', () => {
    expect(PROMPT_CHIPS.length).toBeGreaterThanOrEqual(4)
  })

  it('every chip has a label and emoji', () => {
    for (const chip of PROMPT_CHIPS) {
      expect(typeof chip.label).toBe('string')
      expect(chip.label.length).toBeGreaterThan(0)
      expect(typeof chip.emoji).toBe('string')
    }
  })
})
