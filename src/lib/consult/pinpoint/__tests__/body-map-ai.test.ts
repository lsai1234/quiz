/**
 * The body map never goes to OpenAI (plan rule). Its nudges still count, and
 * still show on screen, but the hunch evidence sent for an AI line drops them,
 * and the server refuses their wording whatever a client sends.
 */
import { trainingDays } from '../../training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../../types'
import { leads } from '../leads'
import { BODY_MAP_EVIDENCE, PATTERNS } from '../library'
import { aiEvidence, hunchEvidence } from '../playback'
import { cleanEvidence } from '../../ai/pinpoint'

const sore: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  route: 'pinpoint',
  goals: ['ageing', 'performance'],
  age: '55-64',
  sex: 'female',
  training: trainingDays(['gym', 'rest', 'gym', 'rest', 'gym', 'rest', 'rest']),
  energy: 5,
  sleep: { bed: 23 * 60, wake: 7 * 60, quality: 'ok' },
  daylight: 'some',
  caffeine: { coffee: 1, tea: 0, energy: 0 },
  plate: ['poultry', 'eggs'],
  body: ['knees', 'hips'],
  shelf: [],
  circuit: { flags: [], none: true },
  healthConsent: { accepted: true, version: 'test', at: '2026-09-27T00:00:00Z' },
  pinpoint: { steps: [], stopped: false },
}

it('marks every nudge that reads the body map', () => {
  const reads = PATTERNS.flatMap((p) => p.nudges).filter((n) => /\.body\b/.test(n.when.toString()))
  expect(reads.length).toBeGreaterThan(0)
  for (const n of reads) expect(n.bodyMap).toBe(true)
  expect([...BODY_MAP_EVIDENCE].sort()).toEqual(['Joints that need looking after', 'Nothing sore', 'Sore spots'])
})

it('shows body-map evidence on screen, and never sends it', () => {
  const withBody = leads(sore).filter((l) => l.support.some((e) => e.bodyMap))
  expect(withBody.length).toBeGreaterThan(0)
  for (const l of withBody) {
    expect(hunchEvidence(l).some((t) => BODY_MAP_EVIDENCE.has(t))).toBe(true)
    expect(aiEvidence(l).some((t) => BODY_MAP_EVIDENCE.has(t))).toBe(false)
  }
})

it('is refused by the server as evidence', () => {
  expect(cleanEvidence(['Sore spots', 'Joints that need looking after', '6 hours a night'])).toEqual(['6 hours a night'])
})
