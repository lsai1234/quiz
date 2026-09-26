'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { SceneDef } from '@/lib/consult/flow'
import { HELD_BACK, MAX_TEXT, screenText } from '@/lib/consult/ai/guard'
import { validatePicks, type Pick } from '@/lib/consult/ai/understand'
import { stateTransition } from '@/lib/consult/motion'
import { Glyph } from './Glyph'
import { NextButton, QuietLink } from './controls'
import { HoldToTalk, voiceSupported, type Transcribe } from './HoldToTalk'

/**
 * "Tell Amp more" (build V3).
 *
 * An optional box on any scene. What's typed goes to Amp, and what Amp picks
 * up comes back as cards — "Night shifts · 3 a week", "3 coffees a day" — to
 * add or dismiss. Not a chat: there is no reply, only answers to confirm, and
 * nothing changes until Add is tapped. A wrong pick goes with one tap on ✕.
 *
 * Health details never leave the device: the medical screen runs here, before
 * any request, and again on the server.
 *
 * Or say it (U3): hold the mic and what's said lands in the box as text, to
 * check before sending. No mic, or a blocked one, and it's typing as before.
 */

type Understand = (scene: SceneDef, text: string) => Promise<{ picks?: Pick[]; held?: string; unavailable?: boolean; fallback?: boolean }>

export const understand: Understand = async (scene, text) => {
  try {
    const res = await fetch('/api/consult/understand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId: scene.id, text }),
    })
    const data = (await res.json()) as { picks?: unknown; held?: string; unavailable?: boolean; fallback?: boolean }
    // The browser validates the picks too.
    if (data.picks !== undefined) return { picks: validatePicks({ picks: data.picks }) }
    return { held: data.held, unavailable: data.unavailable, fallback: data.fallback }
  } catch {
    return { fallback: true }
  }
}

interface Props {
  scene: SceneDef
  onAdd: (pick: Pick) => void
  onClose: () => void
  /** Amp flickers while the text is being read. */
  onThinking: (thinking: boolean) => void
  send?: Understand
  /** Speech to text (U3). Injectable for tests. */
  transcribe?: Transcribe
  /** Whether to offer the mic at all. Defaults to what the browser supports. */
  voice?: boolean
}

