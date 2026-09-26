'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { HELD_BACK } from '@/lib/consult/ai/guard'
import { MAX_SECONDS, MIN_HOLD_MS, RECORDER_TYPES } from '@/lib/consult/ai/voice'
import { stateTransition } from '@/lib/consult/motion'
import { Glyph } from './Glyph'

/**
 * Hold to talk (build U3), inside "Tell Amp more".
 *
 * Press and hold: the mic opens, a live waveform shows it's hearing you. Let
 * go: the clip is turned into text and dropped into the box, to read and fix
 * before sending. The mic is opened for each hold and closed straight after,
 * so the browser's recording light is only ever on while the button is held.
 *
 * Works with the keyboard too (hold Space or Enter). If the mic is blocked or
 * missing, it says so once and hands over to typing, which always works.
 */

export type Transcribe = (audio: Blob) => Promise<{ text?: string; held?: string; fallback?: boolean; unavailable?: boolean }>

export const transcribe: Transcribe = async (audio) => {
  try {
    const form = new FormData()
    form.append('audio', audio)
    const res = await fetch('/api/consult/voice', { method: 'POST', body: form })
    return (await res.json()) as Awaited<ReturnType<Transcribe>>
  } catch {
    return { fallback: true }
  }
}

/** Whether this browser can record at all. Checked before the button is shown. */
export function voiceSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined'
}

export const BLOCKED = 'Your microphone is blocked, so type it instead — it works just the same.'
const BARS = 20

interface Props {
  onText: (text: string) => void
  /** The mic can't be used: hide the button and go back to typing. */
  onBlocked: () => void
  onMessage: (message: string | null) => void
  onBusy: (busy: boolean) => void
  send?: Transcribe
}

type Phase = 'idle' | 'opening' | 'listening' | 'working'

export function HoldToTalk({ onText, onBlocked, onMessage, onBusy, send = transcribe }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const held = useRef(false)
  const startedAt = useRef(0)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audio = useRef<{ ctx: AudioContext; raf: number } | null>(null)
  const bars = useRef<(HTMLSpanElement | null)[]>([])

  const release = () => {
    if (limit.current) clearTimeout(limit.current)
    limit.current = null
    if (audio.current) {
      cancelAnimationFrame(audio.current.raf)
      void audio.current.ctx.close().catch(() => undefined)
      audio.current = null
    }
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  useEffect(() => () => {
    held.current = false
    if (recorder.current?.state === 'recording') {
      recorder.current.ondataavailable = null
      recorder.current.onstop = null
      recorder.current.stop()
    }
    release()
  }, [])

  /** The waveform: loudness across the last few milliseconds, drawn straight onto the bars. */
  function listen(s: MediaStream) {
    const Ctx = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined
    if (!Ctx) return
    try {
      const ctx = new Ctx()
      // iPhone starts an audio context suspended when it isn't created inside
      // the tap itself (this one waits on the mic permission first).
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(s).connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      const draw = () => {
        analyser.getByteTimeDomainData(data)
        const step = Math.floor(data.length / BARS)
        for (let i = 0; i < BARS; i++) {
          let sum = 0
          for (let j = i * step; j < (i + 1) * step; j++) sum += ((data[j] - 128) / 128) ** 2
          const level = Math.min(1, Math.sqrt(sum / step) * 4)
          const bar = bars.current[i]
          if (bar) bar.style.transform = `scaleY(${0.15 + level * 0.85})`
        }
        if (audio.current) audio.current.raf = requestAnimationFrame(draw)
      }
      audio.current = { ctx, raf: requestAnimationFrame(draw) }
    } catch {
      // No waveform is fine; the recording still works.
    }
  }

  async function start() {
    if (phase !== 'idle') return
    held.current = true
    onMessage(null)
    setPhase('opening')
    let s: MediaStream
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      setPhase('idle')
      onMessage(BLOCKED)
      onBlocked()
      return
    }
    // Let go while the browser was asking for permission: nothing to record yet.
    if (!held.current) {
      s.getTracks().forEach((t) => t.stop())
      setPhase('idle')
      onMessage('Got it — now hold the button while you talk.')
      return
    }
    stream.current = s
    const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t))
    const rec = new MediaRecorder(s, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => void finish(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }))
    recorder.current = rec
    startedAt.current = Date.now()
    rec.start()
    listen(s)
    setPhase('listening')
    limit.current = setTimeout(stop, MAX_SECONDS * 1000)
  }

  function stop() {
    held.current = false
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  async function finish(clip: Blob) {
    const long = Date.now() - startedAt.current >= MIN_HOLD_MS
    release()
    recorder.current = null
    if (!long || clip.size === 0) {
      setPhase('idle')
      onMessage('Hold the button down while you talk, then let go.')
      return
    }
    setPhase('working')
    onBusy(true)
    const res = await send(clip)
    onBusy(false)
    setPhase('idle')
    if (res.held === 'medical') return onMessage(HELD_BACK.medical)
    if (res.unavailable || res.fallback || res.text === undefined) return onMessage('I couldn’t catch that just now. Try again, or type it.')
    if (!res.text) return onMessage('I didn’t hear anything. Try again a little closer?')
    onText(res.text)
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    void start()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault()
      void start()
    }
  }
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') stop()
  }

  const listening = phase === 'listening'
  const label = listening ? 'Listening. Let go to finish.' : phase === 'working' ? 'Turning that into text' : 'Hold to talk'

  return (
    <div className="flex items-center" style={{ gap: 'var(--amp-space-3)' }}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={listening}
        disabled={phase === 'working'}
        onPointerDown={onPointerDown}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
        className="amp-press flex shrink-0 items-center justify-center"
        style={{
          width: 'var(--amp-target)',
          height: 'var(--amp-target)',
          borderRadius: 'var(--amp-radius-pill)',
          border: `var(--amp-hairline) solid ${listening ? 'transparent' : 'var(--amp-accent-line)'}`,
          background: listening ? 'var(--amp-accent)' : 'var(--amp-accent-fill)',
          color: listening ? 'var(--amp-ink-on-accent)' : 'var(--amp-accent)',
          boxShadow: listening ? 'var(--amp-glow)' : 'none',
          touchAction: 'none',
          userSelect: 'none',
          // No "copy / look up" callout on a long press: holding is the point.
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          transition: stateTransition('background-color', 'box-shadow', 'color'),
        }}
      >
        <Glyph name="mic" size={22} />
      </button>
      {listening ? (
        <span aria-hidden data-waveform className="flex flex-1 items-center" style={{ gap: 'var(--amp-hairline)', height: 'var(--amp-space-8)' }}>
          {Array.from({ length: BARS }, (_, i) => (
            <span
              key={i}
              ref={(el) => {
                bars.current[i] = el
              }}
              className="flex-1"
              style={{ height: '100%', borderRadius: 'var(--amp-radius-pill)', background: 'var(--amp-accent)', transform: 'scaleY(0.15)' }}
            />
          ))}
        </span>
      ) : (
        <span aria-live="polite" style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-3)' }}>
          {phase === 'working' ? 'Turning that into text…' : phase === 'opening' ? 'Opening the mic…' : 'Hold to talk, or type'}
        </span>
      )}
    </div>
  )
}
