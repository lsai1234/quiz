'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Notification } from '@/lib/notify/types'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'
const RED = '#ff6b6b'
const GREEN = '#34d399'

const TEMPLATE_LABEL: Record<string, string> = {
  'order-confirmation': 'Order confirmation',
  'subscription-confirmation': 'Subscription confirmation',
  'product-substituted': 'Product swapped',
  'product-removed': 'Product removed',
  'price-change-notice': 'Price change notice',
  'terms-updated': 'Terms updated',
  'payment-failed': 'Payment failed',
  'exit-receipt': 'Plan ended',
  'exit-charge-failed': 'Settlement failed',
  'exit-scheduled': 'Exit scheduled',
  'exit-return-requested': 'Return requested',
}

interface StreamSummary {
  id: string
  label: string
  purpose: string
  from: string
  replyTo: string | null
}

function templateLabel(template: string): string {
  return TEMPLATE_LABEL[template] ?? template
}

function when(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

function StatusPill({ status }: { status: Notification['status'] }) {
  const colour = status === 'sent' ? GREEN : status === 'failed' ? RED : AMBER
  const label = status === 'sent' ? 'Sent' : status === 'failed' ? 'Failed' : 'To send'
  return (
    <span
      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: colour, background: `color-mix(in srgb, ${colour} 14%, transparent)` }}
    >
      {label}
    </span>
  )
}

/**
 * The email itself, as the member will see it.
 *
 * Rendered in a sandboxed iframe rather than injected into the page: these are
 * full documents with their own backgrounds and table layouts, and dropping one
 * into the hub's DOM would both wreck the hub's styling and run whatever the
 * document contains. The sandbox is empty — no scripts, no same-origin — because
 * a preview needs to be *looked at*, not executed.
 */
function EmailPreview({ notification }: { notification: Notification }) {
  const [mode, setMode] = useState<'html' | 'text'>('html')
  return (
    <div>
      <div className="flex gap-2 mb-2">
        {(['html', 'text'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setMode(option)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg border"
            style={
              mode === option
                ? { background: ACCENT, color: '#001018', borderColor: 'transparent' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }
            }
          >
            {option === 'html' ? 'As designed' : 'Plain text'}
          </button>
        ))}
      </div>
      {mode === 'html' ? (
        <iframe
          title={`Preview of “${notification.rendered.subject}”`}
          srcDoc={notification.rendered.html}
          sandbox=""
          className="w-full rounded-xl border border-[var(--color-border)]"
          style={{ height: 520, background: '#fff' }}
        />
      ) : (
        <pre
          className="text-[11px] whitespace-pre-wrap rounded-xl p-3 overflow-x-auto"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-2)', fontFamily: 'inherit' }}
        >
          {notification.rendered.text}
        </pre>
      )}
    </div>
  )
}

/** Send a copy somewhere else, to see it land. Changes nothing on the row. */
function TestSend({ id, onSend }: { id: string; onSend: (id: string, to: string) => Promise<string> }) {
  const [to, setTo] = useState('')
  const [state, setState] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="you@getchrgd.co.uk"
        className="text-xs px-3 py-1.5 rounded-xl border bg-transparent"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      />
      <button
        onClick={async () => {
          setBusy(true)
          setState(await onSend(id, to))
          setBusy(false)
        }}
        disabled={busy || !to.includes('@')}
        className="text-xs font-bold px-3 py-1.5 rounded-xl border disabled:opacity-40"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
      >
        {busy ? 'Sending…' : 'Send me a copy'}
      </button>
      {state && (
        <span className="text-[11px]" style={{ color: state.startsWith('Sent') ? GREEN : RED }}>
          {state}
        </span>
      )}
    </div>
  )
}

