import {
  SCENES,
  applyPlaceholder,
  firstSceneIn,
  flowReducer,
  holds,
  initialFlow,
  isAnswered,
  sceneAfter,
  sectionProgress,
  visibleScenes,
  type FlowState,
} from '../flow'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../types'

const CONSENT = { accepted: true as const, version: 'test', at: '2026-09-25T00:00:00Z' }

const start = () => initialFlow('c_test', 0, { route: 'deep' })

/** Answer every scene with its first scripted option, driving Next each time. */
function runToEnd(state: FlowState = start()): FlowState {
  let s = state
  for (let guard = 0; guard < 40 && (s.phase === 'scenes' || s.phase === 'invite'); guard++) {
    // Amp's hunch invite (Phase 6): build the stack now. The invite has its own tests below.
    if (s.phase === 'invite') {
      s = flowReducer(s, { type: 'invite', choice: 'build' })
      continue
    }
    const def = SCENES.find((d) => d.id === s.sceneId)!
    const option = def.placeholder?.options[0]
    if (option) s = flowReducer(s, { type: 'answer', patch: applyPlaceholder(option, s.answers) })
    if (s.sceneId === 'circuit') s = flowReducer(s, { type: 'answer', patch: { healthConsent: CONSENT } })
    s = flowReducer(s, { type: 'next' })
  }
  return s
}

describe('the script', () => {
  it('has the plan’s twelve scenes, two journeys’ own and Pinpoint’s, the safety check before the review (plans v4, v5)', () => {
    expect(SCENES.map((s) => s.id)).toEqual([
      'goals', 'about', 'training', 'aim', 'energy', 'follow-move', 'sleep', 'daylight', 'follow-rest',
      'caffeine', 'food', 'follow-fuel', 'body', 'changes', 'shelf', 'pinpoint', 'circuit', 'review',
    ])
  })

  it('gives every scene a question', () => {
    for (const s of SCENES) expect(s.copy.question.length).toBeGreaterThan(0)
  })

  it('gives every collecting scene a scripted answer, so a full run needs no widget', () => {
    // Pinpoint's screens ask whatever the answers call for; they have no fixed script.
    for (const s of SCENES.filter((d) => d.id !== 'review' && d.interaction !== 'pinpoint')) {
      expect(s.placeholder?.options.length).toBeGreaterThan(0)
    }
  })

  it('opens neutral: what are you after, not what is wrong', () => {
    expect(SCENES[0].copy.question).toBe('What are you after?')
  })

  it('runs the circuit check in calm mode, and only the circuit check', () => {
    expect(SCENES.filter((s) => s.mode === 'calm').map((s) => s.id)).toEqual(['circuit'])
  })
})

describe('a full run on scripts', () => {
  it('works end to end and finishes in analysis', () => {
    const end = runToEnd()
    expect(end.phase).toBe('analysis')
    expect(end.history).toEqual(visibleScenes(end.answers).slice(0, -1))
  })

  it('passes through the circuit check and then the review before anything is decided', () => {
    const end = runToEnd()
    expect(end.phase).toBe('analysis')
    expect(end.history.slice(-1)).toEqual(['circuit'])
    expect(end.sceneId).toBe('review')
    expect(end.answers.circuit).not.toBeNull()
  })

  it('stops an edit made from the review that ought to stop, rather than returning to it', () => {
    let s = runToEnd()
    s = { ...s, phase: 'scenes', sceneId: 'review' }
    s = flowReducer(s, { type: 'jump', sceneId: 'circuit', returnTo: 'review' })
    s = flowReducer(s, { type: 'answer', patch: { circuit: { flags: ['pregnancy'], none: false } } })
    s = flowReducer(s, { type: 'next' })
    expect(s.phase).toBe('stop')
  })

  it('never analyses without the circuit check: a review with none goes back through it', () => {
    let s = runToEnd()
    s = { ...s, phase: 'scenes', sceneId: 'review', answers: { ...s.answers, circuit: null, healthConsent: null } }
    s = flowReducer(s, { type: 'next' })
    expect(s.phase).toBe('scenes')
    expect(s.sceneId).toBe('circuit')
    expect(s.returnTo).toBe('review')
  })

  it('fills the battery left to right, with no cell for a section this route skips', () => {
    for (const route of ['speed', 'deep', 'pinpoint'] as const) {
      const base = initialFlow('c_test', 0, { route, goals: ['energy'], age: '35-44' })
      for (const sceneId of visibleScenes(base.answers)) {
        const fills = sectionProgress({ ...base, sceneId }).map((c) => c.fill)
        // Never a fuller cell after an emptier one.
        fills.forEach((f, i) => i && expect([route, sceneId, f <= fills[i - 1]]).toEqual([route, sceneId, true]))
      }
      if (route !== 'pinpoint') expect(sectionProgress(base).map((c) => c.id)).not.toContain('pinpoint')
    }
  })

  it('fills the battery to 100% at the end', () => {
    expect(sectionProgress(runToEnd()).every((s) => s.fill === 1)).toBe(true)
  })
})

