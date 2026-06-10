import { reducer, initialState, initialWorking } from '../store'
import {
  MOCK_IDEAS,
  MOCK_PRESSURE_TEST,
  MOCK_SLIDES,
  MOCK_OPTIMISATION,
  MOCK_VISUAL_DIRECTION,
  MOCK_CLAIM_SAFETY,
  MOCK_EXPORT_ROW,
} from '../mock-data'
import type { Draft } from '../types'

// ─── helpers ─────────────────────────────────────────────────────────────────

const idea = MOCK_IDEAS[0]
const stateWithIdea = reducer(initialState, { type: 'SELECT_IDEA', idea })

// ─── SET_STAGE ────────────────────────────────────────────────────────────────

describe('SET_STAGE', () => {
  it('changes the stage', () => {
    const s = reducer(initialState, { type: 'SET_STAGE', stage: 'pressure-test' })
    expect(s.stage).toBe('pressure-test')
  })

  it('does not mutate other state', () => {
    const s = reducer(initialState, { type: 'SET_STAGE', stage: 'carousel-builder' })
    expect(s.working).toBe(initialState.working)
    expect(s.drafts).toBe(initialState.drafts)
  })
})

// ─── SET_INPUT ────────────────────────────────────────────────────────────────

describe('SET_INPUT', () => {
  it('updates the input string', () => {
    const s = reducer(initialState, { type: 'SET_INPUT', input: 'protein myths' })
    expect(s.working.input).toBe('protein myths')
  })

  it('sets a chip when provided', () => {
    const s = reducer(initialState, { type: 'SET_INPUT', input: 'test', chip: 'Gym myth' })
    expect(s.working.promptChip).toBe('Gym myth')
  })

  it('preserves existing chip when chip is not provided', () => {
    const s1 = reducer(initialState, { type: 'SET_INPUT', input: 'a', chip: 'Hot take' })
    const s2 = reducer(s1, { type: 'SET_INPUT', input: 'b' })
    expect(s2.working.promptChip).toBe('Hot take')
  })
})

// ─── SET_CANDIDATES ───────────────────────────────────────────────────────────

describe('SET_CANDIDATES', () => {
  it('stores the candidates array', () => {
    const s = reducer(initialState, { type: 'SET_CANDIDATES', candidates: MOCK_IDEAS })
    expect(s.working.candidates).toHaveLength(5)
    expect(s.working.candidates[0].id).toBe('mock-1')
  })
})

// ─── SELECT_IDEA ──────────────────────────────────────────────────────────────

describe('SELECT_IDEA', () => {
  it('stores the selected idea', () => {
    const s = reducer(initialState, { type: 'SELECT_IDEA', idea })
    expect(s.working.selectedIdea).toEqual(idea)
  })
})

// ─── SET_PRESSURE_TEST ────────────────────────────────────────────────────────

describe('SET_PRESSURE_TEST', () => {
  it('stores the score breakdown', () => {
    const s = reducer(initialState, { type: 'SET_PRESSURE_TEST', result: MOCK_PRESSURE_TEST })
    expect(s.working.pressureTest?.overall).toBe(84)
    expect(s.working.pressureTest?.strengths).toHaveLength(3)
  })
})

// ─── SET_EXPERIENCE_TYPE ──────────────────────────────────────────────────────

describe('SET_EXPERIENCE_TYPE', () => {
  it('sets the experience type', () => {
    const s = reducer(initialState, { type: 'SET_EXPERIENCE_TYPE', experienceType: 'myth-buster' })
    expect(s.working.experienceType).toBe('myth-buster')
  })

  it('clears existing slides when type changes', () => {
    const withSlides = reducer(initialState, { type: 'SET_SLIDES', slides: MOCK_SLIDES })
    expect(withSlides.working.slides).toHaveLength(5)
    const changed = reducer(withSlides, { type: 'SET_EXPERIENCE_TYPE', experienceType: 'the-reveal' })
    expect(changed.working.slides).toHaveLength(0)
  })
})

// ─── SET_SLIDES ───────────────────────────────────────────────────────────────

describe('SET_SLIDES', () => {
  it('stores the slides array', () => {
    const s = reducer(initialState, { type: 'SET_SLIDES', slides: MOCK_SLIDES })
    expect(s.working.slides).toHaveLength(5)
    expect(s.working.slides[0].slide_number).toBe(1)
  })
})

// ─── UPDATE_SLIDE ─────────────────────────────────────────────────────────────

describe('UPDATE_SLIDE', () => {
  it('replaces a slide at the given index', () => {
    const withSlides = reducer(initialState, { type: 'SET_SLIDES', slides: MOCK_SLIDES })
    const updatedSlide = { ...MOCK_SLIDES[2], text: 'New text for slide 3' }
    const s = reducer(withSlides, { type: 'UPDATE_SLIDE', index: 2, slide: updatedSlide })
    expect(s.working.slides[2].text).toBe('New text for slide 3')
    expect(s.working.slides[0].text).toBe(MOCK_SLIDES[0].text)
    expect(s.working.slides[4].text).toBe(MOCK_SLIDES[4].text)
  })
})

