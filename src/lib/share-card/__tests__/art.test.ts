import { artKeyFor, ART_KEYS } from '../art'
import { getArchetype } from '@/lib/stack-blueprint/factory'
import { ALL_GOALS, type Goal } from '@/lib/types'

/**
 * Which of the six pictures a stack gets: by archetype, the same thing the
 * stack's name says, so a shared link reveals no more of their goals than the
 * name does, and the picture cannot contradict the name.
 */
describe('artKeyFor', () => {
  it('follows the archetype, not any one goal', () => {
    expect(artKeyFor(['health', 'performance'])).toBe('performance')
    expect(artKeyFor(['performance', 'health'])).toBe('performance')
    expect(artKeyFor(['immune', 'gut-health', 'muscle', 'sleep-better'])).toBe('strength')
  })

  it('gives goals the name does not reveal no picture of their own', () => {
    // These used to get "recovery" and "hydration" frames, which put the goal
    // into the public link.
    expect(artKeyFor(['sleep-better', 'less-stress'])).toBe('wellbeing')
    expect(artKeyFor(['hydration'])).toBe('wellbeing')
  })

  it('falls back to wellbeing when there are no goals', () => {
    expect(artKeyFor([])).toBe('wellbeing')
  })

  it('is the same for every goal set with the same archetype', () => {
    const byArchetype = new Map<string, string>()
    for (const sets of goalSets(ALL_GOALS, 3)) {
      const archetype = getArchetype(sets)
      const art = artKeyFor(sets)
      expect(ART_KEYS).toContain(art)
      expect(byArchetype.get(archetype) ?? art).toBe(art)
      byArchetype.set(archetype, art)
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
