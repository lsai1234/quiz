'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Notification } from '@/lib/notify/types'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'
const RED = '#ff6b6b'
const GREEN = '#34d399'

const STATUS_COLOUR: Record<string, string> = { sent: GREEN, queued: ACCENT, failed: RED }

const TEMPLATE_LABEL: Record<string, string> = {
  'product-substituted': 'Product swapped',
  'product-removed': 'Product removed',
  'price-change-notice': 'Price change notice',
  'terms-updated': 'Terms updated',
}

/**
 * Everything we've told members, and whether it actually reached them.
 *
 * The reason this is a page rather than a log line: in mock mode nothing leaves
 * the building, but the rows are real and carry the exact subject and body —
 * so this is how you check what members are being told before you ever plug in
 * a mail provider. It's also where a failed send is visible and retryable
 * instead of quietly lost.
 */
export function Outbox() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [provider, setProvider] = useState<string>('mock')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/notifications')
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications ?? [])
        setProvider(d.provider ?? 'mock')
      })
      .catch(() => setNotifications([]))
  }, [])

  useEffect(() => load(), [load])

  const retry = useCallback(
    async (id: string) => {
      setBusy(id)
      await fetch('/api/portal/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retry: id }),
      })
      load()
      setBusy(null)
    },
    [load],
  )

  const flush = useCallback(async () => {
    setBusy('flush')
    await fetch('/api/portal/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    load()
    setBusy(null)
  }, [load])

  if (!notifications) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const failed = notifications.filter((n) => n.status === 'failed').length
  const queued = notifications.filter((n) => n.status === 'queued').length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Member emails
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          {notifications.length} recent · {provider === 'mock' ? 'not actually sending (mock)' : 'sending via Resend'}
          {failed > 0 && ` · ${failed} failed`}
          {queued > 0 && ` · ${queued} waiting`}
        </p>
      </div>

      {provider === 'mock' && (
        <p className="text-[11px] rounded-xl px-3 py-2" style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)` }}>
          These are rendered and recorded but not delivered. Set <code>NOTIFY_SOURCE=resend</code> with an
          API key to send them for real.
        </p>
      )}

      {queued > 0 && (
        <button
          onClick={flush}
          disabled={busy !== null}
          className="text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-40"
          style={{ background: ACCENT, color: '#001018' }}
        >
          {busy === 'flush' ? 'Sending…' : `Send ${queued} waiting`}
        </button>
      )}

      {notifications.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)] py-8 text-center">Nothing sent yet.</p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl border p-4"
              style={{
                background: 'var(--color-surface)',
                borderColor: n.status === 'failed' ? `color-mix(in srgb, ${RED} 40%, transparent)` : 'var(--color-border)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--color-text)] truncate" style={{ fontFamily: 'var(--font-display)' }}>
                    {n.rendered.subject}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    {n.email} · {TEMPLATE_LABEL[n.template] ?? n.template} ·{' '}
                    {new Date(n.sentAt ?? n.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {n.attempts > 1 && ` · ${n.attempts} attempts`}
                  </p>
                  {n.error && (
                    <p className="text-[11px] mt-1" style={{ color: AMBER }}>
                      {n.error}
                    </p>
                  )}
                </div>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{
                    color: STATUS_COLOUR[n.status] ?? 'var(--color-muted)',
                    background: `color-mix(in srgb, ${STATUS_COLOUR[n.status] ?? '#888'} 14%, transparent)`,
                  }}
                >
                  {n.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setOpen(open === n.id ? null : n.id)}
                  className="text-xs font-semibold underline"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {open === n.id ? 'Hide' : 'Read it'}
                </button>
                {n.status === 'failed' && (
                  <button
                    onClick={() => retry(n.id)}
                    disabled={busy !== null}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border disabled:opacity-40"
                    style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT }}
                  >
                    {busy === n.id ? 'Retrying…' : 'Try again'}
                  </button>
                )}
              </div>

              {open === n.id && (
                <pre
                  className="mt-3 text-[11px] whitespace-pre-wrap rounded-xl p-3 overflow-x-auto"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-2)', fontFamily: 'inherit' }}
                >
                  {n.rendered.text}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