export function TellAmpMore({ scene, onAdd, onClose, onThinking, send = understand, transcribe, voice }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [picks, setPicks] = useState<Pick[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const [mic, setMic] = useState(() => voice ?? voiceSupported())
  const [hearing, setHearing] = useState(false)

  useEffect(() => {
    box.current?.focus()
  }, [])

  async function submit() {
    const verdict = screenText(text)
    if (!verdict.ok) {
      setPicks(null)
      setMessage(verdict.reason === 'empty' ? null : HELD_BACK[verdict.reason])
      return
    }
    setBusy(true)
    onThinking(true)
    setMessage(null)
    const res = await send(scene, verdict.text)
    setBusy(false)
    onThinking(false)
    if (res.held === 'medical') return setMessage(HELD_BACK.medical)
    if (res.held === 'too-long') return setMessage(HELD_BACK['too-long'])
    if (res.held) return setMessage('I can’t use that one. Try saying it another way?')
    if (!res.picks) return setMessage('I couldn’t read that just now. You can answer on screen as normal.')
    setPicks(res.picks)
    if (res.picks.length === 0) setMessage('Nothing I can add from that — the screen above has it covered.')
  }

  function addOne(pick: Pick) {
    onAdd(pick)
    setPicks((p) => (p ? p.filter((x) => x !== pick) : p))
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: 'var(--amp-scrim)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={onKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tell Amp more"
        className="amp-anim-rise w-full"
        style={{
          maxWidth: 'var(--amp-column)',
          padding: 'var(--amp-space-5) var(--amp-gutter) max(var(--amp-space-5), env(safe-area-inset-bottom))',
          borderRadius: 'var(--amp-radius-panel) var(--amp-radius-panel) 0 0',
          border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
          background: 'var(--amp-glass-raised)',
          backdropFilter: 'blur(var(--amp-glass-blur)) saturate(var(--amp-glass-saturate))',
        }}
      >
        <div className="flex items-center justify-between">
          <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}>
            Tell Amp more
          </p>
          <QuietLink icon="close" aria-label="Close" onClick={onClose}>
            {''}
          </QuietLink>
        </div>

        <label className="sr-only" htmlFor="amp-tell-more">
          Anything else about {scene.label.toLowerCase()}?
        </label>
        <textarea
          id="amp-tell-more"
          ref={box}
          value={text}
          maxLength={MAX_TEXT + 20}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. I work nights three times a week"
          className="w-full"
          style={{
            marginTop: 'var(--amp-space-2)',
            padding: 'var(--amp-space-3) var(--amp-space-4)',
            borderRadius: 'var(--amp-radius-tile)',
            border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
            background: 'var(--amp-glass-solid)',
            color: 'var(--amp-ink)',
            fontSize: 'var(--amp-text-body)',
            resize: 'none',
          }}
        />
        {mic && (
          <div style={{ marginTop: 'var(--amp-space-2)' }}>
            <HoldToTalk
              send={transcribe}
              onBusy={(b) => {
                setHearing(b)
                onThinking(b)
              }}
              onMessage={setMessage}
              onBlocked={() => {
                setMic(false)
                box.current?.focus()
              }}
              onText={(said) => {
                setPicks(null)
                setText((t) => (t.trim() ? `${t.trim()} ${said}` : said).slice(0, MAX_TEXT))
                box.current?.focus()
              }}
            />
          </div>
        )}
        <p style={{ marginTop: 'var(--amp-space-1)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-3)' }}>
          {mic
            ? 'Leave out medical details — the circuit check covers those. Typed, they never leave your phone; said aloud, they’re dropped as soon as they’re heard, never used or kept.'
            : 'Leave out medical details — the circuit check covers those, and they’re never sent to AI.'}
        </p>

        <div aria-live="polite">
          {message && <p style={{ marginTop: 'var(--amp-space-3)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-caution)' }}>{message}</p>}

          {picks && picks.length > 0 && (
            <div style={{ marginTop: 'var(--amp-space-4)' }}>
              <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}>
                Amp picked up
              </p>
              <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)', marginTop: 'var(--amp-space-2)' }}>
                {picks.map((p) => (
                  <li
                    key={`${p.kind}:${p.value}`}
                    className="flex items-center"
                    style={{
                      gap: 'var(--amp-space-2)',
                      padding: 'var(--amp-space-2) var(--amp-space-2) var(--amp-space-2) var(--amp-space-4)',
                      borderRadius: 'var(--amp-radius-tile)',
                      border: 'var(--amp-hairline) solid var(--amp-accent-line)',
                      background: 'var(--amp-accent-fill)',
                      transition: stateTransition('opacity'),
                    }}
                  >
                    <span className="flex-1">{p.label}</span>
                    <button type="button" onClick={() => addOne(p)} className="amp-press uppercase" style={{ minHeight: 'var(--amp-target)', padding: '0 var(--amp-space-3)', color: 'var(--amp-accent)', fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)' }}>
                      Add
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${p.label}`}
                      onClick={() => setPicks((all) => (all ? all.filter((x) => x !== p) : all))}
                      className="amp-press flex items-center justify-center"
                      style={{ width: 'var(--amp-target)', height: 'var(--amp-target)', color: 'var(--amp-ink-2)' }}
                    >
                      <Glyph name="close" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)', marginTop: 'var(--amp-space-4)' }}>
          {picks && picks.length > 1 ? (
            <NextButton
              onClick={() => {
                picks.forEach(onAdd)
                onClose()
              }}
            >
              Add all
            </NextButton>
          ) : picks && picks.length === 1 ? (
            <NextButton
              onClick={() => {
                onAdd(picks[0])
                onClose()
              }}
            >
              Add it
            </NextButton>
          ) : (
            <NextButton ready={!busy && !hearing && text.trim().length > 0} nudge="Type something first." onClick={() => void submit()}>
              {busy ? 'Amp is reading…' : 'Send to Amp'}
            </NextButton>
          )}
        </div>
      </div>
    </div>
  )
}
