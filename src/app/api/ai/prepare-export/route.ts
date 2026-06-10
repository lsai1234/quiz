import { NextRequest, NextResponse } from 'next/server'
import { MOCK_EXPORT_ROW } from '@/lib/mock-data'

// This route assembles the export row server-side when needed.
// In practice, the client-side prepareExportRow handles this in mock mode
// and assembles from existing state — this route is the live fallback.
export async function POST(req: NextRequest) {
  const { idea, slides, optimisation, visualDirection, claimSafety, nextId, experienceType, caption } =
    await req.json()

  const row = {
    ...MOCK_EXPORT_ROW,
    idea_id: nextId,
    status: 'priority_queued' as const,
    title: idea.title,
    content_category: idea.content_category,
    target_viewer: idea.target_viewer,
    pain_point: idea.pain_point,
    core_tension: idea.core_tension,
    experience_type: experienceType ?? 'myth-buster',
    post_type: 'carousel' as const,
    carousel_story_arc: idea.hook,
    slide_count: 5 as const,
    slide_1_role: slides[0]?.role ?? '',
    slide_1_hook: slides[0]?.text ?? '',
    slide_2_role: slides[1]?.role ?? '',
    slide_2_problem: slides[1]?.text ?? '',
    slide_3_role: slides[2]?.role ?? '',
    slide_3_mechanism: slides[2]?.text ?? '',
    slide_4_role: slides[3]?.role ?? '',
    slide_4_takeaway: slides[3]?.text ?? '',
    slide_5_role: slides[4]?.role ?? '',
    slide_5_cta: slides[4]?.text ?? '',
    visual_style_hint: visualDirection?.visual_style_hint ?? '',
    ai_visual_priority: visualDirection?.ai_visual_priority ?? 'medium',
    safe_zone_priority: visualDirection?.safe_zone_priority ?? 'medium',
    preferred_text_position: visualDirection?.preferred_text_position ?? 'bottom',
    text_density: visualDirection?.text_density ?? 'medium',
    layout_risk: visualDirection?.layout_risk ?? 'low',
    platform_ui_risk: visualDirection?.platform_ui_risk ?? 'low',
    claim_risk: claimSafety?.claim_risk ?? 'low',
    claim_safety_notes: claimSafety?.claim_safety_notes ?? '',
    caption,
    caption_angle: optimisation?.caption_angle ?? idea.hook,
    comment_trigger: optimisation?.comment_trigger ?? '',
    hashtags_hint: optimisation?.hashtags_hint ?? '',
    generated_at: new Date().toISOString(),
    learning_tag: idea.content_category?.toLowerCase().replace(/\s+/g, '-') ?? '',
  }

  return NextResponse.json(row)
}
