'use client'

import { useEffect, useState } from 'react'
import { consultFontVars } from './fonts'
import { Glyph } from './Glyph'
import { NextButton, QuietLink } from './controls'
import { voiceSupported } from './HoldToTalk'
import { speechSupported } from './useReadAloud'

/**
 * The founder preview panel on /quizv2: what's switched on, why, and where to
 * find it — so an AI feature that isn't showing reads as "no key on the
 * server", not as "broken".
 *
 * A strip across the top opens it. "Test the AI now" makes one real call of
 * each kind the consult needs (see /api/consult/health) and shows OpenAI's
 * own answer, including its error when there is one.
 */

interface Props {
  /** The server has an OpenAI key, so the AI layer is on here. */
  aiConfigured: boolean
  /** The animated Amp is switched on and its file is in place. */
  rive: boolean
}

interface Health {
  configured: boolean
  model?: string
  targetMs?: number
  wording?: { ok: boolean; ms: number; detail: string }
  moderation?: { ok: boolean; ms: number; detail: string }
  error?: string
}

type Tone = 'on' | 'off' | 'info'

export function FounderPreview({ aiConfigured, rive }: Props) {
  const [open, setOpen] = useState(false)
  const [support, setSupport] = useState<{ voice: boolean; speech: boolean } | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [testing, setTesting] = useState(false)

  // Read in the browser, after mount: what this device can do.
  useEffect(() => setSupport({ voice: voiceSupported(), speech: speechSupported() }), [])

  async function test() {
    setTesting(true)
    setHealth(null)
    try {
      const res = await fetch('/api/consult/health', { method: 'POST' })
      setHealth((await res.json()) as Health)
    } catch {
      setHealth({ configured: aiConfigured, error: 'Couldn’t reach the server.' })
    } finally {
      setTesting(false)
    }
  }

  const aiNote = aiConfigured
    ? 'On for this preview, because the server has an OpenAI key.'
    : 'Off: the server has no OPENAI_API_KEY. Amp uses the scripted words, and the features below that need AI stay hidden.'

  const rows: { label: string; tone: Tone; note: string }[] = [
    { label: 'AI layer', tone: aiConfigured ? 'on' : 'off', note: aiNote },
    { label: 'Amp’s words', tone: aiConfigured ? 'on' : 'off', note: 'Questions, hints, the goal sub-lines and Amp’s reaction line are written for each person. Scripted words show whenever the AI is slow.' },
    { label: 'Tell Amp more', tone: aiConfigured ? 'on' : 'off', note: 'The link under each question (not on the review or safety screens). Type or talk; what Amp picks up comes back as cards to add.' },
    {
      label: 'Voice',
      tone: aiConfigured && support?.voice ? 'on' : 'off',
      note: !aiConfigured ? 'Needs the AI layer.' : support && !support.voice ? 'This browser can’t record audio.' : 'Inside “Tell Amp more”: hold the mic, talk, let go.',
    },
    { label: 'Read aloud', tone: support?.speech ? 'info' : 'off', note: support && !support.speech ? 'This browser has no speech voice.' : 'Tap “Bigger text” (comfort mode) and each question is read out. Turn it off with “Reading aloud”.' },
    { label: 'Shelf scan', tone: aiConfigured ? 'on' : 'off', note: '“Scan my shelf instead” on the “Already taking anything?” screen.' },
    { label: 'Tracker read', tone: aiConfigured ? 'on' : 'off', note: '“Fill from my tracker” on the training and sleep screens, on the Deep charge route.' },
    { label: 'What’s this?', tone: 'info', note: 'The ⓘ on options. With the AI on it also takes a follow-up question.' },
    { label: 'Animated Amp', tone: rive ? 'on' : 'off', note: rive ? 'Rive file loaded.' : 'Waiting for the Rive file (public/consult/amp.riv) and NEXT_PUBLIC_AMP_RIVE=1. Until then Amp is the drawn version.' },
    { label: 'Customers', tone: 'info', note: 'The public home page follows Founder hub → Settings → Quiz, which is off by default.' },
  ]

  return (
    <div className={`amp-consult ${consultFontVars}`}>
      {/* A strip at the top, in the page's flow: it can never sit on top of a control. */}
      <div
        className="flex items-center justify-between"
        style={{
          gap: 'var(--amp-space-2)',
          padding: 'max(var(--amp-space-1), env(safe-area-inset-top)) var(--amp-gutter) var(--amp-space-1)',
          borderBottom: 'var(--amp-hairline) solid var(--amp-edge)',
          background: 'var(--amp-ground)',
          fontFamily: 'var(--amp-font-mono)',
          fontSize: 'var(--amp-text-data)',
          letterSpacing: 'var(--amp-tracking-data-tight)',
          textTransform: 'uppercase',
          color: 'var(--amp-ink-2)',
        }}
      >
        <span className="inline-flex items-center" style={{ gap: 'var(--amp-space-2)' }}>
          <span aria-hidden style={{ width: 'var(--amp-space-2)', height: 'var(--amp-space-2)', borderRadius: 'var(--amp-radius-pill)', background: aiConfigured ? 'var(--amp-go)' : 'var(--amp-caution)' }} />
          Founder preview · AI {aiConfigured ? 'on' : 'off'}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="amp-press uppercase" style={{ minHeight: 'var(--amp-target)', color: 'var(--amp-accent)', letterSpacing: 'inherit' }}>
          What’s on
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'var(--amp-scrim)' }} onClick={(e) => e.target === e.currentTarget && setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Founder preview"
            className="amp-anim-rise flex w-full flex-col"
            style={{
              maxWidth: 'var(--amp-column)',
              maxHeight: '88dvh',
              overflowY: 'auto',
              gap: 'var(--amp-space-3)',
              padding: 'var(--amp-space-5) var(--amp-gutter) max(var(--amp-space-5), env(safe-area-inset-bottom))',
              borderRadius: 'var(--amp-radius-panel) var(--amp-radius-panel) 0 0',
              border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
              background: 'var(--amp-glass-raised)',
              backdropFilter: 'blur(var(--amp-glass-blur)) saturate(var(--amp-glass-saturate))',
              color: 'var(--amp-ink)',
            }}
          >
            <div className="flex items-center justify-between">
              <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}>
                Founder preview
              </p>
              <QuietLink icon="close" aria-label="Close" onClick={() => setOpen(false)}>
                {''}
              </QuietLink>
            </div>

            <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
              {rows.map((r) => (
                <li key={r.label} className="flex items-start" style={{ gap: 'var(--amp-space-3)' }}>
                  <span
                    className="shrink-0 uppercase"
                    style={{
                      marginTop: 'var(--amp-hairline)',
                      minWidth: 'calc(var(--amp-space-10) + var(--amp-space-2))',
                      textAlign: 'center',
                      padding: 'var(--amp-hairline) var(--amp-space-2)',
                      borderRadius: 'var(--amp-radius-chip)',
                      fontFamily: 'var(--amp-font-mono)',
                      fontSize: 'var(--amp-text-data)',
                      letterSpacing: 'var(--amp-tracking-data-tight)',
                      background: r.tone === 'on' ? 'var(--amp-go-fill)' : r.tone === 'off' ? 'var(--amp-caution-fill)' : 'var(--amp-accent-fill)',
                      color: r.tone === 'on' ? 'var(--amp-go)' : r.tone === 'off' ? 'var(--amp-caution)' : 'var(--amp-accent)',
                    }}
                  >
                    {r.tone === 'on' ? 'On' : r.tone === 'off' ? 'Off' : 'How'}
                  </span>
                  <span style={{ fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)' }}>
                    <strong style={{ fontWeight: 'var(--amp-weight-bold)' }}>{r.label}.</strong>{' '}
                    <span style={{ color: 'var(--amp-ink-2)' }}>{r.note}</span>
                  </span>
                </li>
              ))}
            </ul>

            <NextButton ready={!testing} nudge="Testing…" onClick={() => void test()}>
              <span className="inline-flex items-center" style={{ gap: 'var(--amp-space-2)' }}>
                <Glyph name="spark" size={18} /> {testing ? 'Testing the AI…' : 'Test the AI now'}
              </span>
            </NextButton>

            <div aria-live="polite">
              {health && <HealthResult health={health} />}
            </div>

            <QuietLink onClick={() => (window.location.href = '/founderhub/monitoring#consult')}>AI log and saved consults in the hub</QuietLink>
          </div>
        </div>
      )}
    </div>
  )
}

function HealthResult({ health }: { health: Health }) {
  const line = (label: string, c?: { ok: boolean; ms: number; detail: string }, target?: number) =>
    c && (
      <p style={{ fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)', color: c.ok ? 'var(--amp-ink)' : 'var(--amp-caution)' }}>
        <strong style={{ fontWeight: 'var(--amp-weight-bold)' }}>{label}:</strong> {c.ok ? 'working' : 'failed'} in {(c.ms / 1000).toFixed(1)}s
        {target && c.ok ? (c.ms <= target ? ' (inside the target of one and a half seconds)' : ' (slower than the target of one and a half seconds; the scripted words cover it)') : ''}. {c.detail}
      </p>
    )
  if (health.error) return <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-caution)' }}>{health.error}</p>
  if (!health.configured) {
    return (
      <p style={{ fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)', color: 'var(--amp-caution)' }}>
        No OPENAI_API_KEY on the server. Add it to the site’s environment variables and redeploy, then test again.
      </p>
    )
  }
  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
      {line(`Amp’s words (${health.model})`, health.wording, health.targetMs)}
      {line('Moderation', health.moderation)}
    </div>
  )
}
