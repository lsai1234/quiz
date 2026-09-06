'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Note } from '@/components/system'
import { markClaimingStarter } from '@/lib/partner-starter/handoff'
import type { Deliverable, StarterState } from '@/lib/partner-starter/types'

interface Starter {
  goodsCap: number
  expiresAt: string
  state: StarterState
}

interface Agreement {
  version: string
  text: string
  deliverables: Deliverable[]
}

/** What they signed, once they have. */
interface Signature {
  at: string
  name: string
  handle: string | null
}

/** Their order, in the four words a partner cares about. */
interface OrderStatus {
  reference: string
  placedAt: string
  stage: string
}

interface Payload {
  link?: 'dead' | 'live'
  linkExpiresAt?: string
  partnerName?: string
  partnerCode?: string | null
  hasPassword?: boolean
  starter: Starter | null
  signed?: Signature | null
  order?: OrderStatus | null
  agreement?: Agreement | null
}

const money = (n: number) => `£${n.toFixed(2)}`

/**
 * Their referral link.
 *
 * Built from the browser's own origin rather than a configured base URL, so it
 * is right on every environment without one more thing to set — the same way
 * the dashboard's `ShareLink` builds it.
 */
function shareLink(code: string): string {
  return typeof window === 'undefined' ? `/?ref=${code}` : `${window.location.origin}/?ref=${code}`
}

