import { readFileSync } from 'fs'
import { emptyInterview } from '../types'
import { answerQuestion, setForm, setGoals, setTrack } from '../interview'
import { projectAnswers } from '../project'
import { planNext } from '../planner'
import { questionById, BANK } from '../bank'
import { defaultAnswers } from '@/lib/quiz-answers'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue'

const Q = (id: string) => questionById(id)!

function seeded(goals: Parameters<typeof setGoals>[1] = ['energy']) {
  let s = emptyInterview(10)
  s = setTrack(s, 'performance')
  s = setGoals(s, goals)
  s = setForm(s, { name: ' Sam ', ageBracket: '35-44', gender: 'female', weightBand: '60-75' })
  s = answerQuestion(s, Q('goals'), [])
  s = answerQuestion(s, Q('safety'), [])
  s = answerQuestion(s, Q('personal'), [])
  return s
}

describe('the projection', () => {
  it('carries the profile across', () => {
    const a = projectAnswers(seeded())
    expect(a.name).toBe('Sam')
    expect(a.track).toBe('performance')
    expect(a.goals).toEqual(['energy'])
    expect(a.primaryGoal).toBe('energy')
    expect(a.ageBracket).toBe('35-44')
    expect(a.weightBand).toBe('60-75')
  })

  it('writes the canonical fields an option settles', () => {
    // This is what keeps the engine unforked: v2 answers arrive in the same
    // shape v1 has always produced.
    let s = seeded()
    s = answerQuestion(s, Q('caffeine'), ['none'])
    const a = projectAnswers(s)
    expect(a.caffeineLevel).toBe('none')
    expect(a.stimPreference).toBe('no')
  })

  it('unions array fields instead of letting the last writer win', () => {
    // Three safety flags on one screen. A shallow merge would keep only one,
    // and the one it dropped could be the pregnancy flag.
    let s = seeded()
    s = answerQuestion(s, Q('safety'), ['pregnancy', 'medication', 'shellfish'])
    const a = projectAnswers(s)
    expect(a.safetyFlags).toEqual(expect.arrayContaining(['pregnancy', 'medication', 'shellfish']))
    expect(a.safetyFlags).toHaveLength(3)
  })

  it('collects lifestyle signals from across the whole run, de-duplicated', () => {
    let s = seeded()
    s = answerQuestion(s, Q('energy-when'), ['mornings'])
    s = answerQuestion(s, Q('energy-mornings'), ['cant-switch-off'])
    s = answerQuestion(s, Q('sleep-hours'), ['under-6'])
    const a = projectAnswers(s)
    expect(a.lifestyle).toContain('poor-sleep')
    expect(a.lifestyle.filter((l) => l === 'poor-sleep')).toHaveLength(1)
  })

  it('merges the wellbeing follow-up record rather than replacing it', () => {
    let s = seeded(['sleep-better', 'less-stress'])
    s = answerQuestion(s, Q('sleep-shape'), ['getting-off'])
    s = answerQuestion(s, Q('stress-when'), ['evening'])
    const a = projectAnswers(s)
    expect(a.wellbeingAnswers.sleepQuality).toBe('switch-off')
    expect(a.wellbeingAnswers.stressPattern).toBe('evening-wired')
  })

  it('only sends settled drivers to the engine', () => {
    // A driver at 0.1 is one half-answer. Scoring it would let a passing remark
    // move the box.
    let s = seeded()
    s = answerQuestion(s, Q('energy-when'), ['mornings'])
    const a = projectAnswers(s)
    for (const w of Object.values(a.drivers ?? {})) expect(w).toBeGreaterThanOrEqual(0.25)
  })

  it('omits drivers entirely when nothing was settled', () => {
    expect(projectAnswers(seeded()).drivers).toBeUndefined()
  })

  it('never mutates the shared blank', () => {
    const before = JSON.stringify(defaultAnswers)
    let s = seeded()
    s = answerQuestion(s, Q('safety'), ['pregnancy'])
    projectAnswers(s)
    projectAnswers(s)
    expect(JSON.stringify(defaultAnswers)).toBe(before)
  })

  it('is recomputed from scratch, so a back-step leaves nothing behind', () => {
    let s = seeded()
    s = answerQuestion(s, Q('caffeine'), ['daily-late'])
    expect(projectAnswers(s).caffeineLevel).toBe('high')

    // Re-answer the same question the other way — the old value must not survive.
    s = answerQuestion(s, Q('caffeine'), ['none'])
    expect(projectAnswers(s).caffeineLevel).toBe('none')
  })
})

