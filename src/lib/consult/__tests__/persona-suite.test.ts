import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { stopReason } from '../circuit'
import { runStackEngine } from '../engine'
import { buildHandoff, validateHandoff } from '../handoff'
import { ingredientsOf } from '../knowledge'
import { chargeProfile } from '../profile'
import { APPROVED_FINGERPRINT, PERSONAS, type Expectation, type Persona } from '../personas'
import { COPY_MODEL, COPY_SYSTEM_PROMPT } from '../ai/copy'
import { UNDERSTAND_SYSTEM_PROMPT } from '../ai/understand'
import { EXPLAIN_SYSTEM_PROMPT } from '../ai/explain'

/**
 * The persona suite (build V9). See `personas.ts`. `npm run test:personas`.
 */

const byId = new Map(MOCK_CATALOGUE.map((p) => [p.id, p]))

/** FNV-1a over every prompt and the model id. */
export function promptFingerprint(): string {
  let h = 0x811c9dc5
  for (const ch of [COPY_MODEL, COPY_SYSTEM_PROMPT, UNDERSTAND_SYSTEM_PROMPT, EXPLAIN_SYSTEM_PROMPT].join('\u0000')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function check(p: Persona, e: Expectation): string[] {
  const failures: string[] = []
  const stop = stopReason(p.answers)
  if (e.stops) {
    if (stop !== e.stops) failures.push(`should stop (${e.stops}), got ${stop ?? 'a stack'}`)
    return failures
  }
  if (stop) return [`stopped (${stop}) but shouldn't have`]

  const engine = runStackEngine(p.answers, MOCK_CATALOGUE)
  const payload = buildHandoff({ consultId: `c_${p.id}persona`, route: p.answers.route ?? 'deep', goals: p.answers.goals, profile: chargeProfile(p.answers), engine })
  const valid = validateHandoff(payload)
  if (!valid.ok) failures.push(`invalid payload: ${valid.errors.join('; ')}`)
  const products = payload.tiers.complete.map((id) => byId.get(id)!)
  if (products.length === 0) failures.push('empty stack')

  for (const i of e.neverContains ?? []) {
    const bad = products.filter((x) => ingredientsOf(x).has(i))
    if (bad.length) failures.push(`contains ${i}: ${bad.map((b) => b.id).join(', ')}`)
    if (!payload.excluded.includes(i) && e.neverContains) {
      // Excluded families travel in the payload so extras honour them too (H9).
      if (!['stimulant', 'caffeine'].includes(i) || !payload.excluded.includes('caffeine')) failures.push(`payload doesn't carry ${i} as excluded`)
    }
  }
  if (e.pharmacistNote !== undefined && payload.flags.pharmacist_note !== e.pharmacistNote) failures.push(`pharmacist note should be ${e.pharmacistNote}`)
  if (e.includesGroup && !products.some((x) => e.includesGroup!.includes(x.swapGroup))) failures.push(`missing one of ${e.includesGroup.join('/')}`)
  for (const g of e.excludesGroup ?? []) if (products.some((x) => x.swapGroup === g)) failures.push(`includes ${g}`)
  if (e.veganOnly) for (const x of products) if (!x.dietaryTags.includes('vegan')) failures.push(`not vegan: ${x.id}`)
  if (e.maxCaffeineSources !== undefined) {
    const n = products.filter((x) => ingredientsOf(x).has('caffeine')).length
    if (n > e.maxCaffeineSources) failures.push(`${n} caffeine sources`)
  }
  return failures
}

describe('the persona suite', () => {
  it('has 25 personas', () => {
    expect(PERSONAS).toHaveLength(25)
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(25)
  })

  describe.each(PERSONAS.map((p) => [p.id, p.who, p] as const))('%s %s', (_id, _who, p) => {
    const safety = p.expect.filter((e) => e.safety)
    const quality = p.expect.filter((e) => !e.safety)
    if (safety.length) {
      it('passes every safety expectation (a failure blocks the release)', () => {
        expect(safety.flatMap((e) => check(p, e))).toEqual([])
      })
    }
    if (quality.length) {
      it('gets a stack that answers the brief', () => {
        expect(quality.flatMap((e) => check(p, e))).toEqual([])
      })
    }
  })

  it('was last run against these prompts and this model', () => {
    // A prompt or model changed. Run `npm run test:personas`, read the result,
    // then set APPROVED_FINGERPRINT in personas.ts to the value below.
    expect(promptFingerprint()).toBe(APPROVED_FINGERPRINT)
  })
})