describe('Next', () => {
  it('will not advance an unanswered scene', () => {
    const s = flowReducer(start(), { type: 'next' })
    expect(s.sceneId).toBe('goals')
  })

  it('advances once answered, sliding forward', () => {
    let s = flowReducer(start(), { type: 'answer', patch: { goals: ['energy'] } })
    s = flowReducer(s, { type: 'next' })
    expect(s.sceneId).toBe('about')
    expect(s.direction).toBe('forward')
  })
})

describe('Back', () => {
  it('retraces the path and slides the other way', () => {
    let s = flowReducer(start(), { type: 'answer', patch: { goals: ['energy'] } })
    s = flowReducer(s, { type: 'next' })
    s = flowReducer(s, { type: 'back' })
    expect(s.sceneId).toBe('goals')
    expect(s.direction).toBe('back')
  })

  it('keeps answers when going back', () => {
    let s = flowReducer(start(), { type: 'answer', patch: { goals: ['energy', 'sleep'] } })
    s = flowReducer(s, { type: 'next' })
    s = flowReducer(s, { type: 'back' })
    expect(s.answers.goals).toEqual(['energy', 'sleep'])
  })

  it('does nothing on the first scene: there is nowhere to go back to', () => {
    const s = start()
    expect(flowReducer(s, { type: 'back' })).toBe(s)
  })
})

describe('editing from the review', () => {
  it('returns to the review with everything else intact', () => {
    const atReview = (() => {
      let s = start()
      for (let guard = 0; guard < 20 && s.sceneId !== 'review'; guard++) {
        if (s.phase === 'invite') {
          s = flowReducer(s, { type: 'invite', choice: 'build' })
          continue
        }
        const def = SCENES.find((d) => d.id === s.sceneId)!
        s = flowReducer(s, { type: 'answer', patch: applyPlaceholder(def.placeholder!.options[0], s.answers) })
        s = flowReducer(s, { type: 'next' })
      }
      return s
    })()
    const before = atReview.answers

    let s = flowReducer(atReview, { type: 'jump', sceneId: 'energy', returnTo: 'review' })
    expect(s.sceneId).toBe('energy')
    expect(s.direction).toBe('back')
    s = flowReducer(s, { type: 'answer', patch: { energy: 9 } })
    s = flowReducer(s, { type: 'next' })

    expect(s.sceneId).toBe('review')
    expect(s.returnTo).toBeNull()
    expect(s.answers).toEqual({ ...before, energy: 9 })
  })
})

describe('jumping', () => {
  it('lands on the first scene of a section', () => {
    expect(firstSceneIn('rest', EMPTY_ANSWERS)).toBe('sleep')
  })

  it('refuses a scene that is not shown', () => {
    const speed = initialFlow('c', 0, { route: 'speed' })
    expect(flowReducer(speed, { type: 'jump', sceneId: 'daylight' }).sceneId).toBe(speed.sceneId)
  })
})