/**
 * The emails waiting to go out, and a log of every one ever sent.
 *
 * Two jobs, deliberately on one page, because they are the same question asked
 * at two moments: "what does this customer still need to be told?" and "what
 * were they told, and when?".
 *
 * **To send** is a to-do list somebody is waiting on, and it should reach zero.
 * It works the same whether or not a mail provider is configured, which is the
 * point — you can start with no integration at all and add one later without
 * relearning anything:
 *
 *   • **No provider.** Copy the address, subject and body into your own inbox,
 *     send it, and tick it off. Nothing else needed.
 *   • **Provider configured.** A Send button appears on every row (and a Send
 *     all at the top). One click delivers it and marks it sent. The copy buttons
 *     stay — sometimes you want to send it yourself with a personal note.
 *
 * **Log** is the audit trail: every email, searchable by recipient and kind,
 * with what was in it, which address it left from, whether a provider confirmed
 * delivery or a person ticked it off by hand, and the reason for anything that
 * failed. It exists because "did we email them?" is a question that gets asked
 * in a dispute, and "I think so" is not an answer.
 */
export function Outbox() {
  const [tab, setTab] = useState<'queue' | 'log'>('queue')
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [total, setTotal] = useState(0)
  const [provider, setProvider] = useState<string>('manual')
  const [streams, setStreams] = useState<StreamSummary[]>([])
  const [canSend, setCanSend] = useState(false)
  const [autoSend, setAutoSend] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { copied, copy } = useCopy()

  // Log filters. Applied server-side so the log stays usable at ten thousand rows.
  const [logStatus, setLogStatus] = useState('')
  const [logTemplate, setLogTemplate] = useState('')
  const [logEmail, setLogEmail] = useState('')

  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (tab === 'log') {
      if (logStatus) params.set('status', logStatus)
      if (logTemplate) params.set('template', logTemplate)
      if (logEmail.trim()) params.set('email', logEmail.trim())
      params.set('limit', '200')
    }
    fetch(`/api/portal/notifications?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications ?? [])
        setTotal(d.total ?? 0)
        setProvider(d.provider ?? 'manual')
        setStreams(d.streams ?? [])
        setCanSend(Boolean(d.canSend))
        setAutoSend(Boolean(d.autoSend))
      })
      .catch(() => setNotifications([]))
  }, [tab, logStatus, logTemplate, logEmail])

  useEffect(() => {
    // Debounced so typing into the recipient box doesn't fire a request a
    // keystroke. The tab and the dropdowns come through the same path and are
    // barely delayed by it.
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  const act = useCallback(
    async (id: string, action: 'send' | 'markSent' | 'retry') => {
      setBusy(id)
      setNote(null)
      const res = await fetch('/api/portal/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [action]: id }),
      })
      const d = await res.json().catch(() => ({}))
      // A send that failed stays in the list with its reason on the row, so
      // surface it here too rather than letting the click look like a no-op.
      if (action === 'send' && d.ok === false) setNote(d.error ?? 'That one didn’t send — see the row for why.')
      load()
      setBusy(null)
    },
    [load],
  )

  const testSend = useCallback(async (id: string, to: string): Promise<string> => {
    const res = await fetch('/api/portal/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: id, to }),
    })
    const d = await res.json().catch(() => ({}))
    return d.ok ? `Sent to ${to}` : (d.error ?? 'That didn’t send.')
  }, [])

  const sendAll = useCallback(async () => {
    setBusy('all')
    setNote(null)
    const res = await fetch('/api/portal/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendAll: true }),
    })
    const d = await res.json().catch(() => ({}))
    setNote(
      d.failures?.length
        ? `Sent ${d.sent}. ${d.failures.length} didn’t go — they’re still in the list with the reason.`
        : `Sent ${d.sent}.`,
    )
    load()
    setBusy(null)
  }, [load])

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
            : autoSend
              ? `Sending automatically via ${provider}. Anything here needs a look.`
              : `Ready to send via ${provider} — press Send, or copy one out and send it yourself.`}
        </p>
        {note && (
          <p className="text-xs mt-1" style={{ color: ACCENT }}>
            {note}
          </p>
        )}
      </div>

      {/* ── Where each kind of email comes from ── */}
      {streams.length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border)] p-4" style={{ background: 'var(--color-surface)' }}>
          <h2 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-muted)' }}>
            Sending addresses
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {streams.map((stream) => (
              <div key={stream.id}>
                <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                  {stream.label}
                </p>
                <p className="text-[11px] break-all mt-0.5" style={{ color: ACCENT }}>
                  {stream.from}
                </p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{stream.purpose}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">
            {streams[0]?.replyTo
              ? `Replies to any of them go to ${streams[0].replyTo}.`
              : 'No reply-to address is set — set NOTIFY_REPLY_TO so a customer who replies reaches someone.'}
          </p>
        </section>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-[var(--color-border)]">
        {([
          ['queue', `To send${toSend.length > 0 && tab === 'queue' ? ` · ${toSend.length}` : ''}`],
          ['log', 'Log'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id)
              setExpanded(null)
              setNotifications(null)
            }}
            className="text-sm font-bold px-3 py-2 -mb-px border-b-2"
            style={{
              borderColor: tab === id ? ACCENT : 'transparent',
              color: tab === id ? 'var(--color-text)' : 'var(--color-muted)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'queue' ? (
        <>
          {/* ── To send ── */}
          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                To send{toSend.length > 0 ? ` · ${toSend.length}` : ''}
              </h2>
              <div className="flex gap-2">
                {toSend.length > 1 && (
                  <CopyButton
                    label={`Copy all ${toSend.length}`}
                    text={allAsText}
                    copyKey="all"
                    copied={copied}
                    onCopy={copy}
                  />
                )}
                {canSend && toSend.length > 1 && (
                  <button
                    onClick={sendAll}
                    disabled={busy !== null}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl disabled:opacity-40"
                    style={{ background: ACCENT, color: '#001018' }}
                  >
                    {busy === 'all' ? 'Sending…' : `Send all ${toSend.length}`}
                  </button>
                )}
              </div>
            </div>

            {toSend.length === 0 ? (
              <div className="rounded-2xl border border-[var(--color-border)] p-8 text-center" style={{ background: 'var(--color-surface)' }}>
                <p className="text-sm font-bold mb-1" style={{ color: GREEN, fontFamily: 'var(--font-display)' }}>
                  Nothing waiting
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  Every member with something to be told has been told.
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
                          {n.email} · {templateLabel(n.template)} · {when(n.createdAt)}
                        </p>
                        {n.from && (
                          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">From {n.from}</p>
                        )}
                        {n.error && (
                          <p className="text-[11px] mt-1" style={{ color: RED }}>
                            Failed to send: {n.error}
                          </p>
                        )}
                      </div>
                      <StatusPill status={n.status} />
                    </div>

                    {/* The body, always visible — you're about to send it, so read it. */}
                    <pre
                      className="mt-3 text-[11px] whitespace-pre-wrap rounded-xl p-3 overflow-x-auto"
                      style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-2)', fontFamily: 'inherit' }}
                    >
                      {n.rendered.text}
                    </pre>

                    <button
                      onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                      className="mt-2 text-[11px] font-bold underline"
                      style={{ color: 'var(--color-text-2)' }}
                    >
                      {expanded === n.id ? 'Hide the designed version' : 'See the designed version'}
                    </button>
                    {expanded === n.id && (
                      <div className="mt-3">
                        <EmailPreview notification={n} />
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      <CopyButton label="Copy address" text={n.email} copyKey={`${n.id}-to`} copied={copied} onCopy={copy} />
                      <CopyButton label="Copy subject" text={n.rendered.subject} copyKey={`${n.id}-subj`} copied={copied} onCopy={copy} />
                      <CopyButton
                        label="Copy message"
                        text={n.rendered.text}
                        copyKey={`${n.id}-body`}
                        copied={copied}
                        onCopy={copy}
                        primary={!canSend}
                      />

                      <div className="flex gap-2 ml-auto">
                        {/* With a provider configured this is the one-click path.
                            Copying stays available — sometimes you want to send it
                            yourself with a note attached. */}
                        {canSend && (
                          <button
                            onClick={() => act(n.id, 'send')}
                            disabled={busy !== null}
                            className="text-xs font-bold px-4 py-1.5 rounded-xl disabled:opacity-40"
                            style={{ background: ACCENT, color: '#001018' }}
                          >
                            {busy === n.id ? 'Sending…' : n.status === 'failed' ? '↻ Try again' : '→ Send email'}
                          </button>
                        )}
                        <button
                          onClick={() => act(n.id, 'markSent')}
                          disabled={busy !== null}
                          className="text-xs font-bold px-4 py-1.5 rounded-xl disabled:opacity-40"
                          style={
                            canSend
                              ? { border: '1px solid var(--color-border)', color: 'var(--color-text-2)' }
                              : { background: GREEN, color: '#00180e' }
                          }
                          title={canSend ? 'I sent this one myself' : undefined}
                        >
                          {busy === n.id && !canSend ? 'Saving…' : '✓ Mark as sent'}
                        </button>
                      </div>
                    </div>

                    {canSend && (
                      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                        <TestSend id={n.id} onSend={testSend} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Already sent ── */}
          {done.length > 0 && (
            <section>
              <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                Sent recently · {done.length}
              </h2>
              <div className="space-y-2">
                {done.map((n) => (
                  <div key={n.id} className="rounded-2xl border border-[var(--color-border)] p-4" style={{ background: 'var(--color-surface)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-text-2)] truncate">{n.rendered.subject}</p>
                        <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                          {n.email} · {when(n.sentAt ?? n.createdAt)}
                          {n.sentManually ? ' · sent by hand' : n.providerId ? ' · delivered' : ''}
                        </p>
                      </div>
                      <StatusPill status={n.status} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        /* ── The log ── */
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="search"
              value={logEmail}
              onChange={(e) => setLogEmail(e.target.value)}
              placeholder="Search recipient…"
              className="text-xs px-3 py-1.5 rounded-xl border bg-transparent flex-1 min-w-[180px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <select
              value={logTemplate}
              onChange={(e) => setLogTemplate(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border bg-transparent"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="">All kinds</option>
              {Object.entries(TEMPLATE_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={logStatus}
              onChange={(e) => setLogStatus(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border bg-transparent"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="">Any status</option>
              <option value="sent">Sent</option>
              <option value="queued">To send</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <p className="text-[11px] text-[var(--color-muted)] mb-2">
            {total === 0
              ? 'Nothing matches.'
              : `Showing ${notifications.length} of ${total}${total > notifications.length ? ' — narrow the search to see the rest' : ''}.`}
          </p>

          <div className="space-y-2">
            {notifications.map((n) => (
              <div key={n.id} className="rounded-2xl border border-[var(--color-border)]" style={{ background: 'var(--color-surface)' }}>
                <button
                  onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                  className="w-full text-left p-4 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                      {n.rendered.subject}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                      {n.email} · {templateLabel(n.template)} · {when(n.sentAt ?? n.createdAt)}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5 break-all">
                      {n.from ? `From ${n.from}` : 'From the default address'}
                      {/* The distinction is the whole point of keeping a log:
                          "a provider confirmed this" and "somebody said they
                          sent it" are different claims and must not blur. */}
                      {n.status === 'sent' &&
                        (n.sentManually
                          ? ' · sent by hand'
                          : n.providerId
                            ? ` · delivered (${n.providerId})`
                            : ' · delivery unconfirmed')}
                      {n.attempts > 1 ? ` · ${n.attempts} attempts` : ''}
                    </p>
                    {n.error && (
                      <p className="text-[11px] mt-1" style={{ color: RED }}>
                        {n.error}
                      </p>
                    )}
                  </div>
                  <StatusPill status={n.status} />
                </button>

                {expanded === n.id && (
                  <div className="px-4 pb-4 space-y-3">
                    <EmailPreview notification={n} />
                    <div className="flex flex-wrap gap-2">
                      <CopyButton label="Copy message" text={n.rendered.text} copyKey={`log-${n.id}`} copied={copied} onCopy={copy} />
                      {n.status === 'failed' && (
                        <button
                          onClick={() => act(n.id, 'retry')}
                          disabled={busy !== null}
                          className="text-xs font-bold px-3 py-1.5 rounded-xl border disabled:opacity-40"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
                        >
                          ↻ Put back in the queue
                        </button>
                      )}
                    </div>
                    {canSend && <TestSend id={n.id} onSend={testSend} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
