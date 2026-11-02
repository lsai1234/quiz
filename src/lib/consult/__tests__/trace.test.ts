/**
 * @jest-environment jsdom
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { CLAIMS } from '../claims'
import { runStackEngine } from '../engine'
import { initialFlow } from '../flow'
import { PERSONAS } from '../personas'
import { stopReason } from '../circuit'
import { prepareResults } from '../results'
import { personFor } from '../pinpoint/__tests__/simulate'
import { buildTraces, loadTrace, saveTraces } from '../trace'
import { TRACE_COPY } from '../trace-copy'
import { GOAL_LABEL } from '../summary'
import type { ConsultAnswers } from '../types'

/** Trace it back (plan Phase 8): the path from a product to the answers that put it there. */
const WORDINGS = new Set(Object.values(CLAIMS).map((c) => c.wording))
const live = PERSONAS.filter((p) => !stopReason(p.answers))
const wired: ConsultAnswers = {
  ...personFor('everyday', ['wired', 'crash']),
  circuit: { flags: [], none: true },
  healthConsent: { accepted: true, version: 't', at: 't' },
  pinpoint: { started: true, stopped: false, steps: [{ kind: 'verdict', pattern: 'wired', verdict: 'yes', stage: 'pinpoint' }, { kind: 'verdict', pattern: 'crash', verdict: 'yes', stage: 'pinpoint' }] },
}

const cases = [...live.map((p) => [p.id, p.answers] as const), ['wired and crash', wired] as const]

describe.each(cases)('%s', (_, answers) => {
  const engine = runStackEngine(answers, MOCK_CATALOGUE)
  const traces = buildTraces(answers, engine, MOCK_CATALOGUE)

  it('has a trace for the products the consult picked, and only those', () => {
    for (const id of Object.keys(traces)) expect(engine.tiers.complete).toContain(id)
  })

  it('names a step only with its approved claim; anything else is "From your answers"', () => {
    for (const t of Object.values(traces)) {
      for (const s of t.steps) {
        if (s.kind === 'answers') {
          expect(s.label).toBe(TRACE_COPY.fromYourAnswers)
          expect(s.claim).toBeNull()
        } else {
          expect(s.claim).not.toBeNull()
          expect(WORDINGS.has(s.claim!)).toBe(true)
        }
      }
    }
  })

  it('never puts a goal line beside a product its map doesn’t back', () => {
    const goalLine = (t: string) => Object.values(GOAL_LABEL).some((g) => t === `${g} is your top goal` || t === `${g} is one of your goals`)
    for (const t of Object.values(traces)) for (const s of t.steps) if (s.kind !== 'goal') for (const a of s.answers) expect(goalLine(a.text)).toBe(false)
  })

  it('weighs steps and answers against the heaviest, 0 to 1, heaviest first', () => {
    for (const t of Object.values(traces)) {
      expect(t.steps[0].weight).toBe(1)
      for (const s of t.steps) expect(s.weight).toBeGreaterThan(0)
      for (let i = 1; i < t.steps.length; i++) expect(t.steps[i].weight).toBeLessThanOrEqual(t.steps[i - 1].weight)
      for (const s of t.steps) for (const a of s.answers) expect(a.weight).toBeGreaterThanOrEqual(0)
    }
  })
})

it('traces a pattern Pinpoint confirmed back to their own answers, where the map backs it', () => {
  const engine = runStackEngine(wired, MOCK_CATALOGUE)
  const steps = Object.values(buildTraces(wired, engine, MOCK_CATALOGUE)).flatMap((t) => t.steps)
  const pattern = steps.find((s) => s.kind === 'pattern')
  if (pattern) expect(pattern.answers.length).toBeGreaterThan(0)
  expect(steps.some((s) => s.kind !== 'answers')).toBe(true)
})

describe('kept in this tab only', () => {
  it('is in the bundle and session storage, never in the handoff saved to the server', () => {
    const state = { ...initialFlow('c_provenance1', 0, wired), phase: 'analysis' as const, sceneId: 'circuit' as const }
    const bundle = prepareResults(state, MOCK_CATALOGUE, new Date('2026-11-02T10:00:00Z'))
    expect(Object.keys(bundle.traces).length).toBeGreaterThan(0)
    const payload = JSON.stringify(bundle.payload)
    expect(payload).not.toMatch(/trace/i)
    expect(payload).not.toContain(TRACE_COPY.fromYourAnswers)
    saveTraces('c_provenance1', bundle.traces)
    const id = Object.keys(bundle.traces)[0]
    expect(loadTrace('c_provenance1', id)).toEqual(bundle.traces[id])
    expect(loadTrace('c_someone_else', id)).toBeNull()
    expect(localStorage.getItem('chrgd-consult-traces')).toBeNull()
  })
})