describe('branching', () => {
  it('evaluates conditions from JSON', () => {
    const a: ConsultAnswers = { ...EMPTY_ANSWERS, goals: ['ageing'], age: '55-64' }
    expect(holds({ answer: 'goals', includes: 'ageing' }, a)).toBe(true)
    expect(holds({ answer: 'age', in: ['55-64', '65-plus'] }, a)).toBe(true)
    expect(holds({ answer: 'route', equals: 'speed' }, a)).toBe(false)
    expect(holds({ all: [{ answer: 'goals', includes: 'ageing' }, { not: { answer: 'route', equals: 'speed' } }] }, a)).toBe(true)
    expect(holds({ any: [{ answer: 'route', equals: 'speed' }, { answer: 'age', equals: '18-24' }] }, a)).toBe(false)
  })

  it('drops the deep-charge scenes on a speed run', () => {
    const speed = visibleScenes({ ...EMPTY_ANSWERS, route: 'speed' })
    expect(speed).not.toContain('daylight')
    expect(speed).toContain('review')
    expect(speed).toContain('circuit')
  })

  it('resumes after a scene an edit has branched away', () => {
    expect(sceneAfter('daylight', { ...EMPTY_ANSWERS, route: 'speed' })).toBe('caffeine')
  })
})

describe('answered?', () => {
  it('reads a body map left blank as "all good" once you move on', () => {
    let s = initialFlow('c', 0, { route: 'deep' })
    s = { ...s, sceneId: 'body' }
    expect(isAnswered('body', s.answers)).toBe(true)
    expect(s.answers.body).toBeNull()
    s = flowReducer(s, { type: 'next' })
    expect(s.sceneId).toBe('shelf')
    expect(s.answers.body).toEqual([])
  })

  it('keeps sore spots that were tapped', () => {
    let s: FlowState = { ...initialFlow('c', 0, { route: 'deep' }), sceneId: 'body' }
    s = flowReducer(s, { type: 'answer', patch: { body: ['knees'] } })
    s = flowReducer(s, { type: 'next' })
    expect(s.answers.body).toEqual(['knees'])
  })

  it('never reads an empty circuit check as "none of these"', () => {
    const consented = { ...EMPTY_ANSWERS, healthConsent: CONSENT }
    expect(isAnswered('circuit', { ...consented, circuit: { flags: [], none: false } })).toBe(false)
    expect(isAnswered('circuit', { ...consented, circuit: { flags: [], none: true } })).toBe(true)
  })

  it('will not pass the circuit check without explicit consent', () => {
    expect(isAnswered('circuit', { ...EMPTY_ANSWERS, circuit: { flags: [], none: true } })).toBe(false)
  })
})

describe('placeholders', () => {
  it('number goals in the order tapped and stop at three', () => {
    const goals = SCENES[0].placeholder!.options
    let a = EMPTY_ANSWERS
    for (const o of goals) a = { ...a, ...applyPlaceholder(o, a) }
    expect(a.goals).toEqual(['performance', 'energy', 'sleep'])
  })
})

/* ── Phase 6: the start, the invite, the teaser and the back gesture ───── */

import { INVITE_AT, backStep, hunchLead, invites, screenKey, teaser, type FlowAction } from '../flow'
import { HUNCH_AREA, teaserLine } from '../hunch-copy'
import { isClean } from '../ai/copy'
import { nextStep } from '../pinpoint/choose'
import { PATTERNS } from '../pinpoint/library'
import { CORE, TELLS } from '../pinpoint/__tests__/simulate'
import type { PinpointStage } from '../pinpoint/types'

const PINPOINT_SCENES = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']

/** Everyday, short on sleep and running on coffee: a strong hunch from the core answers alone. */
const WIRED: Partial<ConsultAnswers> = { ...CORE.everyday, ...TELLS.wired('everyday'), comfortOffered: true }
/** A builder with nothing much going on: no lead at even odds. */
const SETTLED: Partial<ConsultAnswers> = { ...CORE.builder, comfortOffered: true }

/** On a scene, with every core scene before it behind them, as Next would have left it. */
function at(sceneId: ConsultAnswers extends never ? never : FlowState['sceneId'], answers: Partial<ConsultAnswers>, route: 'deep' | 'speed' = 'deep'): FlowState {
  const s = initialFlow('c_p6', 0, { ...answers, route })
  const order = visibleScenes(s.answers)
  return { ...s, sceneId, history: order.slice(0, order.indexOf(sceneId)) }
}

