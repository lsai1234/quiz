'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ConsultRoot } from '../ConsultRoot'
import { GLYPH_NAMES, Glyph } from '../Glyph'
import { STORIES } from './stories'

/**
 * The consult workshop (build S4).
 *
 * Every token, every glyph, and each scene rendered on its own with fake
 * answers — so a scene can be built and reviewed in isolation before it is
 * wired into the flow. Lives at `/styleguide/consult`, next to the design
 * system's own styleguide, rather than in a separate Storybook: same dev
 * server, same fonts, same tokens, nothing extra to install or keep in step.
 *
 * Stories are registered in `stories.tsx`. Adding a scene means adding a story
 * there; this page lists whatever is registered.
 */

const COLOURS = ['ground', 'volt', 'calm', 'ink', 'ink-2', 'ink-3', 'sun', 'caution', 'go', 'glass-solid'] as const
const TINTS = ['volt', 'calm', 'sun', 'caution', 'go'] as const
const TYPE: [string, string, string, string][] = [
  ['Question', '--amp-font-display', '--amp-text-question', 'Map your training week'],
  ['Title', '--amp-font-display', '--amp-text-title', 'Fully charged'],
  ['Lead', '--amp-font-body', '--amp-text-lead', 'Tap a day to cycle through rest, gym, cardio and sport.'],
  ['Body', '--amp-font-body', '--amp-text-body', 'Tap a day to cycle through rest, gym, cardio and sport.'],
  ['Meta', '--amp-font-body', '--amp-text-meta', 'Pick up to three. The order you tap sets the priority.'],
  ['Data', '--amp-font-mono', '--amp-text-data', '4 / 12 · TRAINING · 38%'],
]
const RADII = ['chip', 'tile', 'panel', 'pill'] as const
const SPACES = [1, 2, 3, 4, 5, 6, 8, 10] as const

