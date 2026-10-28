import { writeFileSync } from 'fs'
import { eligiblePatterns, leads } from '../leads'
import { PATTERNS } from '../library'
import { LIMITS } from '../choose'
import { DRAWN_EVIDENCE_LIVE, drawnAnswers, drawnMode, previewDrawn, type DrawnMode } from '../drawn'
import { CORE, personFor, simulate, truthFor, type JourneyKey, type Run } from './simulate'
import { withCurve } from './drawn-people'
import { PRESET_POINTS } from '../../day-curve'
import type { ConsultAnswers } from '../../types'
import type { PatternId } from '../types'

/**
 * Shape your day as Pinpoint evidence: a proposal, off (plan Phase 7.4).
 *
 * The 20 Questions people from `twenty-questions.test.ts`, the same seeds,
 * now with the day they'd draw. Off, the curve changes nothing. On, either
 * way it's proposed, every 20 Questions check still holds. `DRAWN_REPORT=1`
 * writes the before-and-after table for `docs/shape-your-day-proposal.md`.
 */

const JOURNEYS = Object.keys(CORE) as JourneyKey[]
/** The 20 Questions test's own people, and three times as many: at 20 each, one lucky seed moves a case by 5%. */
const SEEDS = 20
const MORE = 60

interface Case {
  journey: JourneyKey
  main: PatternId
  people: { person: ConsultAnswers; seed: number }[]
}

function casesFor(curves: boolean, seeds: number): Case[] {
  const out: Case[] = []
  for (const journey of JOURNEYS) {
    for (const { id } of PATTERNS) {
      const person = personFor(journey, [id])
      if (!eligiblePatterns(person).some((p) => p.id === id)) continue
      const people = Array.from({ length: seeds }, (_, i) => {
        const seed = (i + 1) * 7919 + id.length
        return { person: curves ? withCurve(person, truthFor([id]), seed * 31) : person, seed }
      })
      out.push({ journey, main: id, people })
    }
  }
  return out
}

interface Report {
  found: number
  worst: { name: string; hit: number }
  under7: string[]
  median: number
  mean: number
  wrong: number
  falsePins: number
  nothingMax: number
  byPattern: Record<string, number>
  hits: Record<string, number>
  runs: Run[][]
}

function measure(cases: Case[], curves: boolean, mode: DrawnMode): Report {
  const n = cases[0].people.length
  previewDrawn(mode)
  try {
    const runs = cases.map((c) => c.people.map(({ person, seed }) => simulate(person, truthFor([c.main]), seed)))
    const all = runs.flat()
    const hits = cases.map((c, i) => runs[i].filter((r) => (r.confirmedAt[c.main] ?? Infinity) <= 12).length)
    const counts = all.map((r) => r.asked.length).sort((a, b) => a - b)
    const byPattern: Record<string, number[]> = {}
    cases.forEach((c, i) => runs[i].forEach((r) => r.confirmedAt[c.main] !== undefined && (byPattern[c.main] ??= []).push(r.confirmedAt[c.main]!)))
    const worstIndex = hits.indexOf(Math.min(...hits))
    let nothingMax = 0
    for (const journey of JOURNEYS) {
      for (let seed = 1; seed <= 10; seed++) {
        const base = personFor(journey, [])
        const r = simulate(curves ? withCurve(base, [], seed * 104729 * 31) : base, [], seed * 104729)
        if (Object.keys(r.confirmedAt).length) nothingMax = Infinity
        nothingMax = Math.max(nothingMax, r.asked.length)
      }
    }
    return {
      found: hits.reduce((s, h) => s + h, 0) / (cases.length * n),
      worst: { name: `${cases[worstIndex].journey}/${cases[worstIndex].main}`, hit: hits[worstIndex] / n },
      under7: cases.filter((_, i) => hits[i] < n * 0.7).map((c) => `${c.journey}/${c.main}`),
      median: counts[Math.floor(counts.length / 2)],
      mean: counts.reduce((s, n) => s + n, 0) / counts.length,
      wrong: all.reduce((s, r) => s + r.hunches.filter((h) => !h.true).length, 0) / all.length,
      falsePins: cases.reduce((s, c, i) => s + runs[i].filter((r) => Object.keys(r.confirmedAt).some((id) => !truthFor([c.main]).includes(id as PatternId))).length, 0),
      nothingMax,
      hits: Object.fromEntries(cases.map((c, i) => [`${c.journey}/${c.main}`, hits[i]])),
      byPattern: Object.fromEntries(Object.entries(byPattern).map(([id, ns]) => [id, ns.reduce((s, n) => s + n, 0) / ns.length])),
      runs,
    }
  } finally {
    previewDrawn(null)
  }
}

const before = measure(casesFor(false, SEEDS), false, 'off')
const off = measure(casesFor(true, SEEDS), true, 'off')
const beforeMore = measure(casesFor(false, MORE), false, 'off')
const addMore = measure(casesFor(true, MORE), true, 'add')

