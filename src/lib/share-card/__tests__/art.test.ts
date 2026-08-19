import { pickArtKey, ART_KEYS } from '../art'
import { getArchetype } from '@/lib/stack-blueprint/factory'
import { ALL_GOALS, type Goal } from '@/lib/types'

/**
 * Which of the six pictures a stack gets.
 *
 * The rule these tests hold to is that the picture and the kicker are two
 * readings of one goal set, not two independent ones. That is not a style
 * preference: both are printed on the same card, so a disagreement between them
 * is a card contradicting itself in public — the report that started this said
 * THE PERFORMANCE ATHLETE over the wellbeing frame.
 */
describe('pickArtKey', () => {
  it('ranks the goal set rather than taking the first goal tapped', () => {
    // The order these arrive in is tap order — `setGoals` appends, and the
    // goals step lists the performance block above the wellness one, so
    // "General health" first is an ordinary thing to do rather than a statement
    // that health matters most.
    expect(pickArtKey(['health', 'performance'])).toBe('performance')
    expect(pickArtKey(['performance', 'health'])).toBe('performance')

    // And the ranking is a ranking, not a preference for whatever is louder in
    // the list: one strength goal among four wellness ones still takes it.
    expect(pickArtKey(['immune', 'gut-health', 'muscle', 'sleep-better'])).toBe('strength')
  })

  it('gives the same card to the same goals whichever way they were tapped', () => {
    const goals: Goal[] = ['energy', 'recovery', 'hydration', 'health']
    const first = pickArtKey(goals)
    for (let i = 1; i < goals.length; i += 1) {
      expect(pickArtKey([...goals.slice(i), ...goals.slice(0, i)])).toBe(first)
    }
  })

  it('gives an LQD package the hydration frame whatever it is for', () => {
    expect(pickArtKey(['muscle', 'performance'], true)).toBe('hydration')
    expect(pickArtKey([], true)).toBe('hydration')
  })

  it('falls back to wellbeing when there are no goals', () => {
    expect(pickArtKey([])).toBe('wellbeing')
  })

  it('only ever returns a family that has art', () => {
    for (const goal of ALL_GOALS) expect(ART_KEYS).toContain(pickArtKey([goal]))
  })

  /**
   * The invariant the ranking exists to keep, over every goal set of up to
   * three — which is what the quiz produces in practice.
   *
   * Stated as what each archetype may be pictured as rather than as a mapping,
   * because the two rules are not the same shape: `getArchetype` has five
   * outcomes and no picture for hydration or recovery, and it reads `focus` as
   * an everyday-wellness goal where the art set has an image that is exactly
   * what focus looks like. What must never happen is the card disagreeing with
   * itself about what kind of stack this is.
   */
  it('never contradicts the archetype printed beside it', () => {
    const allowed: Record<string, string[]> = {
      muscle: ['strength'],
      'fat-loss': ['performance'],
      performance: ['performance', 'energy'],
      // The two everyday archetypes may take any of the pictures that are not
      // about training. `focus` is why energy is in here: the quiz files it
      // under everyday wellness, and the energy frame — electric, abstract — is
      // still the honest picture of it.
      health: ['wellbeing', 'recovery', 'hydration', 'energy'],
      wellbeing: ['wellbeing', 'recovery', 'hydration', 'energy'],
    }

    for (const sets of goalSets(ALL_GOALS, 3)) {
      const archetype = getArchetype(sets)
      expect({ goals: sets, archetype, art: pickArtKey(sets) }).toEqual({
        goals: sets,
        archetype,
        art: expect.stringMatching(new RegExp(`^(${allowed[archetype].join('|')})$`)),
      })
    }
  })
})

/** Every combination of up to `max` goals. */
function goalSets(goals: Goal[], max: number): Goal[][] {
  const out: Goal[][] = []
  const walk = (from: number, taken: Goal[]) => {
    if (taken.length > 0) out.push(taken)
    if (taken.length === max) return
    for (let i = from; i < goals.length; i += 1) walk(i + 1, [...taken, goals[i]])
  }
  walk(0, [])
  return out
}
