import type {
  ContentIdea,
  ScoreBreakdown,
  CarouselSlide,
  InteractionGoal,
  InteractionOptimisation,
  VisualDirection,
  ClaimSafetyResult,
  ExportRow,
  AppSettings,
} from './types'
import {
  MOCK_IDEAS,
  MOCK_PRESSURE_TEST,
  MOCK_SLIDES,
  MOCK_OPTIMISATION,
  MOCK_VISUAL_DIRECTION,
  MOCK_CLAIM_SAFETY,
  MOCK_EXPORT_ROW,
} from './mock-data'

const isMockMode = !process.env.NEXT_PUBLIC_OPENAI_API_KEY && typeof window !== 'undefined'

async function delay(ms = 1200) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function generateIdeas(input: string, chip: string | null, settings: AppSettings): Promise<ContentIdea[]> {
  if (isMockMode || !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    await delay(1400)
    return MOCK_IDEAS.map((idea, i) => ({ ...idea, id: `idea-${Date.now()}-${i}` }))
  }

  const res = await fetch('/api/ai/generate-ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, chip, settings }),
  })
  if (!res.ok) throw new Error('Failed to generate ideas')
  const data = await res.json()
  return validateIdeas(data.ideas)
}

export async function pressureTestIdea(idea: ContentIdea, settings: AppSettings): Promise<ScoreBreakdown> {
  if (isMockMode || !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    await delay(1600)
    return { ...MOCK_PRESSURE_TEST }
  }

  const res = await fetch('/api/ai/pressure-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, settings }),
  })
  if (!res.ok) throw new Error('Failed to pressure test idea')
  return res.json()
}

export async function improveIdea(
  idea: ContentIdea,
  action: string,
  settings: AppSettings
): Promise<ContentIdea> {
  if (isMockMode || !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    await delay(1200)
    return { ...idea, hook: `[Improved: ${action}] ${idea.hook}` }
  }

  const res = await fetch('/api/ai/improve-idea', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, action, settings }),
  })
  if (!res.ok) throw new Error('Failed to improve idea')
  return res.json()
}

export async function buildCarousel(
  idea: ContentIdea,
  settings: AppSettings,
  experienceType?: import('./types').ContentExperienceType | null
): Promise<CarouselSlide[]> {
  if (isMockMode || !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    await delay(1800)
    return [...MOCK_SLIDES]
  }

  const res = await fetch('/api/ai/build-carousel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, settings, experienceType }),
  })
  if (!res.ok) throw new Error('Failed to build carousel')
  return res.json()
}

export async function improveSlide(
  slide: CarouselSlide,
  action: string,
  idea: ContentIdea,
  settings: AppSettings
): Promise<CarouselSlide> {
  if (isMockMode || !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    await delay(900)
    return { ...slide, text: `[${action}]\n${slide.text}` }
  }

  const res = await fetch('/api/ai/improve-slide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slide, action, idea, settings }),
  })
  if (!res.ok) throw new Error('Failed to improve slide')
  return res.json()
}

export async function optimiseInteraction(
  slides: CarouselSlide[],
  goal: InteractionGoal,
  idea: ContentIdea,
  settings: AppSettings
): Promise<InteractionOptimisation> {
  if (isMockMode || !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    await delay(1400)
    return { ...MOCK_OPTIMISATION, goal }
  }

  const res = await fetch('/api/ai/optimise-interaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slides, goal, idea, settings }),
  })
  if (!res.ok) throw new Error('Failed to optimise interaction')
  return res.json()
}

export async function generateVisualDirection(
  slides: CarouselSlide[],
  idea: ContentIdea,
  settings: AppSettings
): Promise<VisualDirection> {
  if (isMockMode || !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    await delay(1300)
    return { ...MOCK_VISUAL_DIRECTION }
  }

  const res = await fetch('/api/ai/visual-direction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slides, idea, settings }),
  })
  if (!res.ok) throw new Error('Failed to generate visual direction')
  return res.json()
}