export function ConsultWorkshop() {
  const [mode, setMode] = useState<'charge' | 'calm'>('charge')
  const [comfort, setComfort] = useState(false)
  const [story, setStory] = useState<string>(STORIES[0]?.id ?? '')
  const active = STORIES.find((s) => s.id === story)

  return (
    <ConsultRoot mode={mode} comfort={comfort}>
      <div className="mx-auto w-full" style={{ maxWidth: '72rem', padding: 'var(--amp-space-6) var(--amp-gutter)' }}>
        <header className="flex flex-wrap items-end justify-between" style={{ gap: 'var(--amp-space-4)' }}>
          <div>
            <DataLine>Workshop · Amp Consult</DataLine>
            <h1 style={displayStyle('--amp-text-question')}>The consult, in pieces</h1>
          </div>
          <div className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
            <Toggle on={mode === 'calm'} onClick={() => setMode(mode === 'calm' ? 'charge' : 'calm')}>
              Calm mode
            </Toggle>
            <Toggle on={comfort} onClick={() => setComfort(!comfort)}>
              Comfort mode
            </Toggle>
          </div>
        </header>

        <Section title="Scenes" note="Each scene on its own, with fake answers.">
          <div className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
            {STORIES.map((s) => (
              <Toggle key={s.id} on={s.id === story} onClick={() => setStory(s.id)}>
                {s.title}
              </Toggle>
            ))}
          </div>
          {active && (
            <div
              key={active.id}
              className="relative mx-auto overflow-hidden"
              style={{
                marginTop: 'var(--amp-space-4)',
                maxWidth: '24.375rem',
                borderRadius: 'var(--amp-radius-panel)',
                border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
                // A phone-sized frame. The scene inside sizes itself to the
                // viewport, so the frame sets that height for it.
                ['--app-height' as string]: '52.75rem',
              }}
            >
              {active.render()}
            </div>
          )}
        </Section>

        <Section title="Colour" note="Warm colours only where they carry meaning.">
          <div className="grid grid-cols-2 sm:grid-cols-5" style={{ gap: 'var(--amp-space-3)' }}>
            {COLOURS.map((c) => (
              <Swatch key={c} token={`--amp-${c}`} />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5" style={{ gap: 'var(--amp-space-3)', marginTop: 'var(--amp-space-4)' }}>
            {TINTS.map((t) => (
              <div key={t} className="flex flex-col" style={{ gap: 'var(--amp-space-1)' }}>
                {(['fill', 'line', 'glow'] as const).map((k) => (
                  <div
                    key={k}
                    style={{
                      padding: 'var(--amp-space-2) var(--amp-space-3)',
                      borderRadius: 'var(--amp-radius-chip)',
                      background: `var(--amp-${t}-${k})`,
                      fontFamily: 'var(--amp-font-mono)',
                      fontSize: 'var(--amp-text-data)',
                      color: 'var(--amp-ink)',
                    }}
                  >
                    --amp-{t}-{k}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Surfaces" note="Glass for panels, solid for rows inside anything that scrolls.">
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 'var(--amp-space-3)' }}>
            {(['glass', 'glass-raised', 'glass-solid'] as const).map((s) => (
              <div
                key={s}
                style={{
                  padding: 'var(--amp-space-5)',
                  borderRadius: 'var(--amp-radius-panel)',
                  background: `var(--amp-${s})`,
                  border: 'var(--amp-hairline) solid var(--amp-edge)',
                  backdropFilter: s === 'glass-solid' ? undefined : 'blur(var(--amp-glass-blur)) saturate(var(--amp-glass-saturate))',
                }}
              >
                <DataLine>--amp-{s}</DataLine>
                <p style={{ color: 'var(--amp-ink)' }}>Ink</p>
                <p style={{ color: 'var(--amp-ink-2)' }}>Ink 2</p>
                <p style={{ color: 'var(--amp-ink-3)' }}>Ink 3</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type" note="Big Shoulders Display · IBM Plex Sans · IBM Plex Mono">
          <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }}>
            {TYPE.map(([role, face, size, sample]) => (
              <div key={role} className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] items-baseline" style={{ gap: 'var(--amp-space-3)' }}>
                <DataLine>{role}</DataLine>
                <p
                  className={face === '--amp-font-display' || face === '--amp-font-mono' ? 'uppercase' : ''}
                  style={{
                    fontFamily: `var(${face})`,
                    fontSize: `var(${size})`,
                    fontWeight: face === '--amp-font-display' ? 'var(--amp-weight-heavy)' : 'var(--amp-weight-regular)',
                    lineHeight: face === '--amp-font-display' ? 'var(--amp-leading-question)' : 'var(--amp-leading-body)',
                    letterSpacing: face === '--amp-font-mono' ? 'var(--amp-tracking-data)' : undefined,
                  }}
                >
                  {sample}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Glyphs" note="Checked at 16, 24 and 48px.">
          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8" style={{ gap: 'var(--amp-space-3)' }}>
            {GLYPH_NAMES.map((name) => (
              <div
                key={name}
                className="flex flex-col items-center"
                style={{
                  gap: 'var(--amp-space-2)',
                  padding: 'var(--amp-space-3)',
                  borderRadius: 'var(--amp-radius-tile)',
                  background: 'var(--amp-glass-solid)',
                  color: 'var(--amp-ink)',
                }}
              >
                <div className="flex items-end" style={{ gap: 'var(--amp-space-2)' }}>
                  <Glyph name={name} size={16} />
                  <Glyph name={name} size={24} />
                  <Glyph name={name} size={48} className="hidden sm:block" />
                </div>
                <DataLine>{name}</DataLine>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Shape & space" note="Radii and the spacing scale.">
          <div className="flex flex-wrap" style={{ gap: 'var(--amp-space-4)' }}>
            {RADII.map((r) => (
              <div key={r} className="flex flex-col items-center" style={{ gap: 'var(--amp-space-2)' }}>
                <div
                  style={{
                    width: 'var(--amp-space-10)',
                    height: 'var(--amp-space-10)',
                    borderRadius: `var(--amp-radius-${r})`,
                    border: 'var(--amp-hairline) solid var(--amp-accent-line)',
                    background: 'var(--amp-accent-fill)',
                  }}
                />
                <DataLine>{r}</DataLine>
              </div>
            ))}
          </div>
          <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)', marginTop: 'var(--amp-space-5)' }}>
            {SPACES.map((s) => (
              <div key={s} className="flex items-center" style={{ gap: 'var(--amp-space-3)' }}>
                <DataLine>--amp-space-{s}</DataLine>
                <div style={{ width: `var(--amp-space-${s})`, height: 'var(--amp-space-2)', background: 'var(--amp-accent)' }} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Motion" note="One spring. Scenes slide the way you are travelling.">
          <MotionDemo />
        </Section>
      </div>
    </ConsultRoot>
  )
}

function MotionDemo() {
  const [run, setRun] = useState<{ n: number; dir: 'forward' | 'back' }>({ n: 0, dir: 'forward' })
  return (
    <div className="flex flex-col items-start" style={{ gap: 'var(--amp-space-3)' }}>
      <div className="flex" style={{ gap: 'var(--amp-space-2)' }}>
        <Toggle on={false} onClick={() => setRun((r) => ({ n: r.n + 1, dir: 'back' }))}>
          ‹ Back
        </Toggle>
        <Toggle on={false} onClick={() => setRun((r) => ({ n: r.n + 1, dir: 'forward' }))}>
          Next ›
        </Toggle>
      </div>
      <div className="overflow-hidden" style={{ width: '100%', maxWidth: '20rem', borderRadius: 'var(--amp-radius-panel)', background: 'var(--amp-glass-solid)' }}>
        <div
          key={run.n}
          className={run.n === 0 ? '' : run.dir === 'forward' ? 'amp-anim-scene-forward' : 'amp-anim-scene-back'}
          style={{ padding: 'var(--amp-space-6)' }}
        >
          <DataLine>Scene {run.n + 1}</DataLine>
          <p style={displayStyle('--amp-text-title')}>Slides {run.dir === 'forward' ? 'in from the right' : 'in from the left'}</p>
        </div>
      </div>
    </div>
  )
}

function Swatch({ token }: { token: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  useEffect(() => {
    if (ref.current) setValue(getComputedStyle(ref.current).getPropertyValue(token).trim())
  }, [token])
  return (
    <div ref={ref} className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
      <div
        style={{
          height: 'var(--amp-space-10)',
          borderRadius: 'var(--amp-radius-tile)',
          background: `var(${token})`,
          border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
        }}
      />
      <DataLine>{token}</DataLine>
      <span style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', color: 'var(--amp-ink-2)' }}>{value}</span>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 'var(--amp-space-10)' }}>
      <h2 className="uppercase" style={displayStyle('--amp-text-title')}>
        {title}
      </h2>
      {note && <p style={{ color: 'var(--amp-ink-2)', fontSize: 'var(--amp-text-meta)', marginBottom: 'var(--amp-space-4)' }}>{note}</p>}
      {children}
    </section>
  )
}

function DataLine({ children }: { children: ReactNode }) {
  return (
    <span
      className="block uppercase"
      style={{
        fontFamily: 'var(--amp-font-mono)',
        fontSize: 'var(--amp-text-data)',
        letterSpacing: 'var(--amp-tracking-data)',
        color: 'var(--amp-ink-3)',
      }}
    >
      {children}
    </span>
  )
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="amp-press"
      style={{
        minHeight: 'var(--amp-space-10)',
        padding: '0 var(--amp-space-4)',
        borderRadius: 'var(--amp-radius-pill)',
        border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent)' : 'var(--amp-edge-strong)'}`,
        background: on ? 'var(--amp-accent-fill)' : 'var(--amp-glass-solid)',
        color: on ? 'var(--amp-accent)' : 'var(--amp-ink-2)',
        fontSize: 'var(--amp-text-meta)',
      }}
    >
      {children}
    </button>
  )
}

function displayStyle(size: string) {
  return {
    fontFamily: 'var(--amp-font-display)',
    fontWeight: 'var(--amp-weight-heavy)',
    fontSize: `var(${size})`,
    lineHeight: 'var(--amp-leading-question)',
    color: 'var(--amp-ink)',
  } as const
}
