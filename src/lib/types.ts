export type ClaimRisk = 'low' | 'medium' | 'high'
export type Priority = 'low' | 'medium' | 'high'
export type ExportStatus = 'priority_queued'

export type ContentExperienceType =
  | 'myth-buster'
  | 'the-reveal'
  | 'insider-leak'
  | 'identity-mirror'
  | 'confession'
  | 'plot-twist'
  | 'debate-starter'
  | 'the-challenge'
export type TextDensity = 'low' | 'medium' | 'high'
export type LayoutRisk = 'low' | 'medium' | 'high'
export type InteractionGoal =
  | 'comments'
  | 'shares'
  | 'saves'
  | 'tags'
  | 'follows'
  | 'debate'
  | 'relatability'
  | 'swipe-through'

export type Stage =
  | 'idea-spark'
  | 'idea-cards'
  | 'pressure-test'
  | 'carousel-builder'
  | 'interaction-optimiser'
  | 'visual-director'
  | 'claim-safety'
  | 'preview'
  | 'export-review'

export const STAGES: Stage[] = [
  'idea-spark',
  'idea-cards',
  'pressure-test',
  'carousel-builder',
  'interaction-optimiser',
  'visual-director',
  'claim-safety',
  'preview',
  'export-review',
]

export const STAGE_LABELS: Record<Stage, string> = {
  'idea-spark': 'Idea Spark',
  'idea-cards': 'Idea Cards',
  'pressure-test': 'Pressure Test',
  'carousel-builder': 'Carousel Builder',
  'interaction-optimiser': 'Interaction Optimiser',
  'visual-director': 'Visual Director',
  'claim-safety': 'Claim Safety',
  preview: 'Preview',
  'export-review': 'Export Review',
}

export interface ContentIdea {
  id: string
  title: string
  hook: string
  target_viewer: string
  pain_point: string
  core_tension: string
  content_category: string
  post_type: string
  interaction_goal: InteractionGoal
  visual_potential: string
  claim_risk_initial: ClaimRisk
  initial_score?: number
}

export interface ScoreBreakdown {
  overall: number
  hook_strength: number
  relatability: number
  curiosity_gap: number
  comment_potential: number
  share_potential: number
  save_potential: number
  visual_potential: number
  brand_fit: number
  claim_safety: number
  pipeline_readiness: number
  strengths: string[]
  weaknesses: string[]
  improvements: string[]
}

export interface CarouselSlide {
  slide_number: number
  role: string
  text: string
  visual_note: string
  text_position: 'top' | 'middle' | 'bottom'
}

export interface InteractionOptimisation {
  goal: InteractionGoal
  slide_1_hook: string
  slide_5_cta: string
  caption_angle: string
  comment_trigger: string
  hashtags_hint: string
  cta_warning?: string
}

export interface VisualDirection {
  visual_style_hint: string
  ai_visual_priority: Priority
  safe_zone_priority: Priority
  preferred_text_position: string
  text_density: TextDensity
  layout_risk: LayoutRisk
  platform_ui_risk: LayoutRisk
  double_take_detail: string
}

export interface RiskyPhrase {
  phrase: string
  issue: string
  safer_rewrite: string
}

export interface ClaimSafetyResult {
  claim_risk: ClaimRisk
  claim_safety_notes: string
  risky_phrases: RiskyPhrase[]
  overridden?: boolean
}

export interface ExportRow {
  idea_id: string
  status: ExportStatus
  priority: Priority
  title: string
  content_category: string
  target_viewer: string
  pain_point: string
  core_tension: string
  experience_type: ContentExperienceType
  post_type: 'carousel'
  carousel_story_arc: string
  slide_count: 5
  slide_1_role: string
  slide_1_hook: string
  slide_2_role: string
  slide_2_problem: string
  slide_3_role: string
  slide_3_mechanism: string
  slide_4_role: string
  slide_4_takeaway: string
  slide_5_role: string
  slide_5_cta: string
  visual_style_hint: string
  ai_visual_priority: Priority
  safe_zone_priority: Priority
  preferred_text_position: string
  text_density: TextDensity
  layout_risk: LayoutRisk
  platform_ui_risk: LayoutRisk
  claim_risk: ClaimRisk
  claim_safety_notes: string
  caption: string
  caption_angle: string
  comment_trigger: string
  hashtags_hint: string
  generated_at: string
  learning_tag: string
}

export interface Draft {
  id: string
  title: string
  stage: Stage
  updatedAt: string
  idea: ContentIdea | null
  experienceType: ContentExperienceType | null
  slides: CarouselSlide[]
  score: ScoreBreakdown | null
  optimisation: InteractionOptimisation | null
  visualDirection: VisualDirection | null
  claimSafety: ClaimSafetyResult | null
}

export interface AppSettings {
  brandVoice: string
  targetAudience: string
  bannedPhrases: string[]
  defaultContentCategories: string[]
  defaultInteractionGoal: InteractionGoal
  visualStyleGuidance: string
  claimSafetyRules: string
  minimumIdeaScore: number
  googleSheetId: string
  sheetTabName: string
  openAIModel: string
}

export interface WorkingState {
  input: string
  promptChip: string | null
  candidates: ContentIdea[]
  selectedIdea: ContentIdea | null
  pressureTest: ScoreBreakdown | null
  experienceType: ContentExperienceType | null
  slides: CarouselSlide[]
  interactionGoal: InteractionGoal | null
  optimisation: InteractionOptimisation | null
  visualDirection: VisualDirection | null
  claimSafety: ClaimSafetyResult | null
  exportRow: ExportRow | null
}
