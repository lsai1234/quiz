import { NUTRITION_QUESTIONS } from '@/lib/quiz-v2/bank/nutrition'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { isAnswered, visibleScenes } from '../flow'
import { breakfastGrams, habitsFor } from '../habits'
import { runStackEngine, scoreNeeds } from '../engine'
import { leads } from '../pinpoint/leads'
import { aiEvidence } from '../pinpoint/playback'
import { CORE } from '../pinpoint/__tests__/simulate'
import { DAY_OPTIONS, MEAL_OPTIONS, consultProteinTarget, measuredProtein, proteinBasis, proteinEvidence, proteinIntake, proteinVerdictLine, type ProteinAnswer } from '../protein'
import { trainingDays } from '../training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../types'

/** The protein check in the consult (Phase 5 proposal 2, approved 2026-10-28). */

const day = (pick: string, weight: ProteinAnswer['weight'] = '75-90'): ProteinAnswer => ({ weight, door: 'day', picks: [pick], portions: 'average' })
/** A builder in the gym three days a week: 'lifting', so 82kg gives 130–180g. */
const BUILDER: ConsultAnswers = { ...EMPTY_ANSWERS, route: 'deep', comfortOffered: true, ...CORE.builder } as ConsultAnswers
const SHORT = { ...BUILDER, protein: day('day-light') }
const PLENTY = { ...BUILDER, protein: day('day-high') }
const ASKED = { ...BUILDER, protein: { weight: '75-90' as const, door: 'ask' as const, picks: [], portions: 'average' as const } }
const lead = (a: ConsultAnswers) => leads(a).find((l) => l.pattern.id === 'protein-gap')!

describe('the protein check: the sums', () => {
  it('uses v2’s options and grams, unchanged', () => {
    const v2 = NUTRITION_QUESTIONS.find((q) => q.id === 'protein-check')!.options as { id: string; grams?: number; meal?: string }[]
    for (const o of [...DAY_OPTIONS, ...MEAL_OPTIONS]) {
      const theirs = v2.find((x) => x.id === o.id)!
      expect([o.id, o.grams, o.meal]).toEqual([o.id, theirs.grams, theirs.meal])
    }
  })

  it('puts a number on it only with a weight and an estimate', () => {
    expect(consultProteinTarget({ ...BUILDER, protein: day('day-light', null) })).toBeNull()
    expect(measuredProtein({ ...BUILDER, protein: day('day-light', null) })).toBeNull()
    expect(measuredProtein(ASKED)).toBeNull()
    expect(proteinBasis(BUILDER)).toBe('lifting')
    expect(measuredProtein(SHORT)).toMatchObject({ intakeG: 55, target: { lowG: 130, highG: 180 }, gapG: 75, verdict: 'big-gap' })
    expect(measuredProtein(PLENTY)!.verdict).toBe('on-target')
  })

  it('counts a day meal by meal, portions included, and only once all four are in', () => {
    const counted: ProteinAnswer = { weight: '75-90', door: 'count', picks: ['b-protein', 'l-protein', 'd-protein'], portions: 'bigger' }
    expect(proteinIntake(counted)).toBeNull()
    expect(isAnswered('protein', { ...BUILDER, protein: counted })).toBe(false)
    const full = { ...counted, picks: [...counted.picks, 's-light'] }
    expect(proteinIntake(full)).toBe(130) // (25 + 35 + 40 + 10) × 1.2, to the nearest 5
    expect(isAnswered('protein', { ...BUILDER, protein: full })).toBe(true)
  })

  it('is on Deep and Pinpoint, never on a Speed run', () => {
    expect(visibleScenes({ ...BUILDER, route: 'deep' })).toContain('protein')
    expect(visibleScenes({ ...BUILDER, route: 'pinpoint' })).toContain('protein')
    expect(visibleScenes({ ...BUILDER, route: 'speed' })).not.toContain('protein')
  })

  it('says a number and where it sits, never a product or a finding', () => {
    for (const a of [SHORT, PLENTY, { ...BUILDER, protein: day('day-decent') }, { ...BUILDER, goals: ['allround' as const], training: trainingDays(['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']), aim: null, protein: day('day-high') }]) {
      const v = proteinVerdictLine(measuredProtein(a)!)
      expect(`${v.headline} ${v.detail}`).not.toMatch(/\b(shake|scoop|box|whey|supplement|deficien|low|poor|need)\b/i)
    }
  })
})

describe('the protein check: what it feeds', () => {
  it('points protein-gap strongly towards on a measured gap, away on a met target, and not at all for "just ask me"', () => {
    const none = lead({ ...BUILDER, protein: null }).p
    expect(lead(SHORT).p).toBeGreaterThan(none + 0.2)
    expect(lead(PLENTY).p).toBeLessThan(none)
    expect(lead(ASKED).p).toBeCloseTo(none)
    expect(lead(SHORT).support.map((e) => e.text)).toContain(proteinEvidence(measuredProtein(SHORT)!))
  })

  it('lets a measurement outweigh the plate’s guess', () => {
    const fewFoods = { ...BUILDER, plate: ['wholegrains', 'fruit'] as ConsultAnswers['plate'] }
    expect(lead({ ...fewFoods, protein: null }).support.map((e) => e.text)).toContain('Few protein foods most weeks')
    expect(lead({ ...fewFoods, protein: day('day-high') }).support.map((e) => e.text)).not.toContain('Few protein foods most weeks')
  })

  it('never sends the estimate to the AI', () => {
    const l = { ...lead(SHORT), state: 'live' as const }
    expect(aiEvidence(l).join(' ')).not.toMatch(/g a day/)
  })

  it('gives the protein need their gap as its source', () => {
    expect(scoreNeeds(SHORT).protein.sources.map((s) => s.why)).toContain('About 55g a day against a 130g target')
    expect(scoreNeeds(PLENTY).protein.sources.map((s) => s.why).join(' ')).not.toMatch(/g a day/)
    // And it reaches the stack: a protein, with that line as its reason.
    const engine = runStackEngine({ ...SHORT, healthConsent: { accepted: true, version: 'x', at: 'x' }, circuit: { flags: [], none: true } }, MOCK_CATALOGUE)
    expect(engine.ranked.find((p) => p.reason === 'About 55g a day against a 130g target')).toBeDefined()
  })

  it('sizes the protein-breakfast fix to their gap, between 15g and 40g', () => {
    expect(breakfastGrams(BUILDER)).toBe(25)
    expect(breakfastGrams(SHORT)).toBe(40)
    expect(breakfastGrams({ ...BUILDER, protein: day('day-decent') })).toBe(25) // 105 against 130
    const fix = habitsFor(SHORT, []).find((h) => h.id === 'protein-breakfast')
    if (fix) expect(fix.text).toMatch(/^Put about 40g of protein in your breakfast/)
  })
})