// ─── SET_INTERACTION_GOAL ─────────────────────────────────────────────────────

describe('SET_INTERACTION_GOAL', () => {
  it('stores the interaction goal', () => {
    const s = reducer(initialState, { type: 'SET_INTERACTION_GOAL', goal: 'comments' })
    expect(s.working.interactionGoal).toBe('comments')
  })
})

// ─── SET_OPTIMISATION ────────────────────────────────────────────────────────

describe('SET_OPTIMISATION', () => {
  it('stores the optimisation result', () => {
    const s = reducer(initialState, { type: 'SET_OPTIMISATION', result: MOCK_OPTIMISATION })
    expect(s.working.optimisation?.goal).toBe('saves')
    expect(s.working.optimisation?.hashtags_hint).toContain('#proteinmyth')
  })
})

// ─── SET_VISUAL_DIRECTION ─────────────────────────────────────────────────────

describe('SET_VISUAL_DIRECTION', () => {
  it('stores the visual direction', () => {
    const s = reducer(initialState, { type: 'SET_VISUAL_DIRECTION', result: MOCK_VISUAL_DIRECTION })
    expect(s.working.visualDirection?.ai_visual_priority).toBe('high')
    expect(s.working.visualDirection?.text_density).toBe('low')
  })
})

// ─── SET_CLAIM_SAFETY ─────────────────────────────────────────────────────────

describe('SET_CLAIM_SAFETY', () => {
  it('stores the claim safety result', () => {
    const s = reducer(initialState, { type: 'SET_CLAIM_SAFETY', result: MOCK_CLAIM_SAFETY })
    expect(s.working.claimSafety?.claim_risk).toBe('medium')
    expect(s.working.claimSafety?.risky_phrases).toHaveLength(2)
  })
})

// ─── SET_EXPORT_ROW ───────────────────────────────────────────────────────────

describe('SET_EXPORT_ROW', () => {
  it('stores the export row', () => {
    const s = reducer(initialState, { type: 'SET_EXPORT_ROW', row: MOCK_EXPORT_ROW })
    expect(s.working.exportRow?.status).toBe('priority_queued')
    expect(s.working.exportRow?.idea_id).toBe('G-042')
  })
})

// ─── SET_LOADING ──────────────────────────────────────────────────────────────

describe('SET_LOADING', () => {
  it('sets loading true with a message', () => {
    const s = reducer(initialState, { type: 'SET_LOADING', loading: true, message: 'Generating...' })
    expect(s.isLoading).toBe(true)
    expect(s.loadingMessage).toBe('Generating...')
  })

  it('clears message when loading is set to false', () => {
    const s = reducer(initialState, { type: 'SET_LOADING', loading: false })
    expect(s.isLoading).toBe(false)
    expect(s.loadingMessage).toBe('')
  })
})

// ─── SET_EXPORT_STATUS ────────────────────────────────────────────────────────

describe('SET_EXPORT_STATUS', () => {
  it('sets success status with message', () => {
    const s = reducer(initialState, { type: 'SET_EXPORT_STATUS', status: 'success', message: 'Exported as G-042' })
    expect(s.exportStatus).toBe('success')
    expect(s.exportMessage).toBe('Exported as G-042')
  })

  it('sets error status', () => {
    const s = reducer(initialState, { type: 'SET_EXPORT_STATUS', status: 'error', message: 'Network error' })
    expect(s.exportStatus).toBe('error')
    expect(s.exportMessage).toBe('Network error')
  })
})

// ─── SAVE_DRAFT ───────────────────────────────────────────────────────────────

describe('SAVE_DRAFT', () => {
  it('creates a new draft from current working state', () => {
    const withIdea = reducer(stateWithIdea, { type: 'SET_STAGE', stage: 'pressure-test' })
    const s = reducer(withIdea, { type: 'SAVE_DRAFT' })
    expect(s.drafts).toHaveLength(1)
    expect(s.drafts[0].title).toBe(idea.title)
    expect(s.drafts[0].stage).toBe('pressure-test')
    expect(s.drafts[0].id).toBe(idea.id)
  })

  it('updates an existing draft with the same id', () => {
    const s1 = reducer(stateWithIdea, { type: 'SAVE_DRAFT' })
    expect(s1.drafts).toHaveLength(1)
    const withNewStage = reducer(s1, { type: 'SET_STAGE', stage: 'carousel-builder' })
    const s2 = reducer(withNewStage, { type: 'SAVE_DRAFT' })
    expect(s2.drafts).toHaveLength(1)
    expect(s2.drafts[0].stage).toBe('carousel-builder')
  })

  it('uses input as fallback title when no idea is selected', () => {
    const withInput = reducer(initialState, { type: 'SET_INPUT', input: 'my idea' })
    const s = reducer(withInput, { type: 'SAVE_DRAFT' })
    expect(s.drafts[0].title).toBe('my idea')
  })

  it('falls back to "Untitled draft" when no idea or input', () => {
    const s = reducer(initialState, { type: 'SAVE_DRAFT' })
    expect(s.drafts[0].title).toBe('Untitled draft')
  })

  it('caps drafts at 10', () => {
    let s = initialState
    // Create 11 drafts with different idea ids
    for (let i = 0; i < 11; i++) {
      const uniqueIdea = { ...idea, id: `idea-${i}`, title: `Idea ${i}` }
      s = reducer(s, { type: 'SELECT_IDEA', idea: uniqueIdea })
      s = reducer(s, { type: 'SAVE_DRAFT' })
    }
    expect(s.drafts.length).toBeLessThanOrEqual(10)
  })
})

