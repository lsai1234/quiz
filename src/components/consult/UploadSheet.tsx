'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { AMP_SCAN } from '@/lib/consult/motion'
import { downscale } from './downscale'
import { Glyph } from './Glyph'
import { NextButton, QuietLink } from './controls'

/**
 * The upload sheet shared by the shelf scan (U1) and the tracker read (U2).
 *
 *   1. what to photograph (and, for a tracker, which app)
 *   2. an explicit tick: this image is sent to be read, once, then dropped
 *   3. the photo, shrunk in the browser, with a scanning beam while it's read
 *   4. what was found, as cards — each can be removed with one tap
 *   5. "Use these": only now does anything change
 */

export interface UploadCard {
  key: string
  label: string
}

interface Props {
  title: string
  /** What to photograph, and any choice before it (the tracker's app). */
  children: ReactNode
  /** Whether the choices above are made, so an upload makes sense. */
  ready?: boolean
  consent: string
  read: (image: string) => Promise<UploadCard[] | null>
  onConfirm: (keys: string[]) => void
  onClose: () => void
  onReading: (reading: boolean) => void
  /** Injectable for tests: jsdom has no canvas. */
  shrink?: (file: File) => Promise<string>
}

export function UploadSheet({ title, children, ready = true, consent, read, onConfirm, onClose, onReading, shrink = downscale }: Props) {
  const [agreed, setAgreed] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [cards, setCards] = useState<UploadCard[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const inputId = useId()

  async function onFile(file: File | undefined) {
    if (!file) return
    setMessage(null)
    setCards(null)
    try {
      const small = await shrink(file)
      setImage(small)
      setReading(true)
      onReading(true)
      const found = await read(small)
      setReading(false)
      onReading(false)
      if (!found) return setMessage('I couldn’t read that one. Try a clearer photo, or answer on screen as normal.')
      if (found.length === 0) return setMessage('I couldn’t find anything I recognise in that. You can answer on screen as normal.')
      setCards(found)
    } catch {
      setReading(false)
      onReading(false)
      setMessage('That image couldn’t be opened. Try another one.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: 'var(--amp-scrim)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="amp-anim-rise flex w-full flex-col"
        style={{
          maxWidth: 'var(--amp-column)',
          maxHeight: '92dvh',
          overflowY: 'auto',
          gap: 'var(--amp-space-3)',
          padding: 'var(--amp-space-5) var(--amp-gutter) max(var(--amp-space-5), env(safe-area-inset-bottom))',
          borderRadius: 'var(--amp-radius-panel) var(--amp-radius-panel) 0 0',
          border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
          background: 'var(--amp-glass-raised)',
          backdropFilter: 'blur(var(--amp-glass-blur)) saturate(var(--amp-glass-saturate))',
        }}
      >
        <div className="flex items-center justify-between">
          <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}>
            {title}
          </p>
          <QuietLink icon="close" aria-label="Close" onClick={onClose}>
            {''}
          </QuietLink>
        </div>

        {!cards && children}

        {!image && (
          <>
            <button type="button" role="checkbox" aria-checked={agreed} onClick={() => setAgreed(!agreed)} className="flex items-start text-left" style={{ gap: 'var(--amp-space-3)', minHeight: 'var(--amp-target)' }}>
              <span
                aria-hidden
                className="flex shrink-0 items-center justify-center"
                style={{
                  width: 'var(--amp-space-6)',
                  height: 'var(--amp-space-6)',
                  borderRadius: 'var(--amp-space-2)',
                  border: `var(--amp-hairline) solid ${agreed ? 'var(--amp-accent)' : 'var(--amp-ink-3)'}`,
                  background: agreed ? 'var(--amp-accent)' : 'transparent',
                  color: 'var(--amp-ink-on-accent)',
                }}
              >
                {agreed && <Glyph name="check" size={16} />}
              </span>
              <span style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>{consent}</span>
            </button>
            <input id={inputId} ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            <NextButton ready={agreed && ready} nudge={ready ? 'Tick the line above first.' : 'Pick your app first.'} onClick={() => input.current?.click()}>
              <span className="inline-flex items-center" style={{ gap: 'var(--amp-space-2)' }}>
                <Glyph name="camera" size={20} /> Take or choose a photo
              </span>
            </NextButton>
          </>
        )}

        {image && (
          <div className="relative overflow-hidden" style={{ borderRadius: 'var(--amp-radius-tile)', maxHeight: '40dvh' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Your upload" className="block w-full object-cover" style={{ maxHeight: '40dvh', opacity: reading ? 0.7 : 1 }} />
            {reading && (
              <span
                aria-hidden
                data-scan-beam
                className="absolute inset-x-0 top-0"
                style={{ height: '30%', background: 'linear-gradient(to bottom, transparent, var(--amp-accent-glow), transparent)', animation: AMP_SCAN }}
              />
            )}
          </div>
        )}

        <div aria-live="polite">
          {reading && <p style={{ color: 'var(--amp-ink-2)' }}>Amp is reading it…</p>}
          {message && <p style={{ color: 'var(--amp-caution)', fontSize: 'var(--amp-text-meta)' }}>{message}</p>}
        </div>

        {cards && cards.length > 0 && (
          <>
            <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}>
              Amp found
            </p>
            <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
              {cards.map((c) => (
                <li
                  key={c.key}
                  className="flex items-center"
                  style={{ gap: 'var(--amp-space-2)', padding: 'var(--amp-space-2) var(--amp-space-2) var(--amp-space-2) var(--amp-space-4)', borderRadius: 'var(--amp-radius-tile)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', background: 'var(--amp-accent-fill)' }}
                >
                  <span className="flex-1">{c.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${c.label}`}
                    onClick={() => setCards((all) => all?.filter((x) => x.key !== c.key) ?? null)}
                    className="amp-press flex items-center justify-center"
                    style={{ width: 'var(--amp-target)', height: 'var(--amp-target)', color: 'var(--amp-ink-2)' }}
                  >
                    <Glyph name="close" size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <NextButton
              onClick={() => {
                onConfirm(cards.map((c) => c.key))
                onClose()
              }}
            >
              Use these
            </NextButton>
          </>
        )}

        {(message || (cards && cards.length === 0)) && (
          <QuietLink
            onClick={() => {
              setImage(null)
              setCards(null)
              setMessage(null)
            }}
          >
            Try another photo
          </QuietLink>
        )}
      </div>
    </div>
  )
}
