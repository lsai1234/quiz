'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Note, Textarea, buttonSurface } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { MEMBER_MAX, TRAINER_COPY as C } from '@/lib/trainer/copy'
import type { MemberTrainerView } from '@/lib/trainer/types'
import { body, col, eyebrow, meta, strong } from '../home/ui'
import { RealBadge, TrainerAvatar, when } from './TrainerBits'

/**
 * Ask your trainer: who they are, the conversation so far, and a box to ask.
 *
 * The page says at every turn that a person answers: the badge, the line under
 * their name, the reply time they promise. A question can carry what it's
 * about (an exercise from their plan, from "Ask about this"); an answer can
 * carry a video. Questions go to the Founders Hub's inbox, never to an AI.
 */
export function TrainerChat() {
  const [view, setView] = useState<MemberTrainerView | null>(null)
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState('')
  const [about, setAbout] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    if (typeof fetch !== 'function') return
    fetch('/api/hub/trainer')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((v: MemberTrainerView) => setView(v))
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    load()
    // "Ask about this" from an exercise: /myhub/trainer?about=Barbell%20back%20squat
    const a = new URLSearchParams(window.location.search).get('about')
    if (a) setAbout(a.slice(0, 80))
    // A reply may have landed while they were elsewhere.
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [view?.messages.length])

  async function send() {
    setSending(true)
    setError(null)
    setSent(false)
    try {
      const res = await fetch('/api/hub/trainer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, about }) })
      if (res.ok) {
        setView((await res.json()) as MemberTrainerView)
        setText('')
        setAbout(null)
        setSent(true)
      } else {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error
        setError(code === 'limit' ? C.limit : code === 'too-long' ? C.tooLong(MEMBER_MAX) : code === 'closed' ? C.closed : C.failed)
      }
    } catch {
      setError(C.failed)
    } finally {
      setSending(false)
    }
  }

  if (failed) return <Note tone="critical">{C.failed}</Note>
  if (!view) return null
  if (!view.live || !view.trainer) {
    return (
      <Card padding="roomy">
        <p style={eyebrow}>{C.offTitle}</p>
        <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.offBody}</p>
      </Card>
    )
  }

  const t = view.trainer
  const over = text.length > MEMBER_MAX
  const canSend = view.open && view.left > 0 && text.trim().length > 0 && !over && !sending

  return (
    <div style={col('var(--stack)')} data-trainer-chat>
      {/* Who answers. */}
      <Card padding="roomy" glow="accent">
        <div className="flex items-start" style={{ gap: 'var(--space-4)' }}>
          <TrainerAvatar name={t.name} photoUrl={t.photoUrl} size={64} />
          <div className="min-w-0" style={{ flex: 1 }}>
            <p style={eyebrow}>{C.title}</p>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-display)',
                fontWeight: 'var(--weight-strong)',
                letterSpacing: 'var(--tracking-display)',
                lineHeight: 'var(--leading-tight)',
                color: 'var(--ink-1)',
                marginTop: 'var(--space-1)',
              }}
            >
              {t.name}
            </h1>
            <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{t.role}</p>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <RealBadge />
            </div>
            <p className="flex items-center" style={{ ...meta, gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
              <Icon name="clock" size={12} />
              {C.replyWithin(t.replyHours)}
            </p>
          </div>
        </div>
        <p style={{ ...strong, fontSize: 'var(--text-body-sm)', marginTop: 'var(--space-4)' }} data-trainer-real>
          {C.realLine(t.name)}
        </p>
        {t.bio && <p style={{ ...body, marginTop: 'var(--space-2)', whiteSpace: 'pre-line' }}>{t.bio}</p>}
        <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.intro(t.name)}</p>
      </Card>

      {/* The conversation. */}
      <section aria-label={C.title} style={col('var(--space-3)')} data-trainer-thread>
        {view.messages.length === 0 && (
          <Card padding="normal">
            <p style={body}>{C.empty}</p>
          </Card>
        )}
        {view.messages.map((m) =>
          m.from === 'member' ? (
            <div key={m.id} className="flex justify-end" data-message="member">
              <div style={{ maxWidth: '85%' }}>
                <div
                  style={{
                    background: 'var(--accent-fill)',
                    border: '1px solid var(--accent-line)',
                    borderRadius: 'var(--radius-card)',
                    borderBottomRightRadius: 'var(--space-1)',
                    padding: 'var(--space-3) var(--space-4)',
                  }}
                >
                  {m.about && <p style={{ ...meta, color: 'var(--accent)', fontWeight: 'var(--weight-strong)', marginBottom: 'var(--space-1)' }}>{C.about(m.about)}</p>}
                  <p style={{ ...body, color: 'var(--ink-1)', whiteSpace: 'pre-line' }}>{m.text}</p>
                </div>
                <p style={{ ...meta, textAlign: 'right', marginTop: 'var(--space-1)' }}>{`${C.you} · ${when(m.at)}`}</p>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-end" style={{ gap: 'var(--space-2)' }} data-message="trainer">
              <TrainerAvatar name={t.name} photoUrl={t.photoUrl} size={32} />
              <div style={{ maxWidth: '85%' }}>
                <div
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--edge)',
                    borderRadius: 'var(--radius-card)',
                    borderBottomLeftRadius: 'var(--space-1)',
                    padding: 'var(--space-3) var(--space-4)',
                  }}
                >
                  <p style={{ ...body, color: 'var(--ink-1)', whiteSpace: 'pre-line' }}>{m.text}</p>
                  {m.video && <VideoLink url={m.video.url} title={m.video.title} />}
                </div>
                <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{`${t.name} · ${when(m.at)}`}</p>
              </div>
            </div>
          ),
        )}
        {view.waiting && (
          <p className="flex items-center" style={{ ...meta, gap: 'var(--space-2)' }} data-trainer-waiting>
            <Icon name="clock" size={12} />
            {`${C.waiting(t.name)} · ${C.replyWithin(t.replyHours)}`}
          </p>
        )}
        <div ref={endRef} />
      </section>

      {/* Ask. */}
      {view.open ? (
        <Card padding="normal" elevation={2}>
          <div style={col('var(--space-3)')} data-trainer-composer>
            {view.messages.length === 0 && !text && (
              <div>
                <p style={{ ...meta, marginBottom: 'var(--space-2)' }}>{C.starterLabel}</p>
                <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                  {C.starters.map((q) => (
                    <Button key={q} variant="secondary" size="sm" onClick={() => setText(q)}>
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {about && (
              <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
                <Badge tone="accent">{C.about(about)}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setAbout(null)}>
                  {C.clearAbout}
                </Button>
              </div>
            )}
            <Textarea
              label={C.composerLabel}
              placeholder={C.placeholder}
              rows={4}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setSent(false)
              }}
              error={over ? C.tooLong(MEMBER_MAX) : undefined}
              hint={`${text.length}/${MEMBER_MAX} · ${view.left > 0 ? C.left(view.left) : C.limit}`}
            />
            {error && (
              <Note tone="critical" live="assertive">
                {error}
              </Note>
            )}
            {sent && (
              <Note tone="positive" live="polite">
                {C.sent}
              </Note>
            )}
            <Button variant="primary" size="lg" fullWidth icon="send" disabled={!canSend} loading={sending} onClick={() => void send()} data-trainer-send>
              {sending ? C.sending : C.send}
            </Button>
            <p style={meta}>{C.medical}</p>
          </div>
        </Card>
      ) : (
        <Note tone="attention">{C.closed}</Note>
      )}
    </div>
  )
}

function VideoLink({ url, title }: { url: string; title: string | null }) {
  const link = buttonSurface('secondary', 'sm')
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <a href={url} target="_blank" rel="noopener noreferrer" className={link.className} style={link.style} data-trainer-video>
        <Icon name="play" size={14} />
        {title ? `${C.video}: ${title}` : C.video}
      </a>
    </div>
  )
}
