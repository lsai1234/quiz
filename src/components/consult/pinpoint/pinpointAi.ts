'use client'

import { useEffect, useRef } from 'react'
import { COPY_BUDGET_MS } from '@/lib/consult/ai/copy'
import { validateHints, validateProbeWords, pinpointContext, scriptedParts, safeLine, PINPOINT_LIMITS, validateProbePicks, type ProbePick, type ProbeWords } from '@/lib/consult/ai/pinpoint'
import { screenText } from '@/lib/consult/ai/guard'
import { nextStep } from '@/lib/consult/pinpoint/choose'
import { pinpointed } from '@/lib/consult/pinpoint/effects'
import { hunchEvidence } from '@/lib/consult/pinpoint/playback'
import { PATTERN_BY_ID, PROBE_BY_ID } from '@/lib/consult/pinpoint/library'
import { eligiblePatterns, isIn, leads, type Lead } from '@/lib/consult/pinpoint/leads'
import { pinpointView, probeText, withStep } from '@/lib/consult/pinpoint/screen'
import type { PatternId, PinpointStage, Probe } from '@/lib/consult/pinpoint/types'
import type { ConsultAnswers, NoteHint, SceneId } from '@/lib/consult/types'

/**
 * Pinpoint's AI in the browser (plan v5 §7).
 *
 * Words are asked for ahead of time and used only if they're in hand when the
 * screen appears, never swapped in under someone's eyes. The round's next
 * question depends on the answer to this one, so for the answers at either
 * end the question each would lead to is worked out and its words asked for
 * now; the middle answers mostly lead to one of the same, and the server
 * caches by the coarse picture, so that costs little. Anything late, failed or rejected
 * leaves the scripted words.
 *
 * The browser validates everything again: it doesn't trust the network.
 */

type Person = { goals: ConsultAnswers['goals']; age: ConsultAnswers['age']; energy: ConsultAnswers['energy']; comfort: boolean }
const person = (a: ConsultAnswers): Person => ({ goals: a.goals, age: a.age, energy: a.energy, comfort: a.comfort })

async function post(body: Record<string, unknown>, ms = COPY_BUDGET_MS): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('/api/consult/pinpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined,
    })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

/* ── The cache ───────────────────────────────────────────────────────────── */

/** Per page: words by what they depend on. `null` is a miss, and isn't asked again. */
const words = new Map<string, ProbeWords | null>()
const lines = new Map<string, string | null>()
const pending = new Set<string>()
let off = false

/** The server has no AI, or the tests want a clean slate. */
export function resetPinpointAi(): void {
  words.clear()
  lines.clear()
  pending.clear()
  off = false
}

const probeKey = (probe: Probe, a: ConsultAnswers) => `${probe.id}|${pinpointContext(a)}|${probeText(probe, a)}`
const hunchKey = (pattern: PatternId, evidence: string[], a: ConsultAnswers) => `hunch|${pattern}|${evidence.join('|')}|${pinpointContext(a)}`
const foundKey = (ids: PatternId[], partly: PatternId[], a: ConsultAnswers) => `found|${ids.join(',')}|${partly.join(',')}|${pinpointContext(a)}`

function fetchProbe(probe: Probe, a: ConsultAnswers): void {
  const k = probeKey(probe, a)
  if (off || words.has(k) || pending.has(k)) return
  pending.add(k)
  void post({ kind: 'probe', probe: probe.id, person: person(a) }).then((data) => {
    pending.delete(k)
    if (data?.unavailable) off = true
    words.set(k, data?.words ? validateProbeWords(data.words, probe, scriptedParts(probe, probeText(probe, a))) : null)
  })
}

function fetchHunch(lead: Lead, a: ConsultAnswers): void {
  const evidence = hunchEvidence(lead)
  const k = hunchKey(lead.pattern.id, evidence, a)
  if (off || !evidence.length || lines.has(k) || pending.has(k)) return
  pending.add(k)
  void post({ kind: 'hunch', pattern: lead.pattern.id, evidence, person: person(a) }).then((data) => {
    pending.delete(k)
    if (data?.unavailable) off = true
    lines.set(k, safeLine(data?.line, PINPOINT_LIMITS.line, [lead.pattern.line, ...evidence].join(' ')))
  })
}

function fetchFound(a: ConsultAnswers): void {
  const found = pinpointed(a)
  const yes = found.filter((l) => l.state === 'yes').map((l) => l.pattern.id)
  const partly = found.filter((l) => l.state === 'partly').map((l) => l.pattern.id)
  if (!found.length) return
  const k = foundKey(yes, partly, a)
  if (off || lines.has(k) || pending.has(k)) return
  pending.add(k)
  void post({ kind: 'found', pinpointed: yes, partly, person: person(a) }).then((data) => {
    pending.delete(k)
    if (data?.unavailable) off = true
    lines.set(k, safeLine(data?.summary, PINPOINT_LIMITS.found, [...yes, ...partly].map((id) => PATTERN_BY_ID[id].line).join(' ')))
  })
}

/* ── Reading it ──────────────────────────────────────────────────────────── */

/** A question's words, if they're in hand. */
export function probeWords(probe: Probe, a: ConsultAnswers): ProbeWords | null {
  return words.get(probeKey(probe, a)) ?? null
}

/** The hunch's line, if it's in hand. */
export function hunchLine(lead: Lead, a: ConsultAnswers): string | null {
  return lines.get(hunchKey(lead.pattern.id, hunchEvidence(lead), a)) ?? null
}