describe('Shape your day as Pinpoint evidence (proposal, off)', () => {
  it('is off: nothing to sign off has gone live', () => {
    expect(DRAWN_EVIDENCE_LIVE).toBe(false)
    expect(drawnMode()).toBe('off')
  })

  it('off, a drawn day changes nothing: the same questions, the same leads', () => {
    expect(off.runs.map((rs) => rs.map((r) => r.asked))).toEqual(before.runs.map((rs) => rs.map((r) => r.asked)))
    const person = withCurve(personFor('everyday', ['crash']), ['crash'], 1)
    expect(leads(person)).toEqual(leads({ ...person, energyCurve: null }))
  })

  it('reads the shapes as the presets mean them', () => {
    const read = (k: keyof typeof PRESET_POINTS) => drawnAnswers({ ...personFor('everyday', []), energyCurve: { points: PRESET_POINTS[k], how: 'preset', preset: k } })?.answer
    expect(read('dip-3pm')).toEqual({ dip: 'deep', morning: 'fine', evening: 'flat' })
    expect(read('slow-starter')).toEqual({ dip: 'none', morning: 'slow', evening: 'flat' })
    // The second wind comes after an afternoon lull, so it reads as a small dip too.
    expect(read('second-wind')).toEqual({ dip: 'some', morning: 'fine', evening: 'rise' })
    expect(read('steady')).toEqual({ dip: 'none', morning: 'fine', evening: 'flat' })
  })

  it('on, drawn evidence counts as an answer, never as one mainly about a pattern', () => {
    previewDrawn('add')
    try {
      const person = { ...personFor('everyday', []), energyCurve: { points: PRESET_POINTS['dip-3pm'], how: 'preset' as const, preset: 'dip-3pm' as const } }
      const crash = leads(person).find((l) => l.pattern.id === 'crash')!
      expect(crash.support).toContainEqual({ text: 'Your day drops sharply around 4pm', from: 'answer', direct: false, drawn: true })
      expect(crash.tested).toBe(0)
    } finally {
      previewDrawn(null)
    }
  })

  it('on, as proposed ("add"), it finds more, sooner, with fewer wrong guesses, and pins nothing wrongly', () => {
    expect(addMore.found).toBeGreaterThanOrEqual(beforeMore.found)
    expect(addMore.worst.hit).toBeGreaterThanOrEqual(beforeMore.worst.hit)
    expect(addMore.mean).toBeLessThan(beforeMore.mean)
    expect(addMore.median).toBeLessThanOrEqual(10)
    expect(addMore.wrong).toBeLessThan(beforeMore.wrong)
    expect(addMore.falsePins).toBe(0)
    expect(addMore.nothingMax).toBeLessThanOrEqual(12)
    for (const runs of addMore.runs) for (const run of runs) expect(run.asked.length).toBeLessThanOrEqual(LIMITS.questions)
  })

  if (process.env.DRAWN_REPORT) {
    it('writes the report', () => {
      const add = measure(casesFor(true, SEEDS), true, 'add')
      const replace = measure(casesFor(true, SEEDS), true, 'replace')
      const replaceMore = measure(casesFor(true, MORE), true, 'replace')
      const pct = (n: number) => `${Math.round(n * 1000) / 10}%`
      const row = (name: string, r: Report) =>
        `| ${name} | ${pct(r.found)} | ${pct(r.worst.hit)} (${r.worst.name}) | ${r.median} | ${r.mean.toFixed(2)} | ${r.wrong.toFixed(3)} | ${r.falsePins} | ${r.nothingMax} |`
      const lines = [
        '| | Found within 12 | Worst case | Median questions | Mean questions | Wrong guesses a consult | Pinned wrongly | Nothing going on: most questions |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        row(`Before: \`twenty-questions.test.ts\` today (${SEEDS} each)`, before),
        row('Drawn day, evidence off (as built)', off),
        row('Drawn day, evidence on: add', add),
        row('Drawn day, evidence on: replace', replace),
        row(`Before, ${MORE} each`, beforeMore),
        row(`Add, ${MORE} each`, addMore),
        row(`Replace, ${MORE} each`, replaceMore),
        '',
        `| Pattern: mean questions to confirm (${MORE} each) | Before | Add | Replace |`,
        '| --- | --- | --- | --- |',
        ...Object.keys(beforeMore.byPattern).sort().map((id) => `| ${id} | ${beforeMore.byPattern[id]?.toFixed(2)} | ${addMore.byPattern[id]?.toFixed(2)} | ${replaceMore.byPattern[id]?.toFixed(2)} |`),
        '',
        `| Case: found within 12, of ${MORE} | Before | Add | Replace |`,
        '| --- | --- | --- | --- |',
        ...Object.keys(beforeMore.hits).map((k) => `| ${k} | ${beforeMore.hits[k]} | ${addMore.hits[k]} | ${replaceMore.hits[k]} |`),
      ]
      writeFileSync(process.env.DRAWN_REPORT!, lines.join('\n') + '\n')
    })
  }
})