/** A follow-up or round question answered "Not sure": enough to move on from it. */
function notSure(s: FlowState): FlowState {
  const step = nextStep(s.answers, s.sceneId as PinpointStage)
  if (step.kind !== 'probe') return s
  const pinpoint = { ...(s.answers.pinpoint ?? { steps: [], stopped: false }), steps: [...(s.answers.pinpoint?.steps ?? []), { kind: 'probe' as const, probe: step.probe.id, answer: {}, unsure: true, stage: s.sceneId as PinpointStage }] }
  return flowReducer(s, { type: 'answer', patch: { pinpoint } })
}

describe('the start (Phase 6): no route choice', () => {
  it('opens everyone on scene one of the core scenes', () => {
    const s = initialFlow('c', 0)
    expect(s.phase).toBe('scenes')
    expect(s.sceneId).toBe('goals')
    expect(s.answers.route).toBe('deep')
    expect(visibleScenes(s.answers)).not.toContain('pinpoint')
  })

  it('switches to the 1-minute version from scene one, keeping what is answered', () => {
    let s = flowReducer(initialFlow('c', 0), { type: 'answer', patch: { goals: ['energy'] } })
    s = flowReducer(s, { type: 'route', route: 'speed' })
    expect(s.answers.route).toBe('speed')
    expect(s.sceneId).toBe('goals')
    expect(s.answers.goals).toEqual(['energy'])
    expect(visibleScenes(s.answers)).not.toContain('daylight')
    expect(visibleScenes(s.answers).length).toBeLessThan(visibleScenes(initialFlow('c', 0).answers).length)
  })

  it('still opens on a route a caller already knows (the workshop, tests)', () => {
    expect(initialFlow('c', 0, { route: 'pinpoint' }).answers.route).toBe('pinpoint')
  })
})

describe('the hunch invite (Phase 6)', () => {
  it('opens after the core scenes, before the circuit check, when a lead is at even odds', () => {
    const s = at('shelf', WIRED)
    expect(hunchLead(s.answers)!.p).toBeGreaterThanOrEqual(INVITE_AT)
    const after = flowReducer(s, { type: 'next' })
    expect(after.phase).toBe('invite')
    // The scene under it is still the last core scene.
    expect(after.sceneId).toBe('shelf')
    expect(after.history).toEqual(s.history)
  })

  it('never opens before the last core scene', () => {
    for (const id of ['goals', 'about', 'training', 'energy', 'sleep', 'daylight', 'caffeine', 'food', 'body'] as const) {
      expect([id, invites(at(id, WIRED))]).toEqual([id, null])
    }
  })

  it('carries straight on to the circuit check when no lead qualifies', () => {
    const s = at('shelf', SETTLED)
    expect(hunchLead(s.answers)).toBeNull()
    const after = flowReducer(s, { type: 'next' })
    expect(after.phase).toBe('scenes')
    expect(after.sceneId).toBe('circuit')
  })

  it('"Check it" goes on to Pinpoint with every answer kept, and never back through the core scenes', () => {
    const s = flowReducer(at('shelf', WIRED), { type: 'next' })
    let p = flowReducer(s, { type: 'invite', choice: 'check' })
    expect(p.invite).toBe('checked')
    expect(p.answers.route).toBe('pinpoint')
    expect({ ...p.answers, route: 'deep', pinpoint: null }).toEqual({ ...s.answers, route: 'deep', pinpoint: null })
    expect(PINPOINT_SCENES).toContain(p.sceneId)
    // Walk the Pinpoint screens: each Next goes to the next Pinpoint screen
    // or on to the circuit check, never back to sleep or food.
    const seen: string[] = [p.sceneId]
    for (let guard = 0; guard < 30 && p.sceneId !== 'circuit'; guard++) {
      if (p.sceneId === 'pinpoint') p = flowReducer(p, { type: 'answer', patch: { pinpoint: { ...p.answers.pinpoint!, stopped: true } } })
      else p = notSure(p)
      p = flowReducer(p, { type: 'next' })
      seen.push(p.sceneId)
    }
    expect(seen[seen.length - 1]).toBe('circuit')
    expect(seen.filter((id) => !PINPOINT_SCENES.includes(id) && id !== 'circuit')).toEqual([])
  })

  it('"Build my stack now" goes on to the circuit check, and keeps "Pinpoint it" for the review', () => {
    const s = flowReducer(at('shelf', WIRED), { type: 'next' })
    const b = flowReducer(s, { type: 'invite', choice: 'build' })
    expect(b.invite).toBe('skipped')
    expect(b.phase).toBe('scenes')
    expect(b.sceneId).toBe('circuit')
    expect(b.answers.route).toBe('deep')
    // Asked once on the way through: an edit from the review back to the
    // last core scene returns to the review, with no second invite.
    const edit = flowReducer({ ...b, sceneId: 'review' }, { type: 'jump', sceneId: 'shelf', returnTo: 'review' })
    expect(flowReducer(edit, { type: 'next' }).sceneId).toBe('review')
    const later = flowReducer({ ...b, sceneId: 'review' }, { type: 'jump', sceneId: 'shelf' })
    expect(flowReducer(later, { type: 'next' }).sceneId).toBe('circuit')
    // The review's "Pinpoint it" still takes them in.
    expect(flowReducer({ ...b, sceneId: 'review' }, { type: 'upgrade' }).answers.route).toBe('pinpoint')
  })

  it('is not offered on a Speed run, inside Pinpoint, or on the way back to the review', () => {
    expect(flowReducer(at('shelf', WIRED, 'speed'), { type: 'next' }).sceneId).toBe('circuit')
    const editing = { ...at('shelf', WIRED), returnTo: 'review' as const }
    expect(flowReducer(editing, { type: 'next' }).sceneId).toBe('review')
    const pinpoint = { ...at('shelf', WIRED), answers: { ...at('shelf', WIRED).answers, route: 'pinpoint' as const, pinpoint: { steps: [], stopped: false } } }
    expect(flowReducer(pinpoint, { type: 'next' }).phase).toBe('scenes')
  })

  it('Back from the invite returns to the last core scene', () => {
    const s = flowReducer(flowReducer(at('shelf', WIRED), { type: 'next' }), { type: 'back' })
    expect(s.phase).toBe('scenes')
    expect(s.sceneId).toBe('shelf')
    expect(s.direction).toBe('back')
  })
})

