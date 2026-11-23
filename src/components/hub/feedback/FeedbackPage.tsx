'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { Button, Note, Textarea, buttonSurface } from '@/components/system'
import { HubShell } from '@/components/hub/HubShell'
import { HubSignedOut } from '@/components/hub/HubSignedOut'
import { HubSkeleton } from '@/components/hub/HubSkeleton'
import { useHubStore } from '@/lib/hub-store'
import { FEEDBACK_MAX, FEEDBACK_MIN } from '@/lib/member-feedback/limits'

/**
 * /myhub/feedback: one open box for anything a member wants to tell us.
 *
 * Deliberately just that. No ratings, no categories, no star scores: those
 * answer the questions we thought to ask, and the point of this page is to hear
 * the ones we didn't. What's sent lands in the Founders Hub (Settings → Member
 * feedback), with who sent it, so a reply is possible.
 */
type Sending = 'idle' | 'sending' | 'sent'

export function FeedbackPage() {
  const session = useHubStore((s) => s.session)
  const hydrated = useHubStore((s) => s.hydrated)
  const hydrate = useHubStore((s) => s.hydrate)
  const logout = useHubStore((s) => s.logout)

  const [text, setText] = useState('')
  const [sending, setSending] = useState<Sending>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (!hydrated) {
    return (
      <HubShell>
        <HubSkeleton />
      </HubShell>
    )
  }
  if (!session) return <HubSignedOut />

  const ready = text.trim().length >= FEEDBACK_MIN && text.length <= FEEDBACK_MAX

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!ready || sending === 'sending') return
    setSending('sending')
    setError(null)
    try {
      const res = await fetch('/api/hub/member-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        setSending('sent')
        setText('')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(data.error ?? 'That didn’t send. Please try again.')
    } catch {
      setError('We couldn’t reach CHRGD just now. Check your connection and try again; what you wrote is still here.')
    }
    setSending('idle')
  }

  const back = buttonSurface('ghost', 'sm')
  return (
    <HubShell onSignOut={logout} nav="home">
      <div className="hub-back-top" style={{ marginBottom: 'var(--space-4)' }}>
        <Link href="/myhub" className={back.className} style={back.style} data-back-hub>
          ← Back to your hub
        </Link>
      </div>

      <div className="mx-auto max-w-2xl" data-feedback-page style={{ display: 'grid', gap: 'var(--space-5)' }}>
        <header style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <h1
            style={{
              fontSize: 'var(--text-title)',
              fontWeight: 'var(--weight-display)',
              fontFamily: 'var(--font-display)',
              lineHeight: 'var(--leading-tight)',
              color: 'var(--ink-1)',
            }}
          >
            Tell us what you think
          </h1>
          <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)' }}>
            Anything at all: what you like, what’s missing, what got in your way. We read every message, and what you tell us decides what we change next.
          </p>
        </header>

        {sending === 'sent' ? (
          <div style={{ display: 'grid', gap: 'var(--space-3)', justifyItems: 'start' }} data-feedback-sent>
            <Note tone="positive" icon="check" live="polite">
              Thank you. It’s with us now, and we read every one.
            </Note>
            <Button variant="secondary" size="sm" onClick={() => setSending('idle')}>
              Send something else
            </Button>
          </div>
        ) : (
          <form onSubmit={send} style={{ display: 'grid', gap: 'var(--space-3)', justifyItems: 'start' }} noValidate>
            <div style={{ width: '100%' }}>
              <Textarea
                label="Your feedback"
                rows={7}
                maxLength={FEEDBACK_MAX}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  if (error) setError(null)
                }}
                hint={`${text.length} of ${FEEDBACK_MAX} characters`}
                error={error ?? undefined}
              />
            </div>
            <Button type="submit" variant="primary" icon="send" loading={sending === 'sending'} disabled={!ready}>
              Send feedback
            </Button>
          </form>
        )}

        {/* Said before they send, not after: who will see it, and that it isn't anonymous. */}
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' }}>
          The CHRGD team sees your message with your name and email address, so we can reply if it helps. It’s kept until you delete your account.
        </p>
      </div>
    </HubShell>
  )
}

/** The way to the feedback page from the hub's home. */
export function FeedbackLink() {
  const surface = buttonSurface('secondary', 'sm')
  return (
    <Link href="/myhub/feedback" className={surface.className} style={{ ...surface.style, justifySelf: 'start' }} data-feedback-link>
      Tell us what you think
    </Link>
  )
}
