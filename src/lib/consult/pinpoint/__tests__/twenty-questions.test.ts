import { eligiblePatterns } from '../leads'
import { PATTERNS } from '../library'
import { LIMITS } from '../choose'
import { CORE, personFor, simulate, truthFor, type JourneyKey, type Run } from './simulate'
import type { PatternId } from '../types'

/**
 * The 20 Questions test (plan v5 §10.5): simulated people with hidden
 * patterns, answering as those patterns predict with one answer in ten at
 * random. Pinpoint has to find their main pattern within 12 questions at
 * least 9 times in 10, across every journey and every pattern it can find.
 */

const JOURNEYS = Object.keys(CORE) as JourneyKey[]
const SEEDS = 20

interface Case {
  journey: JourneyKey
  main: PatternId
  runs: Run[]
}

const cases: Case[] = []
for (const journey of JOURNEYS) {
  for (const { id } of PATTERNS) {
    const person = personFor(journey, [id])
    if (!eligiblePatterns(person).some((p) => p.id === id)) continue
    const runs = Array.from({ length: SEEDS }, (_, i) => simulate(person, truthFor([id]), (i + 1) * 7919 + id.length))
    cases.push({ journey, main: id, runs })
  }
}
const runs = cases.flatMap((c) => c.runs)

describe('the 20 Questions test', () => {
  it('covers every journey and every pattern', () => {
    for (const j of JOURNEYS) expect(cases.filter((c) => c.journey === j).length).toBeGreaterThanOrEqual(6)
    for (const { id } of PATTERNS) expect(cases.some((c) => c.main === id)).toBe(true)
  })

  it('finds the main pattern within 12 questions at least 9 times in 10', () => {
    const found = cases.flatMap((c) => c.runs.map((r) => (r.confirmedAt[c.main] ?? Infinity) <= 12))
    expect(found.filter(Boolean).length / found.length).toBeGreaterThanOrEqual(0.9)
  })

  it('finds every pattern at least 7 times in 10, wherever it can come up', () => {
    for (const c of cases) {
      const hit = c.runs.filter((r) => (r.confirmedAt[c.main] ?? Infinity) <= 12).length
      expect([`${c.journey}/${c.main}`, hit >= SEEDS * 0.7]).toEqual([`${c.journey}/${c.main}`, true])
    }
  })

  it('never goes past 20 questions, and never asks the same thing twice', () => {
    for (const r of runs) {
      expect(r.asked.length).toBeLessThanOrEqual(LIMITS.questions)
      expect(new Set(r.asked).size).toBe(r.asked.length)
    }
  })

  it('usually needs far fewer: a median of 10 or less', () => {
    const counts = runs.map((r) => r.asked.length).sort((a, b) => a - b)
    expect(counts[Math.floor(counts.length / 2)]).toBeLessThanOrEqual(10)
  })

  it('never pinpoints anything the person didn’t confirm', () => {
    for (const c of cases) {
      const truth = new Set(truthFor([c.main]))
      for (const r of c.runs) for (const id of Object.keys(r.confirmedAt)) expect(truth.has(id as PatternId)).toBe(true)
    }
  })

  it('keeps wrong guesses down: well under one "Not me" a consult', () => {
    const wrong = runs.reduce((s, r) => s + r.hunches.filter((h) => !h.true).length, 0)
    expect(wrong / runs.length).toBeLessThan(0.6)
  })

  it('lets someone with nothing going on finish quickly, with nothing pinpointed', () => {
    for (const journey of JOURNEYS) {
      for (let seed = 1; seed <= 10; seed++) {
        const r = simulate(personFor(journey, []), [], seed * 104729)
        expect(Object.keys(r.confirmedAt)).toEqual([])
        expect(r.asked.length).toBeLessThanOrEqual(12)
      }
    }
  })

  it('is deterministic: the same person gives the same run', () => {
    const person = personFor('everyday', ['wired'])
    const a = simulate(person, truthFor(['wired']), 42)
    const b = simulate(person, truthFor(['wired']), 42)
    expect(a.asked).toEqual(b.asked)
    expect(a.answers.pinpoint).toEqual(b.answers.pinpoint)
  })
})