describe('the early teaser (Phase 6)', () => {
  // Through the Rest section only: what Amp knows when the teaser is said.
  const restOnly: Partial<ConsultAnswers> = { ...WIRED, caffeine: null, plate: null, body: null, shelf: null }

  it('follows the Rest section, naming the strongest lead’s area and never a cause', () => {
    const a = initialFlow('c', 0, restOnly).answers
    const t = teaser('daylight', a)!
    expect(t.lead.p).toBeGreaterThanOrEqual(INVITE_AT)
    expect(t.lead.pattern.id).toBe(hunchLead(a)!.pattern.id)
    expect(t.line).toBe(teaserLine(t.lead.pattern.id))
    expect(t.line).toMatch(/^I’ve got a theory about your [a-z ]+\. Hold that thought\.$/)
  })

  it('is said once, on the scene straight after the Rest section', () => {
    const a = initialFlow('c', 0, WIRED).answers
    for (const id of ['goals', 'training', 'energy', 'sleep', 'caffeine', 'food', 'shelf'] as const) expect([id, teaser(id, a)]).toEqual([id, null])
    // On a Speed run the Rest section is the sleep screen alone.
    expect(teaser('sleep', initialFlow('c', 0, { ...restOnly, route: 'speed' }).answers)).not.toBeNull()
  })

  it('stays quiet without a lead at even odds, and inside Pinpoint', () => {
    expect(teaser('daylight', initialFlow('c', 0, SETTLED).answers)).toBeNull()
    expect(teaser('daylight', initialFlow('c', 0, { ...restOnly, route: 'pinpoint' }).answers)).toBeNull()
  })

  it('has a scripted line for every pattern, clean and named by area', () => {
    for (const p of PATTERNS) {
      expect(HUNCH_AREA[p.id]).toBeTruthy()
      expect([p.id, isClean(teaserLine(p.id))]).toEqual([p.id, true])
    }
  })
})

