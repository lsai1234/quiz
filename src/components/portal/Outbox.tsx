'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Notification } from '@/lib/notify/types'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'
const RED = '#ff6b6b'
const GREEN = '#34d399'

const TEMPLATE_LABEL: Record<string, string> = {
  'product-substituted': 'Product swapped',
  'product-removed': 'Product removed',
  'price-change-notice': 'Price change notice',
  'terms-updated': 'Terms updated',
}

/** Copy to clipboard, with a two-second "copied" acknowledgement. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
    } catch {
      /* clipboard blocked — the text is on screen and selectable anyway */
    }
  }, [])
  return { copied, copy }
}

function CopyButton({
  label, text, copyKey, copied, onCopy, primary,
}: {
  label: string
  text: string
  copyKey: string
  copied: string | null
  onCopy: (key: string, text: string) => void
  primary?: boolean
}) {
  const done = copied === copyKey
  return (
    <button
      onClick={() => onCopy(copyKey, text)}
      className="text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors"
      style={
        primary
          ? { background: done ? GREEN : ACCENT, color: '#001018', borderColor: 'transparent' }
          : { borderColor: done ? GREEN : 'var(--color-border)', color: done ? GREEN : 'var(--color-text-2)' }
      }
    >
      {done ? '✓ Copied' : label}
    </button>
  )
}

/**
 * The emails waiting to go out, and the ones already sent.
 *
 * Sending is a person's job by default: no mail provider, no API key, no domain
 * verification. Everything the system decides to tell a member is written here
 * in full, and a founder copies it into their own inbox and ticks it off. So
 * this page is built for that — the address, the subject and the body each have
 * their own copy button, and "Mark as sent" is the biggest thing on the row.
 *
 * The distinction between the two lists is the whole point: **To send** is a
 * to-do list a member is waiting on. It should reach zero.
 */
export function Outbox() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [provider, setProvider] = useState<string>('manual')
  const [busy, setBusy] = useState<string | null>(null)
  const { copied, copy } = useCopy()

  const load = useCallback(() => {
    fetch('/api/portal/notifications')
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications ?? [])
        setProvider(d.provider ?? 'manual')
      })
      .catch(() => setNotifications([]))
  }, [])

  useEffect(() => load(), [load])

  const act = useCallback(
    async (id: string, action: 'markSent' | 'retry') => {
      setBusy(id)
      await fetch('/api/portal/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [action]: id }),
      })
      load()
      setBusy(null)
    },
    [load],
  )

  const { toSend, done } = useMemo(() => {
    const all = notifications ?? []
    return {
      toSend: all.filter((n) => n.status !== 'sent'),
      done: all.filter((n) => n.status === 'sent'),
    }
  }, [notifications])

  /** Everything outstanding as one block, for pasting into a doc or a mail merge. */
  const allAsText = useMemo(
    () =>
      toSend
        .map((n) => `To: ${n.email}\nSubject: ${n.rendered.subject}\n\n${n.rendered.text}`)
        .join('\n\n———————————————\n\n'),
    [toSend],
  )

  if (!notifications) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const manual = provider === 'manual'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Member emails
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          {manual
            ? 'Written for you to send. Copy each one into your email, send it, then mark it as sent.'
            : `Sending automatically via ${provider}.`}
        </p>
      </div>

      {/* ── To send ── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            To send{toSend.length > 0 ? ` · ${toSend.length}` : ''}
          </h2>
          {toSend.length > 1 && (
            <CopyButton
              label={`Copy all ${toSend.length}`}
              text={allAsText}
              copyKey="all"
              copied={copied}
              onCopy={copy}
            />
          )}
        </div>

        {toSend.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] p-8 text-center" style={{ background: 'var(--color-surface)' }}>
            <p className="text-sm font-bold mb-1" style={{ color: GREEN, fontFamily: 'var(--font-display)' }}>
              Nothing waiting
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              Every member whose plan changed has been told.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {toSend.map((n) => (
              <div
                key={n.id}
                className="rounded-2xl border p-4"
                style={{
                  background: 'var(--color-surface)',
                  borderColor:
                    n.status === 'failed'
                      ? `color-mix(in srgb, ${RED} 40%, transparent)`
                      : `color-mix(in srgb, ${AMBER} 35%, transparent)`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                      {n.rendered.subject}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                      {n.email} · {TEMPLATE_LABEL[n.template] ?? n.template} ·{' '}
                      {new Date(n.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {n.error && (
                      <p className="text-[11px] mt-1" style={{ color: RED }}>
                        Failed to send: {n.error}
                      </p>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{
                      color: n.status === 'failed' ? RED : AMBER,
                      background: `color-mix(in srgb, ${n.status === 'failed' ? RED : AMBER} 14%, transparent)`,
                    }}
                  >
                    {n.status === 'failed' ? 'Failed' : 'To send'}
                  </span>
                </div>

                {/* The body, always visible — you're about to send it, so read it. */}
                <pre
                  className="mt-3 text-[11px] whitespace-pre-wrap rounded-xl p-3 overflow-x-auto"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-2)', fontFamily: 'inherit' }}
                >
                  {n.rendered.text}
                </pre>

                <div className="mt-3 flex flex-wrap gap-2 items-center">
                  <CopyButton label="Copy address" text={n.email} copyKey={`${n.id}-to`} copied={copied} onCopy={copy} />
                  <CopyButton label="Copy subject" text={n.rendered.subject} copyKey={`${n.id}-subj`} copied={copied} onCopy={copy} />
                  <CopyButton label="Copy message" text={n.rendered.text} copyKey={`${n.id}-body`} copied={copied} onCopy={copy} primary />

                  <button
                    onClick={() => act(n.id, 'markSent')}
                    disabled={busy !== null}
                    className="text-xs font-bold px-4 py-1.5 rounded-xl ml-auto disabled:opacity-40"
                    style={{ background: GREEN, color: '#00180e' }}
                  >
                    {busy === n.id ? 'Saving…' : '✓ Mark as sent'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Already sent ── */}
      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            Sent · {done.length}
          </h2>
          <div className="space-y-2">
            {done.map((n) => (
              <div key={n.id} className="rounded-2xl border border-[var(--color-border)] p-4" style={{ background: 'var(--color-surface)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text-2)] truncate">{n.rendered.subject}</p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                      {n.email} ·{' '}
                      {new Date(n.sentAt ?? n.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {n.sentManually ? ' · sent by hand' : ''}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ color: GREEN, background: `color-mix(in srgb, ${GREEN} 14%, transparent)` }}
                  >
                    Sent
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