/**
 * A value with a Copy button — the code, and the link.
 *
 * One component rather than three copies of the same twenty lines, and one
 * place where "copied" is announced. `navigator.clipboard` is blocked in plenty
 * of contexts, so the field is selectable either way and the failure is silent
 * rather than a red box about something that does not matter.
 */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <p
        style={{
          fontSize: 'var(--text-micro)',
          fontWeight: 'var(--weight-strong)',
          letterSpacing: 'var(--tracking-eyebrow)',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {label}
      </p>
      <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
        <code
          style={{
            flex: 1,
            minWidth: 0,
            padding: 'var(--space-3)',
            borderRadius: 'var(--r-control)',
            background: 'var(--surface-2)',
            border: '1px solid var(--edge)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 'var(--text-body-sm)',
            color: 'var(--ink-1)',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            navigator.clipboard
              ?.writeText(value)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
              .catch(() => {
                /* clipboard blocked — the field is selectable, which is the fallback */
              })
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })


/**
 * How long is left on this link, in words somebody can act on.
 *
 * Days while there are days, hours once there are not, and "less than an hour"
 * at the end rather than a number that rounds to zero while the link still
 * works. The point is to prompt, not to be a clock.
 */
function timeLeft(iso: string, now = Date.now()): string | null {
  const ms = new Date(iso).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`
  return 'less than an hour left'
}

/** One line of the checklist. The tick is the whole point of the thing. */
function Step({
  n,
  title,
  done,
  locked,
  children,
}: {
  n: number
  title: string
  done?: boolean
  locked?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        paddingTop: 'var(--space-4)',
        opacity: locked ? 0.5 : 1,
      }}
    >
      <div
        aria-hidden
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          borderRadius: 'var(--r-pill, 999px)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 'var(--text-micro)',
          fontWeight: 'var(--weight-strong)',
          background: done ? 'var(--tone-positive)' : 'var(--surface-2)',
          color: done ? 'var(--ink-on-accent)' : 'var(--ink-3)',
          border: done ? 'none' : '1px solid var(--edge)',
        }}
      >
        {done ? '✓' : n}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          style={{
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-strong)',
            color: 'var(--ink-1)',
            textDecoration: done ? 'line-through' : undefined,
          }}
        >
          {title}
        </p>
        {children}
      </div>
    </div>
  )
}

/** Quieter text under a step. */
function StepNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 'var(--text-meta)',
        lineHeight: 'var(--leading-snug)',
        color: 'var(--ink-3)',
        marginTop: 'var(--space-1)',
      }}
    >
      {children}
    </p>
  )
}

interface Props {
  /**
   * An invite token, when this is being read by somebody with no account yet.
   *
   * The same panel serves both doors deliberately. A partner who taps the link
   * in a DM and one who signs in later are looking at the same three things;
   * two components would be two places for them to drift.
   *
   * With a token it talks to `/api/partner/claim`, which authenticates on the
   * token; without one, to `/api/partner/starter`, which uses the session.
   */
  token?: string
}

/**
 * A partner's stack: what they have, and what is left to do.
 *
 * ── Why this is a checklist and not a form ──────────────────────────────────
 * It was a form, and a form only knows one state: the thing it wants. So a
 * partner who had signed, claimed and ordered came back to their own link and
 * met the signing page again — or, once the starter was spent, a page telling
 * them there was no stack waiting. They had done everything, and the only screen
 * that was theirs said neither of those things back to them.
 *
 * The link is the one URL a partner keeps, so it has to be a place rather than a
 * step. Three things, in the order they happen, each showing its own state:
 * sign, claim, and get into the account. What is done is ticked and stays
 * ticked; what is next is the only thing asking for anything.
 *
 * ── Why the countdown is on step three ──────────────────────────────────────
 * The link expires, and everything they can still do with it goes at the same
 * moment. Setting a password is the one act that outlives it — do it and they
 * have an account; leave it and a week later they are messaging us for a new
 * link. A date they can see is the difference between those two.
 *
 * ── Why the agreement is only fetched when unsigned ─────────────────────────
 * The server sends the document only when there is something to sign, so this
 * screen cannot ask a second time even by mistake. See `/api/partner/claim`.
 */
export function StarterStack({ token }: Props = {}) {
  const endpoint = token ? `/api/partner/claim?token=${encodeURIComponent(token)}` : '/api/partner/starter'
  const postTo = token ? '/api/partner/claim' : '/api/partner/starter'

  const [data, setData] = useState<Payload | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(endpoint, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unauthorised'))))
      .then((d: Payload) => setData(d))
      .catch(() => {
        /* The panel does not appear. Nothing else on the page depends on it,
           and an error box about a stack they may not have been offered is
           noise. */
      })
      .finally(() => setLoaded(true))
  }, [endpoint])

  async function sign() {
    if (!data?.agreement) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(postTo, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedName: name, handle, version: data.agreement.version, token }),
      })
      const body: { ok?: boolean; error?: string; staleVersion?: boolean } = await res.json()
      if (!res.ok || !body.ok) {
        setError(body.error ?? 'That didn’t go through. Try again.')
        // The wording changed under them. Reloading is the honest fix: what
        // they are looking at is not what they would be signing.
        if (body.staleVersion) setTimeout(() => window.location.reload(), 2500)
        return
      }
      // Re-read rather than patch: the server now knows things this screen
      // does not — whether a session was opened, what the code is — and one
      // source of truth beats two that agree until they do not.
      const fresh = await fetch(endpoint, { cache: 'no-store' }).then((r) => r.json())
      setData(fresh as Payload)
    } catch {
      setError('Couldn’t reach us just then. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null

  /*
    A link that no longer resolves. On the dashboard (no token) there is no link
    to be dead, so this cannot be reached there.
  */
  if (data?.link === 'dead') {
    if (!token) return null
    return (
      <Card as="section" solid className="mb-4">
        <h2 style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          This link isn’t active any more
        </h2>
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>
          Links last a week, and are spent once a password has been set with one. If you already have an
          account you can sign in — otherwise send us a message and we will sort you out a new one.
        </p>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Button size="sm" variant="secondary" onClick={() => { window.location.href = '/partner' }}>
            Sign in
          </Button>
        </div>
      </Card>
    )
  }

  const starter = data?.starter ?? null

  /*
    A live link with nothing on it. Worth saying out loud rather than guessing
    at "expired": this is what a partner sees the moment they are re-added
    before a stack has been issued, and being told the wrong reason sends
    everybody looking in the wrong place.
  */
  if (!starter) {
    if (!token) return null
    return (
      <Card as="section" solid className="mb-4">
        <h2 style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          Your stack isn’t ready yet
        </h2>
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>
          Your link works, but there is no stack waiting on it just now. Give us a shout and we will get one
          on there for you.
        </p>
      </Card>
    )
  }

  const signed = data?.signed ?? null
  const order = data?.order ?? null
  const claimed = starter.state === 'used' || !!order
  const partnerCode = data?.partnerCode ?? null
  const left = data?.linkExpiresAt ? timeLeft(data.linkExpiresAt) : null

  return (
    <Card as="section" solid className="mb-4">
      <div className="flex items-start justify-between" style={{ gap: 'var(--space-3)' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
            Your stack, on us
          </h2>
          <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            {claimed
              ? 'Claimed. Here is where it is up to, and what to post.'
              : `Essentials or Balanced, both under ${money(starter.goodsCap)} of products, delivery included. Nothing to pay and no card needed.`}
          </p>
        </div>
        <Badge tone={claimed ? 'positive' : signed ? 'accent' : 'neutral'}>
          {claimed ? 'Done' : signed ? 'Ready' : 'Sign to unlock'}
        </Badge>
      </div>

      {/* ── Step 1 ── */}
      <Step n={1} title="Sign the agreement" done={!!signed}>
        {signed ? (
          <StepNote>
            Signed {day(signed.at)} as {signed.name}
            {signed.handle ? ` (${signed.handle})` : ''}.
          </StepNote>
        ) : (
          <SignForm
            agreement={data?.agreement ?? null}
            name={name}
            handle={handle}
            agreed={agreed}
            busy={busy}
            error={error}
            onName={setName}
            onHandle={setHandle}
            onAgreed={setAgreed}
            onSign={sign}
          />
        )}
      </Step>

      {/* ── Step 2 ── */}
      <Step n={2} title="Take the quiz and claim your stack" done={claimed} locked={!signed}>
        {claimed && order ? (
          <>
            <StepNote>
              {order.reference} · placed {day(order.placedAt)}
            </StepNote>
            <div style={{ marginTop: 'var(--space-2)' }}>
              <Badge tone={order.stage === 'Cancelled' ? 'critical' : 'accent'}>{order.stage}</Badge>
            </div>
          </>
        ) : signed ? (
          <>
            <StepNote>
              It builds you Essentials and Balanced — pick either. The whole order comes to £0.00, and there is
              no code to type.
            </StepNote>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button
                size="sm"
                iconRight="arrow-right"
                onClick={() => {
                  markClaimingStarter()
                  window.location.href = '/'
                }}
              >
                Claim my free stack
              </Button>
            </div>
          </>
        ) : (
          <StepNote>Sign above and this opens up.</StepNote>
        )}
      </Step>

      {/* ── Step 3 ── only where there is a link to set one WITH. */}
      {token && (
        <Step n={3} title="Set a password" done={data?.hasPassword === true}>
          {data?.hasPassword ? (
            <StepNote>Done — you can sign in at any time.</StepNote>
          ) : (
            <>
              <StepNote>
                So you can get back in to check what you have earned. This link is the only way in until you
                do{left ? `, and it has ${left}` : ''}.
              </StepNote>
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    window.location.href = `/partner/set-password?token=${encodeURIComponent(token)}`
                  }}
                >
                  Set a password
                </Button>
              </div>
            </>
          )}
        </Step>
      )}

      {/*
        ── The job they signed up for ──────────────────────────────────────────
        Their own code and link, once there is a signature to have earned them.
        The journey used to end on "here is your free stack" and go quiet about
        the work, leaving somebody who had just promised a TikTok and two
        stories with nothing to put in them.
      */}
      {signed && partnerCode && (
        <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--edge)' }}>
          <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
            What to post
          </p>
          <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            Your followers get 25% off with this code, and anyone who arrives on your link is credited to you
            for 30 days — whether or not they remember to type it.
          </p>
          <CopyRow label="Your code" value={partnerCode} />
          <CopyRow label="Your link" value={shareLink(partnerCode)} />
          <p style={{ fontSize: 'var(--text-micro)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-3)' }}>
            Ready-made story and post images, with your code already on them, are under{' '}
            <a href="/partner" style={{ color: 'var(--accent)' }}>Your assets</a>.
          </p>
        </div>
      )}
    </Card>
  )
}

/** The agreement and the box you put your name in. Step one, and only step one. */
function SignForm({
  agreement, name, handle, agreed, busy, error, onName, onHandle, onAgreed, onSign,
}: {
  agreement: Agreement | null
  name: string
  handle: string
  agreed: boolean
  busy: boolean
  error: string | null
  onName: (v: string) => void
  onHandle: (v: string) => void
  onAgreed: (v: boolean) => void
  onSign: () => void
}) {
  if (!agreement) return <StepNote>Loading the agreement…</StepNote>

  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <ul style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {agreement.deliverables.map((d) => (
          <li key={d.id} style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' }}>
            {d.text}
          </li>
        ))}
      </ul>

      {/* The document itself, in full. Scrollable rather than truncated — a
          "read more" on the thing being signed is the one place a fold is not
          acceptable. */}
      <pre
        style={{
          maxHeight: '18rem',
          overflowY: 'auto',
          padding: 'var(--space-3)',
          borderRadius: 'var(--r-card)',
          background: 'var(--surface-2)',
          border: '1px solid var(--edge)',
          fontSize: 'var(--text-micro)',
          lineHeight: 'var(--leading-relaxed)',
          color: 'var(--ink-2)',
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {agreement.text}
      </pre>

      <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
        <Input label="Your full name" value={name} onChange={(e) => onName(e.target.value)} placeholder="Alex Morgan" autoComplete="name" />
        <Input
          label="Where you'll post"
          value={handle}
          onChange={(e) => onHandle(e.target.value)}
          placeholder="@yourhandle"
          hint="The account the content is going on, so we know where to look for it."
        />
        <Checkbox
          checked={agreed}
          onChange={(e) => onAgreed(e.target.checked)}
          label="I've read the agreement above and I'm signing it."
        />
      </div>

      {error && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Note tone="critical">{error}</Note>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-4)' }}>
        <Button onClick={onSign} loading={busy} disabled={!agreed || name.trim().length < 3}>
          Sign and unlock my stack
        </Button>
      </div>
    </div>
  )
}