export async function checkClaimSafety(
  slides: CarouselSlide[],
  idea: ContentIdea,
  settings: AppSettings
): Promise<ClaimSafetyResult> {
  if (isMockMode || !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    await delay(1100)
    return { ...MOCK_CLAIM_SAFETY, overridden: false }
  }

  const res = await fetch('/api/ai/claim-safety', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slides, idea, settings }),
  })
  if (!res.ok) throw new Error('Failed to check claim safety')
  return res.json()
}

export async function prepareExportRow(
  idea: ContentIdea,
  slides: CarouselSlide[],
  optimisation: InteractionOptimisation | null,
  visualDirection: VisualDirection | null,
  claimSafety: ClaimSafetyResult | null,
  nextId: string,
  experienceType: import('./types').ContentExperienceType | null
): Promise<ExportRow> {
  await delay(400)

  // Build caption from optimisation data
  const captionBody = optimisation?.caption_angle ?? idea.hook
  const hashtags = optimisation?.hashtags_hint ?? ''
  const commentPrompt = optimisation?.comment_trigger ?? ''
  const caption = `${captionBody}\n\n${commentPrompt}\n\n${hashtags}`.trim()

  if (isMockMode || !process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    return {
      ...MOCK_EXPORT_ROW,
      idea_id: nextId,
      title: idea.title,
      status: 'priority_queued',
      experience_type: experienceType ?? 'myth-buster',
      caption,
      generated_at: new Date().toISOString(),
      // Pull live slide content if we have it
      slide_1_hook: slides[0]?.text ?? MOCK_EXPORT_ROW.slide_1_hook,
      slide_2_problem: slides[1]?.text ?? MOCK_EXPORT_ROW.slide_2_problem,
      slide_3_mechanism: slides[2]?.text ?? MOCK_EXPORT_ROW.slide_3_mechanism,
      slide_4_takeaway: slides[3]?.text ?? MOCK_EXPORT_ROW.slide_4_takeaway,
      slide_5_cta: slides[4]?.text ?? MOCK_EXPORT_ROW.slide_5_cta,
      slide_1_role: slides[0]?.role ?? MOCK_EXPORT_ROW.slide_1_role,
      slide_2_role: slides[1]?.role ?? MOCK_EXPORT_ROW.slide_2_role,
      slide_3_role: slides[2]?.role ?? MOCK_EXPORT_ROW.slide_3_role,
      slide_4_role: slides[3]?.role ?? MOCK_EXPORT_ROW.slide_4_role,
      slide_5_role: slides[4]?.role ?? MOCK_EXPORT_ROW.slide_5_role,
      caption_angle: optimisation?.caption_angle ?? MOCK_EXPORT_ROW.caption_angle,
      comment_trigger: optimisation?.comment_trigger ?? MOCK_EXPORT_ROW.comment_trigger,
      hashtags_hint: optimisation?.hashtags_hint ?? MOCK_EXPORT_ROW.hashtags_hint,
      claim_risk: claimSafety?.claim_risk ?? MOCK_EXPORT_ROW.claim_risk,
      claim_safety_notes: claimSafety?.claim_safety_notes ?? MOCK_EXPORT_ROW.claim_safety_notes,
      visual_style_hint: visualDirection?.visual_style_hint ?? MOCK_EXPORT_ROW.visual_style_hint,
    }
  }

  const res = await fetch('/api/ai/prepare-export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, slides, optimisation, visualDirection, claimSafety, nextId, experienceType, caption }),
  })
  if (!res.ok) throw new Error('Failed to prepare export row')
  return res.json()
}

function validateIdeas(ideas: unknown[]): ContentIdea[] {
  if (!Array.isArray(ideas)) return MOCK_IDEAS
  return ideas.filter(
    (i): i is ContentIdea =>
      typeof i === 'object' && i !== null && 'hook' in i && 'title' in i
  )
}
