'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Notification } from '@/lib/notify/types'


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
  'password-reset': 'Password reset link',
  'password-changed': 'Password changed',
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
          ? { background: done ? 'var(--tone-positive)' : 'var(--accent)', color: 'var(--ink-on-accent)', borderColor: 'transparent' }
          : { borderColor: done ? 'var(--tone-positive)' : 'var(--edge)', color: done ? 'var(--tone-positive)' : 'var(--ink-2)' }
      }
    >
      {done ? '✓ Copied' : label}
    </button>
  )
}

function StatusPill({ status }: { status: Notification['status'] }) {
  const colour = status === 'sent' ? 'var(--tone-positive)' : status === 'failed' ? 'var(--tone-critical)' : 'var(--tone-attention)'
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
                ? { background: 'var(--accent)', color: 'var(--ink-on-accent)', borderColor: 'transparent' }
                : { borderColor: 'var(--edge)', color: 'var(--ink-2)' }
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
          className="w-full rounded-xl border border-[var(--edge)]"
          style={{ height: 520, background: '#fff' }}
        />
      ) : (
        <pre
          className="text-[11px] whitespace-pre-wrap rounded-xl p-3 overflow-x-auto"
          style={{ background: 'var(--surface-2)', color: 'var(--ink-2)', fontFamily: 'inherit' }}
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
        style={{ borderColor: 'var(--edge)', color: 'var(--ink-1)' }}
      />
      <button
        onClick={async () => {
          setBusy(true)
          setState(await onSend(id, to))
          setBusy(false)
        }}
        disabled={busy || !to.includes('@')}
        className="text-xs font-bold px-3 py-1.5 rounded-xl border disabled:opacity-40"
        style={{ borderColor: 'var(--edge)', color: 'var(--ink-2)' }}
      >
        {busy ? 'Sending…' : 'Send me a copy'}
      </button>
      {state && (
        <span className="text-[11px]" style={{ color: state.startsWith('Sent') ? 'var(--tone-positive)' : 'var(--tone-critical)' }}>
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
 * What lands in it depends on how much is configured, and the header says which
 * of the three you are on — because a founder who believes receipts are waiting
 * on them sends duplicates, and one who believes price notices go by themselves
 * sends nothing at all:
 *
 *   • **No provider.** Everything is here. Copy the address, subject and body
 *     into your own inbox, send it, and tick it off. Nothing else needed.
 *   • **Provider configured** (the usual state). Receipts have already gone by
 *     themselves and only appear here if sending failed. Everything that reports
 *     a decision we made — a swap, a price rise, a settlement — waits here with
 *     a Send button, because it is worth reading before several hundred people
 *     do. The copy buttons stay: sometimes you want to send it yourself with a
 *     personal note.
 *   • **Everything automatic.** Only failures appear.
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
  const [policy, setPolicy] = useState<'none' | 'confirmations' | 'all'>('none')
  const [canConnectGmail, setCanConnectGmail] = useState(false)
  const [gmailRedirectUri, setGmailRedirectUri] = useState('')
  const [gmailClientId, setGmailClientId] = useState<string | null>(null)
  const [appUrlSet, setAppUrlSet] = useState(true)
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
        setPolicy(d.autoSendPolicy ?? 'none')
        setCanConnectGmail(Boolean(d.canConnectGmail))
        setGmailRedirectUri(d.gmailRedirectUri ?? '')
        setGmailClientId(d.gmailClientId ?? null)
        setAppUrlSet(d.appUrlSet !== false)
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

  if (!notifications) return <p className="text-sm text-[var(--ink-3)]">Loading…</p>

  const manual = provider === 'manual'
  // "via resend" reads like a typo in a sentence; these are product names.
  const providerName = { resend: 'Resend', gmail: 'Gmail', mock: 'the mock sender' }[provider] ?? provider

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          Member emails
        </h1>
        {/* The one thing this page has to be unambiguous about: which of these
            somebody is still on the hook for. A founder who thinks receipts are
            waiting on them sends duplicates; one who thinks price notices go by
            themselves sends nothing at all. */}
        <p className="text-sm text-[var(--ink-3)]">
          {manual
            ? 'Nothing sends by itself yet — there is no email provider configured. Copy each one into your email, send it, then mark it as sent.'
            : policy === 'all'
              ? `Everything sends automatically via ${providerName}. Anything still listed below needs a look.`
              : policy === 'confirmations'
                ? `Order and subscription receipts send themselves via ${providerName} and are logged. Everything below is waiting on you.`
                : `Ready to send via ${providerName} — press Send, or copy one out and send it yourself.`}
        </p>
        {policy === 'confirmations' && (
          <p className="text-xs mt-1 text-[var(--ink-3)]">
            A receipt only appears in the list below if sending it failed.
          </p>
        )}
        {note && (
          <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>
            {note}
          </p>
        )}
      </div>

      {/* ── Nothing can send yet, but Workspace is right there ── */}
      {manual && canConnectGmail && (
        <section
          className="rounded-2xl border p-4"
          style={{ background: 'var(--surface-1)', borderColor: `var(--accent-line)` }}
        >
          <p className="text-sm font-bold mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
            Send through your own Google Workspace
          </p>
          <p className="text-xs text-[var(--ink-3)] mb-3">
            No third-party service and nothing more to pay for — Workspace allows 2,000 emails a day, which is far
            past what this needs. The permission it asks for can send email and cannot read your inbox.
          </p>

          {/* Google matches the callback address byte for byte against a list you
              register in advance, and refuses with `redirect_uri_mismatch`
              otherwise — which is where everybody's first attempt ends. The
              address depends on APP_URL, so it cannot be written in a document;
              it has to be shown here, from the running deployment. */}
          <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink-1)' }}>
              First, in Google Cloud → APIs &amp; Services → Credentials
            </p>
            <p className="text-[11px] text-[var(--ink-3)] mb-2">
              Open your OAuth client and add this to <strong>Authorised redirect URIs</strong>, exactly as written —
              Google matches it character for character, and refuses with <em>redirect_uri_mismatch</em> if it is not
              already on the list.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code
                className="text-[11px] px-2 py-1 rounded-lg break-all"
                style={{ background: 'var(--surface-1)', color: 'var(--accent)' }}
              >
                {gmailRedirectUri || '…'}
              </code>
              <CopyButton
                label="Copy"
                text={gmailRedirectUri}
                copyKey="gmail-redirect"
                copied={copied}
                onCopy={copy}
              />
            </div>
            {gmailClientId && (
              <p className="text-[11px] text-[var(--ink-3)] mt-2">
                The client to edit is the one whose ID starts{' '}
                <code style={{ color: 'var(--ink-2)' }}>{gmailClientId.slice(0, 18)}…</code>
              </p>
            )}
            {!appUrlSet && (
              <p className="text-[11px] mt-2" style={{ color: 'var(--tone-attention)' }}>
                APP_URL is not set, so this address is guessed from whichever URL you are browsing — on Vercel that is
                a per-deployment address that changes on every push and can never stay registered. Set APP_URL to
                https://getchrgd.co.uk and redeploy before registering anything.
              </p>
            )}
            <p className="text-[11px] text-[var(--ink-3)] mt-2">
              Also enable the <strong>Gmail API</strong>{' '}for that project, under APIs &amp; Services → Library.
            </p>
          </div>

          <a
            href="/api/portal/gmail-connect"
            className="inline-block text-xs font-bold px-4 py-2 rounded-xl"
            style={{ background: 'var(--accent)', color: 'var(--ink-on-accent)' }}
          >
            Then connect Google Workspace
          </a>
        </section>
      )}

      {/* ── Where each kind of email comes from ── */}
      {streams.length > 0 && (
        <section className="rounded-2xl border border-[var(--edge)] p-4" style={{ background: 'var(--surface-1)' }}>
          <h2 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-3)' }}>
            Sending addresses
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {streams.map((stream) => (
              <div key={stream.id}>
                <p className="text-xs font-bold" style={{ color: 'var(--ink-1)' }}>
                  {stream.label}
                </p>
                <p className="text-[11px] break-all mt-0.5" style={{ color: 'var(--accent)' }}>
                  {stream.from}
                </p>
                <p className="text-[11px] text-[var(--ink-3)] mt-0.5">{stream.purpose}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--ink-3)] mt-3">
            {streams[0]?.replyTo
              ? `Replies to any of them go to ${streams[0].replyTo}.`
              : 'No reply-to address is set — set NOTIFY_REPLY_TO so a customer who replies reaches someone.'}
          </p>
          <p className="text-[11px] mt-1" style={{ color: policy === 'none' ? 'var(--ink-3)' : 'var(--tone-positive)' }}>
            {policy === 'all'
              ? 'Every kind of email is sending automatically.'
              : policy === 'confirmations'
                ? 'Order and subscription receipts send automatically. Everything else waits for you.'
                : 'Nothing is sending automatically — every email waits for you.'}
          </p>
        </section>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-[var(--edge)]">
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
              borderColor: tab === id ? 'var(--accent)' : 'transparent',
              color: tab === id ? 'var(--ink-1)' : 'var(--ink-3)',
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
              <h2 className="text-sm font-bold" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
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
                    style={{ background: 'var(--accent)', color: 'var(--ink-on-accent)' }}
                  >
                    {busy === 'all' ? 'Sending…' : `Send all ${toSend.length}`}
                  </button>
                )}
              </div>
            </div>

            {toSend.length === 0 ? (
              <div className="rounded-2xl border border-[var(--edge)] p-8 text-center" style={{ background: 'var(--surface-1)' }}>
                <p className="text-sm font-bold mb-1" style={{ color: 'var(--tone-positive)', fontFamily: 'var(--font-display)' }}>
                  Nothing waiting
                </p>
                <p className="text-xs text-[var(--ink-3)]">
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
                      background: 'var(--surface-1)',
                      borderColor:
                        n.status === 'failed'
                          ? `var(--critical-line)`
                          : `var(--attention-line)`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                          {n.rendered.subject}
                        </p>
                        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                          {n.email} · {templateLabel(n.template)} · {when(n.createdAt)}
                        </p>
                        {n.from && (
                          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">From {n.from}</p>
                        )}
                        {n.error && (
                          <p className="text-[11px] mt-1" style={{ color: 'var(--tone-critical)' }}>
                            Failed to send: {n.error}
                          </p>
                        )}
                      </div>
                      <StatusPill status={n.status} />
                    </div>

                    {/* The body, always visible — you're about to send it, so read it. */}
                    <pre
                      className="mt-3 text-[11px] whitespace-pre-wrap rounded-xl p-3 overflow-x-auto"
                      style={{ background: 'var(--surface-2)', color: 'var(--ink-2)', fontFamily: 'inherit' }}
                    >
                      {n.rendered.text}
                    </pre>

                    <button
                      onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                      className="mt-2 text-[11px] font-bold underline"
                      style={{ color: 'var(--ink-2)' }}
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
                            style={{ background: 'var(--accent)', color: 'var(--ink-on-accent)' }}
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
                              ? { border: '1px solid var(--edge)', color: 'var(--ink-2)' }
                              : { background: 'var(--tone-positive)', color: 'var(--ink-on-accent)' }
                          }
                          title={canSend ? 'I sent this one myself' : undefined}
                        >
                          {busy === n.id && !canSend ? 'Saving…' : '✓ Mark as sent'}
                        </button>
                      </div>
                    </div>

                    {canSend && (
                      <div className="mt-3 pt-3 border-t border-[var(--edge)]">
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
              <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
                Sent recently · {done.length}
              </h2>
              <div className="space-y-2">
                {done.map((n) => (
                  <div key={n.id} className="rounded-2xl border border-[var(--edge)] p-4" style={{ background: 'var(--surface-1)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--ink-2)] truncate">{n.rendered.subject}</p>
                        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
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
              style={{ borderColor: 'var(--edge)', color: 'var(--ink-1)' }}
            />
            <select
              value={logTemplate}
              onChange={(e) => setLogTemplate(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border bg-transparent"
              style={{ borderColor: 'var(--edge)', color: 'var(--ink-1)' }}
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
              style={{ borderColor: 'var(--edge)', color: 'var(--ink-1)' }}
            >
              <option value="">Any status</option>
              <option value="sent">Sent</option>
              <option value="queued">To send</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <p className="text-[11px] text-[var(--ink-3)] mb-2">
            {total === 0
              ? 'Nothing matches.'
              : `Showing ${notifications.length} of ${total}${total > notifications.length ? ' — narrow the search to see the rest' : ''}.`}
          </p>

          <div className="space-y-2">
            {notifications.map((n) => (
              <div key={n.id} className="rounded-2xl border border-[var(--edge)]" style={{ background: 'var(--surface-1)' }}>
                <button
                  onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                  className="w-full text-left p-4 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink-1)' }}>
                      {n.rendered.subject}
                    </p>
                    <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                      {n.email} · {templateLabel(n.template)} · {when(n.sentAt ?? n.createdAt)}
                    </p>
                    <p className="text-[11px] text-[var(--ink-3)] mt-0.5 break-all">
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
                      <p className="text-[11px] mt-1" style={{ color: 'var(--tone-critical)' }}>
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
                          style={{ borderColor: 'var(--edge)', color: 'var(--ink-2)' }}
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
