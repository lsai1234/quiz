import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { QuizAnswers, StackIdentity } from '@/lib/types'

// Constructed lazily inside the handler — the OpenAI SDK throws at construction
// when no key is set, which would break the build/page-data collection.
function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

const GOAL_LABELS: Record<string, string> = {
  muscle: 'build muscle',
  energy: 'boost energy',
  performance: 'improve athletic performance',
  hydration: 'optimise hydration',
  recovery: 'speed up recovery',
  health: 'support general health and longevity',
  cutting: 'lose body fat',
  bulking: 'gain mass',
  'sleep-better': 'sleep better',
  'less-stress': 'manage stress',
  focus: 'improve focus and reduce brain fog',
  immune: 'support immune health',
  'skin-hair-nails': 'support skin, hair and nails',
  'gut-health': 'improve gut health and digestion',
  menopause: 'support hormonal balance through menopause',
}

const PERFORMANCE_GOAL_IDS = ['muscle', 'energy', 'performance', 'hydration', 'recovery', 'cutting', 'bulking']

export async function POST(req: NextRequest) {
  try {
    const client = getClient()
    // No key configured — fall through to the deterministic fallback identity.
    if (!client) throw new Error('OPENAI_API_KEY not set')

    const answers: QuizAnswers = await req.json()

    const goalText = answers.goals.map(g => GOAL_LABELS[g] ?? g).join(', ')
    const freq = answers.trainingFrequency ?? 'unknown frequency'
    const type = answers.trainingType?.length ? answers.trainingType.join(' & ') : 'mixed'
    const diet = answers.diet ?? 'balanced'
    const caffeine = answers.caffeineLevel ?? 'moderate'
    const budget = answers.budget ?? '50-80'
    const pref = answers.stackPreference ?? 'balanced'
    const lifestyle = answers.lifestyle.length > 0 ? answers.lifestyle.join(', ') : 'standard'
    const firstName = answers.name?.split(' ')[0]?.trim() || null
    const age = answers.exactAge ? `${answers.exactAge}` : (answers.ageBracket ?? null)
    const gender = answers.gender && answers.gender !== 'not-specified' ? answers.gender : null
    const formats = answers.preferredFormats?.length > 0 ? answers.preferredFormats.join(', ') : 'no preference'

    const isWellbeingOnly = answers.goals.length > 0 && !answers.goals.some(g => PERFORMANCE_GOAL_IDS.includes(g))

    const prompt = `You are a specialist nutrition advisor for CHRGD, a premium UK supplement brand.

Create a personalised supplement stack identity for ${isWellbeingOnly ? 'someone focused on everyday wellbeing (not a gym-focused athlete — avoid training/athlete language)' : 'an athlete'} with this profile:
${firstName ? `- Name: ${firstName}` : ''}
${age ? `- Age group: ${age}` : ''}
${gender ? `- Gender: ${gender}` : ''}
- Goals: ${goalText}
${answers.trainingFrequency ? `- Training: ${freq} per week, ${type}-focused sessions` : ''}
- Diet: ${diet}
- Lifestyle factors: ${lifestyle}
- Caffeine preference: ${caffeine}
- Budget: £${budget}/month
- Stack preference: ${pref}
- Preferred product formats: ${formats}

Return ONLY a JSON object (no markdown, no explanation, no asterisks in any field) with exactly these fields:
{
  "name": "A punchy 2-3 word stack name (e.g. 'Iron Foundations', 'Peak Protocol', 'Lean Machine'). Plain text only — no asterisks or markdown.",
  "archetype": "A 2-4 word athlete archetype label (e.g. 'The Strength Builder', 'The Endurance Athlete', 'The Weekend Warrior')",
  "description": "${firstName ? `Start by addressing ${firstName} directly. ` : ''}A 2-sentence description of this person's training identity and why this stack suits them. Use 'your' not 'the user's'. Do NOT make medical claims. Say 'may support' not 'will improve'.",
  "focusAreas": ["3 short focus area labels, e.g. 'Strength Output', 'Faster Recovery', 'Daily Energy'"],
  "routineFitScore": <integer 72-96, how well this stack fits their specific routine>
}

Rules: No medical claims. No guaranteed outcomes. Use 'selected based on your goals', 'may suit your routine', 'commonly used by ${isWellbeingOnly ? 'people' : 'athletes'} with similar profiles'. Never suggest supplements can treat, manage or replace medical care for any condition (including menopause); if anything health-related comes up, the only acceptable framing is to consult a GP — especially if pregnant, breastfeeding, or on prescribed medication such as HRT. Keep it premium, confident, direct. No markdown formatting anywhere in the response.`

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.8,
    })

    const raw = completion.choices[0]?.message?.content?.trim() ?? ''
    const identity: StackIdentity = JSON.parse(raw)

    // Strip any markdown formatting the model may have added
    const stripMd = (s: string) => s.replace(/\*+/g, '').replace(/_{2,}/g, '').trim()
    identity.name = stripMd(identity.name)
    identity.archetype = stripMd(identity.archetype)
    identity.description = stripMd(identity.description)

    return NextResponse.json(identity)
  } catch (err) {
    console.error('[generate-identity]', err)
    // Fallback identity so the flow never breaks
    const fallback: StackIdentity = {
      name: 'Peak Protocol',
      archetype: 'The Performance Athlete',
      description:
        'Your training demands a stack built around output and recovery. These selections may suit your goals and are commonly used by athletes with similar training profiles.',
      focusAreas: ['Performance Output', 'Faster Recovery', 'Daily Energy'],
      routineFitScore: 84,
    }
    return NextResponse.json(fallback)
  }
}
