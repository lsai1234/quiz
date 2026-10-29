import { PULSE_FROM, constellation, constellationText, narrowing, narrowingText, pulses, splits } from '../constellation'
import { eligiblePatterns, leads } from '../pinpoint/leads'
import { PROBE_BY_ID } from '../pinpoint/library'
import { personFor } from '../pinpoint/__tests__/simulate'
import type { ConsultAnswers } from '../types'
import type { PinpointStep } from '../pinpoint/types'

/** Watch Amp think (plan Phase 7.5): what the constellation shows. */
const wired = personFor('everyday', ['wired', 'crash'])
const step = (probe: string, main: string): PinpointStep => ({ kind: 'probe', probe, answer: { main }, stage: 'pinpoint' })
const after = (a: ConsultAnswers, ...steps: PinpointStep[]): ConsultAnswers => ({ ...a, pinpoint: { steps, stopped: false, started: true } })

describe('the nodes', () => {
  it('has one per eligible pattern, spread evenly round Amp from the top, fixed as answers come in', () => {
    const nodes = constellation(wired)
    expect(nodes.map((n) => n.id).sort()).toEqual(eligiblePatterns(wired).map((p) => p.id).sort())
    const angles = nodes.map((n) => n.angle).sort((x, y) => x - y)
    expect(angles[0]).toBeCloseTo(-Math.PI / 2)
    const gaps = angles.slice(1).map((x, i) => x - angles[i])
    for (const g of gaps) expect(g).toBeCloseTo((2 * Math.PI) / nodes.length)
    const later = constellation(after(wired, step('tired-then-awake', 'me')))
    expect(later.map((n) => n.angle)).toEqual(nodes.map((n) => n.angle))
  })

  it('puts the likelier nearer Amp, bigger; pinned closest; ruled out at the edge, unlit', () => {
    const a = after(wired, step('tired-then-awake', 'me'), { kind: 'verdict', pattern: 'wired', verdict: 'yes', stage: 'pinpoint' }, { kind: 'verdict', pattern: 'crash', verdict: 'no', stage: 'pinpoint' })
    const nodes = constellation(a)
    const by = Object.fromEntries(nodes.map((n) => [n.id, n]))
    expect(by.wired).toMatchObject({ state: 'yes', distance: 0.4, weight: 1, contender: true })
    expect(by.crash).toMatchObject({ state: 'no', distance: 1, weight: 0, contender: false })
    const live = nodes.filter((n) => n.state === 'live').sort((x, y) => y.p - x.p)
    for (let i = 1; i < live.length; i++) expect(live[i].distance).toBeGreaterThanOrEqual(live[i - 1].distance)
  })
})

describe('the pulses', () => {
  it('has none before the first answer', () => {
    expect(pulses(wired)).toEqual([])
    expect(pulses(after(wired))).toEqual([])
  })

  it('after an answer, one into each pattern it moved, sized by how much, and which way', () => {
    const before = new Map(leads(wired).map((l) => [l.pattern.id, l.p]))
    const a = after(wired, step('tired-then-awake', 'me'))
    const now = new Map(leads(a).map((l) => [l.pattern.id, l.p]))
    const moved = pulses(a)
    expect(moved.length).toBeGreaterThan(0)
    for (const m of moved) {
      const delta = now.get(m.id)! - before.get(m.id)!
      expect(Math.abs(delta)).toBeGreaterThanOrEqual(PULSE_FROM)
      expect(m.towards).toBe(delta > 0)
      expect(m.size).toBeGreaterThan(0)
      expect(m.size).toBeLessThanOrEqual(1)
    }
    expect(moved.find((m) => m.id === 'wired')).toMatchObject({ towards: true })
  })
})

describe('what the question is splitting', () => {
  it('rings the patterns the question would settle, up to four, from the information gain', () => {
    const ids = splits(wired, PROBE_BY_ID['tired-then-awake'])
    expect(ids).toContain('wired')
    expect(ids.length).toBeLessThanOrEqual(4)
    expect(splits(wired, null)).toEqual([])
  })
})

describe('narrowing it down', () => {
  it('starts with everything eligible, ends on the lead count, drops repeats, and keeps the last four', () => {
    const steps = [step('tired-then-awake', 'me'), step('eleven-pm', 'a'), step('snooze', 'never'), step('weekend-lie-in', 'not'), step('phone-in-bed', 'not')]
    expect(narrowing(wired)[0]).toBe(eligiblePatterns(wired).length)
    const ns = narrowing(after(wired, ...steps))
    expect(ns.length).toBeLessThanOrEqual(4)
    for (let i = 1; i < ns.length; i++) expect(ns[i]).not.toBe(ns[i - 1])
    expect(ns.at(-1)).toBe(constellation(after(wired, ...steps)).filter((n) => n.contender).length)
    expect(narrowingText([9, 4, 2])).toBe('Narrowing it down: 9 → 4 → 2')
  })

  it('says it all in words', () => {
    const a = after(wired, step('tired-then-awake', 'me'), { kind: 'verdict', pattern: 'wired', verdict: 'yes', stage: 'pinpoint' })
    expect(constellationText(constellation(a), [9, 3])).toMatch(/^Narrowing it down: 9 → 3\. pinpointed: Wired and tired/)
  })
})