/** "What I found", if it's in hand. */
export function foundLine(a: ConsultAnswers): string | null {
  const found = pinpointed(a)
  const yes = found.filter((l) => l.state === 'yes').map((l) => l.pattern.id)
  const partly = found.filter((l) => l.state === 'partly').map((l) => l.pattern.id)
  return found.length ? lines.get(foundKey(yes, partly, a)) ?? null : null
}

/* ── Asking ahead ────────────────────────────────────────────────────────── */

/** Whatever a stage would show next, asked for now. */
function ahead(stage: PinpointStage, a: ConsultAnswers): void {
  const step = nextStep(a, stage)
  if (step.kind === 'probe') fetchProbe(step.probe, a)
  else if (step.kind === 'hunch') fetchHunch(step.lead, a)
  else if (step.kind === 'done') fetchFound(a)
}

/**
 * On every change: the question on screen, and for its two end answers the
 * screen each would lead to. On a core screen, the follow-up that
 * comes next. At the end, "What I found".
 */
export function usePinpointAi(a: ConsultAnswers, sceneId: SceneId, next: SceneId | null, enabled: boolean): void {
  const last = useRef('')
  useEffect(() => {
    if (!enabled || off || a.route !== 'pinpoint' || !a.pinpoint) return
    const sig = `${sceneId}|${next}|${JSON.stringify(a.pinpoint.steps)}|${a.pinpoint.stopped}|${pinpointContext(a)}`
    if (sig === last.current) return
    last.current = sig
    const stages: PinpointStage[] = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']
    if (next && stages.includes(next as PinpointStage)) ahead(next as PinpointStage, a)
    if (!stages.includes(sceneId as PinpointStage)) return
    const stage = sceneId as PinpointStage
    const view = pinpointView(stage, a)
    if (view.kind === 'intro') ahead('pinpoint', a)
    if (view.kind === 'probe') {
      fetchProbe(view.probe, a)
      if (stage === 'pinpoint' && view.probe.items.length === 1) {
        // The two ends of the answers ("That's me", "Not me") cover the
        // branches the round usually takes; the middle ones mostly land on
        // one of the same questions. Keeps the calls near one per question.
        const options = view.probe.items[0].options
        for (const o of [options[0], options[options.length - 1]]) {
          const after = { ...a, pinpoint: withStep(a, { kind: 'probe', probe: view.probe.id, answer: { [view.probe.items[0].key]: o.key }, stage }) }
          ahead('pinpoint', after)
        }
      }
    }
    if (view.kind === 'hunch') {
      fetchHunch(view.lead, a)
      for (const verdict of ['yes', 'no'] as const) ahead('pinpoint', { ...a, pinpoint: withStep(a, { kind: 'verdict', pattern: view.lead.pattern.id, verdict, stage: 'pinpoint' }) })
    }
    if (view.kind === 'done') fetchFound(a)
  }, [enabled, a, sceneId, next])
}

/* ── Typed answers ───────────────────────────────────────────────────────── */

export type TellResult = { picks: ProbePick[] } | { held: string } | { unavailable: true } | { fallback: true }

/** Questions a typed answer may fill now: one-answer questions the round could still ask. */
export function tellCandidates(a: ConsultAnswers): string[] {
  const asked = new Set((a.pinpoint?.steps ?? []).flatMap((s) => (s.kind === 'probe' ? [s.probe] : [])))
  const live = new Set(leads(a).filter(isIn).map((l) => l.pattern.id))
  return Object.values(PROBE_BY_ID)
    .filter((p) => !asked.has(p.id) && (p.askIf?.(a) ?? true) && ['scenario', 'how-often', 'this-or-that'].includes(p.format))
    .filter((p) => p.items[0].options.some((o) => Object.keys(o.pulls).some((id) => live.has(id as PatternId))))
    .map((p) => p.id)
    .slice(0, 30)
}

/** Read typed text into answers. The medical screen runs here first: health text goes nowhere. */
export async function tellPinpoint(text: string, candidates: string[], a: ConsultAnswers): Promise<TellResult> {
  const verdict = screenText(text)
  if (!verdict.ok) return { held: verdict.reason }
  const data = await post({ kind: 'tell', text: verdict.text, candidates, person: person(a) }, 9000)
  if (!data) return { fallback: true }
  if (data.unavailable) return { unavailable: true }
  if (typeof data.held === 'string') return { held: data.held }
  if (data.picks !== undefined) return { picks: validateProbePicks({ picks: data.picks }, candidates) }
  return { fallback: true }
}

/* ── Notes, read together ────────────────────────────────────────────────── */

/** The notes left by typed answers, in screen order. */
export function notesOf(a: ConsultAnswers): string[] {
  return Object.values(a.notes).filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
}

/**
 * What the notes point to, read together: known patterns this person's
 * journey allows, each with a why built from the notes. Null when the AI
 * isn't there to ask; an empty list when it found nothing.
 */
export async function readNotes(a: ConsultAnswers): Promise<NoteHint[] | null> {
  const notes = notesOf(a).map((n) => screenText(n)).flatMap((v) => (v.ok ? [v.text] : []))
  const candidates = eligiblePatterns(a).map((p) => p.id)
  if (!notes.length || !candidates.length) return []
  const data = await post({ kind: 'notes', notes, candidates, person: person(a) }, 9000)
  if (!data || data.unavailable || !Array.isArray(data.hints)) return null
  return validateHints({ hints: data.hints }, candidates, notes)
}