describe('the back gesture (Phase 6)', () => {
  /** A forward run, every state kept, answering "build my stack now" at the invite. */
  function forward(answers: Partial<ConsultAnswers>): FlowState[] {
    const path: FlowState[] = []
    let s = initialFlow('c', 0, answers)
    for (let guard = 0; guard < 40 && s.phase !== 'analysis'; guard++) {
      path.push(s)
      if (s.sceneId === 'circuit') s = flowReducer(s, { type: 'answer', patch: { healthConsent: CONSENT, circuit: { flags: [], none: true } } })
      s = s.phase === 'invite' ? flowReducer(s, { type: 'invite', choice: 'build' }) : flowReducer(s, { type: 'next' })
    }
    path.push(s)
    return path
  }

  it('gives every screen its own history entry, and steps back exactly one', () => {
    const path = forward(WIRED)
    expect(path.map((s) => s.phase)).toContain('invite')
    for (let i = 1; i < path.length; i++) {
      expect(screenKey(path[i])).not.toBe(screenKey(path[i - 1]))
      const step = backStep(path[i])
      expect(step).not.toBeNull()
      expect([i, screenKey(flowReducer(path[i], step as FlowAction))]).toEqual([i, screenKey(path[i - 1])])
    }
  })

  it('has nowhere to go from scene one: there the gesture leaves the page', () => {
    expect(backStep(initialFlow('c', 0))).toBeNull()
  })

  it('takes back the last Pinpoint answer inside the round, one answer per entry', () => {
    let s: FlowState = { ...at('shelf', WIRED), sceneId: 'pinpoint' }
    s = { ...s, answers: { ...s.answers, route: 'pinpoint', pinpoint: { steps: [], stopped: false, started: true } } }
    const before = screenKey(s)
    const answered = notSure(s)
    expect(screenKey(answered)).not.toBe(before)
    const step = backStep(answered)!
    expect(step.type).toBe('answer')
    const undone = flowReducer(answered, step)
    expect(undone.sceneId).toBe('pinpoint')
    expect(undone.answers.pinpoint!.steps).toEqual([])
    expect(screenKey(undone)).toBe(before)
  })

  it('steps off the stop, the invite and the charge-up to the screen under them', () => {
    const base = at('shelf', WIRED)
    for (const phase of ['stop', 'invite', 'analysis'] as const) {
      const s = flowReducer({ ...base, phase }, backStep({ ...base, phase })!)
      expect([phase, s.phase, s.sceneId]).toEqual([phase, 'scenes', 'shelf'])
    }
  })
})

describe('the back gesture through the invite (Phase 6)', () => {
  it('shows the invite again, both choices open, on the way back from either choice', () => {
    const invite = flowReducer(at('shelf', WIRED), { type: 'next' })
    const built = flowReducer(invite, { type: 'invite', choice: 'build' })
    const fromBuild = flowReducer(built, backStep(built)!)
    expect([fromBuild.phase, fromBuild.sceneId, fromBuild.invite]).toEqual(['invite', 'shelf', null])
    const checked = flowReducer(invite, { type: 'invite', choice: 'check' })
    const fromCheck = flowReducer(checked, backStep(checked)!)
    expect([fromCheck.phase, fromCheck.sceneId, fromCheck.invite, fromCheck.answers.route]).toEqual(['invite', 'shelf', null, 'deep'])
    expect(fromCheck.answers).toEqual(invite.answers)
    // And on, the other way this time.
    expect(flowReducer(fromCheck, { type: 'invite', choice: 'build' }).sceneId).toBe('circuit')
  })
})

describe('the battery after "Check it" (Phase 6)', () => {
  it('keeps the core sections full on Pinpoint screens that sit earlier in the order', () => {
    const p = flowReducer(flowReducer(at('shelf', WIRED), { type: 'next' }), { type: 'invite', choice: 'check' })
    const cells = Object.fromEntries(sectionProgress(p).map((c) => [c.id, c.fill]))
    // Every core scene is behind them; only a section's follow-up still to come is not.
    const order = visibleScenes(p.answers)
    for (const c of sectionProgress(p)) {
      if (c.id === 'pinpoint' || c.id === 'check') continue
      const scenes = order.filter((id) => SCENES.find((d) => d.id === id)!.section === c.id)
      const core = scenes.filter((id) => !PINPOINT_SCENES.includes(id)).length
      expect([c.id, c.fill]).toEqual([c.id, core / scenes.length])
    }
    expect(cells.you).toBe(1)
    expect(cells.check).toBe(0)
  })
})
