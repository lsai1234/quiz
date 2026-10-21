import { ALL_GOALS, type Goal } from '@/lib/types'
import { GOAL_LABELS } from '@/lib/quiz-goals'
import { GOAL_CLAIMS, isAnyClaim } from '../goal-claims'
import {
  ANSWER_LINES, CHECK_LINES, GOAL_LINES, RESULTS_HEADINGS, activeDisplayName,
} from '../phrases'

/** Every fixed sentence in the file, plus the templates filled in. */
function everyPhrase(): string[] {
  return [
    ...Object.values(RESULTS_HEADINGS),
    ...Object.values(GOAL_LINES),
    ...Object.values(ANSWER_LINES).flatMap((m) => Object.values(m as Record<string, string>)),
    ...Object.values(CHECK_LINES.alreadyTaking),
    ...Object.values(CHECK_LINES.stimulant),
    CHECK_LINES.vegan,
    CHECK_LINES.glutenFree,
    CHECK_LINES.collagenVeggie,
    CHECK_LINES.dedupActive(['magnesium']),
    CHECK_LINES.dedupActive(['magnesium', 'ashwagandha', 'zinc']),
    CHECK_LINES.dedupActiveUnnamed,
    CHECK_LINES.doseCap('caffeine', 200),
  ]
}

const mappedGoals = (): Goal[] =>
  ALL_GOALS.filter((g) => {
    const entry = GOAL_CLAIMS[g]
    return isAnyClaim(entry) || entry.length > 0
  })

describe('GOAL_LINES', () => {
  it('has a line for every goal the map backs, and for no other goal', () => {
    expect(Object.keys(GOAL_LINES).sort()).toEqual(mappedGoals().sort())
  })

  it('reads "You said ..." and follows the quiz label', () => {
    for (const [goal, line] of Object.entries(GOAL_LINES) as Array<[Goal, string]>) {
      expect(line).toMatch(/^You said /)
      // The label's key word is in the line ("Build muscle" → "build muscle").
      const label = GOAL_LABELS[goal].toLowerCase().replace('&', '').split(/\s+/).find((w) => w.length > 3) ?? ''
      const keyWord = goal === 'health' ? 'healthier' : label
      expect(line.toLowerCase()).toContain(keyWord)
    }
  })
})

describe('ANSWER_LINES', () => {
  it('covers every option the quiz can store for each field', () => {
    expect(Object.keys(ANSWER_LINES.trainingFrequency).sort()).toEqual(['1-2x', '3-4x', '5-6x', 'daily'])
    expect(Object.keys(ANSWER_LINES.trainingExperience).sort()).toEqual(['experienced', 'intermediate', 'new'])
    expect(Object.keys(ANSWER_LINES.diet).sort()).toEqual(['clean', 'inconsistent', 'mostly-good', 'poor'])
    // Act2Quiz getSubQuestion: strengthFocus + sportType options. v2 writes a subset.
    expect(Object.keys(ANSWER_LINES.trainingFocus).sort()).toEqual(
      ['basketball', 'football', 'general', 'hypertrophy', 'other', 'powerlifting', 'rugby'],
    )
  })

  it('only covers answers that are not about health', () => {
    expect(Object.keys(ANSWER_LINES).sort()).toEqual(['diet', 'trainingExperience', 'trainingFocus', 'trainingFrequency'])
  })
})

describe('CHECK_LINES', () => {
  it('has an already-taking line for every item the engine excludes on', () => {
    expect(Object.keys(CHECK_LINES.alreadyTaking).sort()).toEqual(
      ['collagen', 'creatine', 'magnesium', 'multivitamin', 'omega-3', 'pre-workout', 'protein', 'vitamin-c', 'vitamin-d'],
    )
  })

  it('fills its templates', () => {
    expect(CHECK_LINES.dedupActive(['magnesium'])).toBe('Removed a doubled-up ingredient: magnesium.')
    expect(CHECK_LINES.dedupActive(['magnesium', 'ashwagandha'])).toBe('Removed doubled-up ingredients: magnesium and ashwagandha.')
    expect(CHECK_LINES.dedupActive(['a', 'b', 'c'])).toBe('Removed doubled-up ingredients: a, b and c.')
    expect(CHECK_LINES.doseCap('caffeine', 200)).toBe('Kept caffeine to 200 mg a day or less.')
  })
})

describe('every phrase', () => {
  const phrases = everyPhrase()

  it('is a sentence ending in a full stop (headings aside)', () => {
    const headings = new Set<string>(Object.values(RESULTS_HEADINGS))
    for (const p of phrases) if (!headings.has(p)) expect(p).toMatch(/^[A-Z].*\.$/)
  })

  it('says nothing about what a product does', () => {
    // A goal line may repeat the quiz's own label ("Immune support"): that is
    // what the person asked for, not something said about a product.
    const labels = Object.values(GOAL_LABELS).map((l) => l.toLowerCase())
    const effect = /\b(support\w*|boost\w*|help\w*|improv\w*|reduc\w*|prevent\w*|treat\w*|cure[sd]?|heal(s|ed|ing)?|protect\w*|repair\w*|promot\w*|fight\w*|reliev\w*|aid(s|ed)?)\b/i
    for (const p of phrases) {
      const own = labels.reduce((s, l) => s.split(l).join(''), p.toLowerCase())
      expect(own).not.toMatch(effect)
    }
  })

  it('never mentions the safety screen or anything that reads as medical screening', () => {
    const medical = /pregnan|breastfeed|medicat|prescri|allerg|shellfish|safe|screen|condition|doctor|\bGP\b|pharmac|contraindicat|diagnos|symptom|deficien/i
    for (const p of phrases) expect(p).not.toMatch(medical)
  })

  it('never names an unbacked goal', () => {
    const unbacked = /sleep|stress|recover|calm|relax|anxi|menopaus|\bgut\b|digest|skin|hair|nails|lean|fat|weight/i
    for (const p of phrases) expect(p).not.toMatch(unbacked)
  })

  it('uses no pressure wording', () => {
    const pressure = /one-time|last chance|only exists|no code|expires|tonight|hurry|limited|don.t miss|today only|ends soon/i
    for (const p of phrases) expect(p).not.toMatch(pressure)
  })

  it('carries no emoji or icon characters', () => {
    const banned = /[■-◿☀-⛿✀-➿⬀-⯿️\u{1F000}-\u{1FAFF}]/u
    for (const p of phrases) expect(p).not.toMatch(banned)
  })

  it('uses UK spelling', () => {
    for (const p of phrases) expect(p).not.toMatch(/\b\w{3,}iz(e|ed|es|ing)\b|color|favor|center\b/i)
  })
})

describe('activeDisplayName', () => {
  it.each<[string, string | null]>([
    ['caffeine', 'caffeine'],
    ['magnesium', 'magnesium'],
    ['ashwagandha', 'ashwagandha'],
    ['vitamin-c', 'vitamin C'],
    ['vitamin c', 'vitamin C'],
    ['vitamin-d3', 'vitamin D3'],
    ['vitamin-b6', 'vitamin B6'],
    ['theanine', 'L-theanine'],
    ['red-clover', 'red clover'],
    ['magnesium bisglycinate', 'magnesium bisglycinate'],
    // Not fit to show: a dose or count in the name, or too long.
    ['10 probiotic strains', null],
    ['25 billion cfu', null],
    ['citicoline, phosphatidylserine and more', null],
    ['', null],
  ])('%s → %s', (raw, shown) => {
    expect(activeDisplayName(raw)).toBe(shown)
  })
})