describe('every option in the bank', () => {
  it('projects onto real QuizAnswers fields', () => {
    const known = new Set(Object.keys(defaultAnswers))
    for (const q of BANK) {
      for (const o of q.options) {
        for (const key of Object.keys(o.answers ?? {})) {
          expect(known.has(key)).toBe(true)
        }
      }
    }
  })

  it('has a unique id within its question, and a unique question id in the bank', () => {
    const seen = new Set<string>()
    for (const q of BANK) {
      expect(seen.has(q.id)).toBe(false)
      seen.add(q.id)
      const optIds = q.options.map((o) => o.id)
      expect(new Set(optIds).size).toBe(optIds.length)
    }
  })

  it('has a summary for the AI shortlist and copy for the screen', () => {
    for (const q of BANK) {
      expect(q.summary.length).toBeGreaterThan(10)
      expect(q.prompt.length).toBeGreaterThan(3)
      expect(q.hint.length).toBeGreaterThan(3)
    }
  })

  it('has options, unless it is a form or the goals grid', () => {
    for (const q of BANK) {
      if (q.select === 'form' || q.id === 'goals') continue
      expect(q.options.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('end to end, into the real engine', () => {
  /** Walk a whole interview taking the nth option each time. */
  function complete(goals: Parameters<typeof setGoals>[1], pick: number) {
    let s = emptyInterview(10)
    s = setTrack(s, goals.some((g) => ['muscle', 'energy', 'performance'].includes(g)) ? 'performance' : 'wellbeing')
    s = setGoals(s, goals)
    s = setForm(s, { name: 'Sam', ageBracket: '35-44', gender: 'female', weightBand: '60-75' })
    for (let guard = 0; guard < 40; guard++) {
      const { question } = planNext(s)
      if (!question) break
      const option = question.options[Math.min(pick, question.options.length - 1)]
      s = answerQuestion(s, question, option ? [option.id] : [])
    }
    return s
  }

  const PATHS: Array<Parameters<typeof setGoals>[1]> = [
    ['energy'], ['muscle'], ['sleep-better'], ['immune'], ['gut-health'],
    ['skin-hair-nails'], ['focus', 'less-stress'], ['performance', 'hydration'],
    ['menopause'], ['health'],
  ]

  it('produces a buildable stack on every path and every answer position', () => {
    for (const goals of PATHS) {
      for (const pick of [0, 1, 2, 3]) {
        const answers = projectAnswers(complete(goals, pick))
        const bp = buildStackBlueprint(answers, MOCK_CATALOGUE)
        expect(bp.slots.length).toBeGreaterThan(0)
        for (const slot of bp.slots) {
          // Every slot must resolve to a product that actually exists, or the
          // reveal shows "Product unavailable" at £0.00.
          expect(MOCK_CATALOGUE.some((p) => p.id === slot.selectedProductId)).toBe(true)
        }
      }
    }
  })

  it('never recommends a product the safety screen rules out', () => {
    let s = emptyInterview(10)
    s = setTrack(s, 'wellbeing')
    s = setGoals(s, ['sleep-better', 'less-stress'])
    s = setForm(s, { name: 'Sam', ageBracket: '35-44', gender: 'female', weightBand: '60-75' })
    s = answerQuestion(s, questionById('goals')!, [])
    s = answerQuestion(s, questionById('safety')!, ['pregnancy'])
    for (let guard = 0; guard < 40; guard++) {
      const { question } = planNext(s)
      if (!question) break
      s = answerQuestion(s, question, question.options[0] ? [question.options[0].id] : [])
    }
    const answers = projectAnswers(s)
    expect(answers.safetyFlags).toContain('pregnancy')

    const bp = buildStackBlueprint(answers, MOCK_CATALOGUE)
    for (const slot of bp.slots) {
      const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)
      expect(product?.contraindications ?? []).not.toContain('pregnancy')
    }
  })
})

describe('the bank references itself correctly', () => {
  /**
   * A `requires` naming an option id that no longer exists is the quietest bug
   * this bank can have: the predicate simply never returns true, the question
   * never fires, and nothing anywhere goes red. Renaming one caffeine option
   * during the copy pass was enough to prove the risk is real, so the
   * cross-references are checked against the bank rather than eyeballed.
   */
  const SOURCES = [
    'src/lib/quiz-v2/bank/energy.ts',
    'src/lib/quiz-v2/bank/training.ts',
    'src/lib/quiz-v2/bank/wellbeing.ts',
    'src/lib/quiz-v2/bank/nutrition.ts',
  ]

  it('every chose()/choseAny() names a real question and a real option', () => {
    const refs: Array<{ file: string; question: string; option: string }> = []
    for (const file of SOURCES) {
      const src = readFileSync(file, 'utf8')
      const re = /\bchose(?:Any)?\(\s*s\s*,\s*'([^']+)'\s*,\s*((?:'[^']+'\s*,?\s*)+)\)/g
      for (const m of src.matchAll(re)) {
        for (const opt of m[2].matchAll(/'([^']+)'/g)) {
          refs.push({ file, question: m[1], option: opt[1] })
        }
      }
    }

    // If this drops to zero the regex has stopped matching and the test is
    // silently passing on nothing.
    expect(refs.length).toBeGreaterThan(3)

    const broken = refs.filter(({ question, option }) => {
      const q = questionById(question)
      return !q || !q.options.some((o) => o.id === option)
    })
    expect(broken).toEqual([])
  })
})

describe('the questions read on their own', () => {
  /**
   * The section label above a question is 10px of 35%-white. It is decoration.
   * Several prompts were leaning on it — "YOUR HEAD" over "When is it worst?",
   * "YOUR NIGHTS" over "How are your nights?" — and only made sense if you
   * noticed and read both. The rule now is that the big text carries the whole
   * question.
   *
   * Semantics are not testable, so this covers the mechanical half and the
   * snapshot below covers the rest: every wording change becomes a diff a human
   * has to look at and accept.
   */
  const adaptive = BANK.filter((q) => !q.fixed)

  it.each(adaptive.map((q) => [q.id, q.prompt] as const))(
    '%s asks a whole question',
    (_id, prompt) => {
      expect(prompt.endsWith('?')).toBe(true)
      // "Two days after a hard session?" was 30 characters of fragment; the
      // floor is here to catch the next one, not to reward padding.
      expect(prompt.length).toBeGreaterThanOrEqual(20)
      // A prompt whose object is a bare pronoun is one leaning on the eyebrow.
      expect(prompt).not.toMatch(/\b(it|them|this|that)\s*\?$/i)
    },
  )

  it('never asks two questions with the same words', () => {
    const prompts = adaptive.map((q) => q.prompt.toLowerCase())
    expect(new Set(prompts).size).toBe(prompts.length)
  })

  it('offers a way through every multi-select screen', () => {
    // Either an explicit "none of these", or a minimum that says one is needed.
    for (const q of BANK.filter((x) => x.select === 'multi')) {
      const hasNone = q.options.some((o) => o.exclusive)
      expect(hasNone || (q.minPicks ?? 0) > 0).toBe(true)
    }
  })

  it('reads the same tomorrow as it does today', () => {
    expect(
      BANK.map((q) => ({
        id: q.id,
        section: q.section,
        prompt: q.prompt,
        hint: q.hint,
        select: q.select,
        options: q.options.map((o) => [o.id, o.label, o.sub ?? null]),
      })),
    ).toMatchSnapshot()
  })
})