// ─── LOAD_DRAFT ───────────────────────────────────────────────────────────────

describe('LOAD_DRAFT', () => {
  it('restores stage and working state from draft', () => {
    const draft: Draft = {
      id: 'draft-test',
      title: 'Test draft',
      stage: 'interaction-optimiser',
      updatedAt: new Date().toISOString(),
      idea,
      experienceType: 'myth-buster',
      slides: MOCK_SLIDES,
      score: MOCK_PRESSURE_TEST,
      optimisation: MOCK_OPTIMISATION,
      visualDirection: MOCK_VISUAL_DIRECTION,
      claimSafety: MOCK_CLAIM_SAFETY,
    }
    const s = reducer(initialState, { type: 'LOAD_DRAFT', draft })
    expect(s.stage).toBe('interaction-optimiser')
    expect(s.working.selectedIdea).toEqual(idea)
    expect(s.working.experienceType).toBe('myth-buster')
    expect(s.working.slides).toHaveLength(5)
    expect(s.working.pressureTest?.overall).toBe(84)
    expect(s.working.optimisation?.goal).toBe('saves')
  })

  it('handles drafts with no experienceType', () => {
    const draft: Draft = {
      id: 'draft-old',
      title: 'Old draft',
      stage: 'pressure-test',
      updatedAt: new Date().toISOString(),
      idea: null,
      experienceType: null,
      slides: [],
      score: null,
      optimisation: null,
      visualDirection: null,
      claimSafety: null,
    }
    const s = reducer(initialState, { type: 'LOAD_DRAFT', draft })
    expect(s.working.experienceType).toBeNull()
  })
})

// ─── DELETE_DRAFT ─────────────────────────────────────────────────────────────

describe('DELETE_DRAFT', () => {
  it('removes the draft with the matching id', () => {
    const s1 = reducer(stateWithIdea, { type: 'SAVE_DRAFT' })
    expect(s1.drafts).toHaveLength(1)
    const s2 = reducer(s1, { type: 'DELETE_DRAFT', id: idea.id })
    expect(s2.drafts).toHaveLength(0)
  })

  it('leaves drafts untouched when id does not match', () => {
    const s1 = reducer(stateWithIdea, { type: 'SAVE_DRAFT' })
    const s2 = reducer(s1, { type: 'DELETE_DRAFT', id: 'no-such-id' })
    expect(s2.drafts).toHaveLength(1)
  })
})

// ─── NEW_IDEA ─────────────────────────────────────────────────────────────────

describe('NEW_IDEA', () => {
  it('resets stage to idea-spark and clears all working state', () => {
    const complex = reducer(
      reducer(reducer(stateWithIdea, { type: 'SET_SLIDES', slides: MOCK_SLIDES }),
        { type: 'SET_STAGE', stage: 'export-review' }),
      { type: 'SET_EXPORT_STATUS', status: 'success', message: 'done' }
    )
    const s = reducer(complex, { type: 'NEW_IDEA' })
    expect(s.stage).toBe('idea-spark')
    expect(s.working.selectedIdea).toBeNull()
    expect(s.working.slides).toHaveLength(0)
    expect(s.exportStatus).toBe('idle')
  })

  it('preserves drafts and settings', () => {
    const s1 = reducer(stateWithIdea, { type: 'SAVE_DRAFT' })
    const s2 = reducer(s1, { type: 'NEW_IDEA' })
    expect(s2.drafts).toHaveLength(1)
    expect(s2.settings).toEqual(s1.settings)
  })
})

// ─── UPDATE_SETTINGS ──────────────────────────────────────────────────────────

describe('UPDATE_SETTINGS', () => {
  it('merges partial settings', () => {
    const s = reducer(initialState, { type: 'UPDATE_SETTINGS', settings: { openAIModel: 'gpt-4-turbo', minimumIdeaScore: 80 } })
    expect(s.settings.openAIModel).toBe('gpt-4-turbo')
    expect(s.settings.minimumIdeaScore).toBe(80)
    expect(s.settings.brandVoice).toBe(initialState.settings.brandVoice)
  })
})
