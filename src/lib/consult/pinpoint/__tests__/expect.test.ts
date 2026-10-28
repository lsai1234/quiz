import { eligiblePatterns, leads } from '../leads'
import { PATTERNS } from '../library'
import { expectedQuestions } from '../expect'
import { CORE, personFor, simulate, truthFor, type JourneyKey } from './simulate'

/**
 * The invite's "About {n} quick questions" (plan Phase 6): the model's own
 * expectation, checked against the simulated people of the 20 Questions test,
 * from the moment the invite is shown (the core answers, no Pinpoint yet).
 */
describe('expectedQuestions', () => {
  const rows: { said: number; took: number }[] = []
  for (const journey of Object.keys(CORE) as JourneyKey[]) {
    for (const { id } of PATTERNS) {
      const person = personFor(journey, [id])
      if (!eligiblePatterns(person).some((p) => p.id === id)) continue
      // Only people the invite is shown to: a lead at even odds.
      if (Math.max(...leads(person).map((l) => l.p)) < 0.5) continue
      const said = expectedQuestions({ ...person, route: 'deep', pinpoint: null })
      for (let seed = 1; seed <= 10; seed++) {
        const run = simulate(person, truthFor([id]), seed * 7919 + id.length)
        rows.push({ said, took: run.asked.length + run.hunches.length })
      }
    }
  }

  it('is near enough unbiased: off by less than a question on average', () => {
    const bias = rows.reduce((s, r) => s + r.said - r.took, 0) / rows.length
    expect(rows.length).toBeGreaterThan(100)
    expect(Math.abs(bias)).toBeLessThan(1)
  })

  it('is within two questions for most people', () => {
    expect(rows.filter((r) => Math.abs(r.said - r.took) <= 2).length / rows.length).toBeGreaterThanOrEqual(0.7)
  })

  it('is deterministic, and at least one', () => {
    const a = { ...personFor('everyday', ['wired']), route: 'deep' as const, pinpoint: null }
    expect(expectedQuestions(a)).toBe(expectedQuestions(a))
    expect(expectedQuestions(a)).toBeGreaterThanOrEqual(1)
  })
})
