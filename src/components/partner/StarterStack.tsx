'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Note } from '@/components/system'
import { markClaimingStarter } from '@/lib/partner-starter/handoff'
import type { Deliverable, StarterState } from '@/lib/partner-starter/types'

interface Starter {
  code: string | null
  goodsCap: number
  expiresAt: string
  state: StarterState
}

interface Agreement {
  version: string
  text: string
  deliverables: Deliverable[]
  signedAt: string | null
  signedName: string | null
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
 * A partner's own stack, free — and the agreement that turns it on.
 *
 * ── Why the signature is here and not in an email ───────────────────────────
 * Because the free box and the promise it is given for are the same
 * transaction, and separating them makes one of the two optional. A code sent
 * by email is spendable the moment it arrives; an agreement emailed alongside
 * it is a PDF somebody means to get round to. Here the code does not exist on
 * screen until the name is typed, which is the smallest possible version of
 * "signed first".
 *
 * ── Why the whole agreement is on the page ──────────────────────────────────
 * Not a link, not a modal, not a scroll box with a tick under it. It is a page
 * of plain text and it is short on purpose — a document nobody read is weak
 * evidence whatever it says, and the ones people actually read are the ones
 * that fit on the screen they are already looking at.
 *
 * ── Why it renders nothing when there is no starter ─────────────────────────
 * Most partners will not have one at any given moment, and a permanent empty
 * "your free stack" panel teaches everybody to ignore the place the real offer
 * eventually appears.
 */
interface Props {
  /**
   * An invite token, when this is being read by somebody with no account yet.
   *
   * The same panel serves both doors deliberately. A partner who taps the link
   * in a DM and one who signs in later are reading the same offer and signing
   * the same document; two components would be two places for that document to
   * drift.
   *
   * With a token it talks to `/api/partner/claim`, which authenticates on the
   * token; without one, to `/api/partner/starter`, which uses the session.
   */
  token?: string
}

export function StarterStack({ token }: Props = {}) {
  const endpoint = token ? `/api/partner/claim?token=${encodeURIComponent(token)}` : '/api/partner/starter'
  const postTo = token ? '/api/partner/claim' : '/api/partner/starter'

  const [starter, setStarter] = useState<Starter | null>(null)
  const [partnerCode, setPartnerCode] = useState<string | null>(null)
  const [agreement, setAgreement] = useState<Agreement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(endpoint, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unauthorised'))))
      .then((d: { starter: Starter | null; agreement?: Agreement; partnerCode?: string | null }) => {
        setStarter(d.starter)
        setAgreement(d.agreement ?? null)
        setPartnerCode(d.partnerCode ?? null)
      })
      .catch(() => {
        /* The panel simply does not appear. Nothing else on the page depends
           on it, and an error box about a stack they may not have been offered
           is noise. */
      })
      .finally(() => setLoaded(true))
  }, [endpoint])

  if (!loaded) return null

  /*
    Nothing to claim.

    On the dashboard (no token) this renders nothing at all — most partners have
    no starter waiting at any given moment, and a permanent empty "your free
    stack" panel teaches everybody to ignore the place the real offer appears.

    On the CLAIM page it has to say something. That page is a link somebody was
    sent, and when the link no longer resolves — expired after seven days, the
    stack already claimed, the partner account removed — the page rendered as a
    logo and one stray line about setting a password. It looked broken, which is
    the worst way to tell somebody their link is old.

    Deliberately vague about WHICH of those it was: the endpoint gives one answer
    to all of them on purpose, because the difference is only useful to somebody
    trying links. What it can do is say what to do next.
  */
  if (!starter || !agreement) {
    if (!token) return null
    return (
      <Card as="section" solid className="mb-4">
        <h2
          style={{
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-display)',
            fontFamily: 'var(--font-display)',
            color: 'var(--ink-1)',
          }}
        >
          This link isn’t active any more
        </h2>
        <p
          style={{
            fontSize: 'var(--text-meta)',
            lineHeight: 'var(--leading-snug)',
            color: 'var(--ink-3)',
            marginTop: 'var(--space-2)',
          }}
        >
          Either it has expired, or the stack on it has already been claimed. If you have an account with us,
          you can still get into it — otherwise send us a message and we will sort you out a new link.
        </p>
        <div style={{ marginTop: 'var(--space-4)' }}>
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
      </Card>
    )
  }

  async function sign() {
    if (!starter || !agreement) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(postTo, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedName: name, handle, version: agreement.version, token }),
      })
      const data: { ok?: boolean; code?: string; signedAt?: string; error?: string; staleVersion?: boolean } =
        await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That didn’t go through. Try again.')
        // The wording changed under them. Reloading is the honest fix: what
        // they are looking at is not what they would be signing.
        if (data.staleVersion) setTimeout(() => window.location.reload(), 2500)
        return
      }
      setStarter({ ...starter, code: data.code ?? null, state: 'ready' })
      setAgreement({ ...agreement, signedAt: data.signedAt ?? new Date().toISOString(), signedName: name })
    } catch {
      setError('Couldn’t reach us just then. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const signed = starter.state === 'ready'

  return (
    <Card as="section" solid className="mb-4">
      <div className="flex items-start justify-between" style={{ gap: 'var(--space-3)' }}>
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-display)',
              fontFamily: 'var(--font-display)',
              color: 'var(--ink-1)',
            }}
          >
            Your stack, on us
          </h2>
          <p
            style={{
              fontSize: 'var(--text-meta)',
              lineHeight: 'var(--leading-snug)',
              color: 'var(--ink-3)',
              marginTop: 'var(--space-1)',
            }}
          >
            Take the quiz and it builds you two — Essentials and Balanced. Pick either; both come in under{' '}
            {money(starter.goodsCap)} of products, delivery included. Nothing to pay and no card needed. Yours
            until {day(starter.expiresAt)}.
          </p>
        </div>
        <Badge tone={signed ? 'positive' : 'neutral'}>{signed ? 'Ready' : 'Sign to unlock'}</Badge>
      </div>

      {signed ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Note tone="positive">
            Signed{agreement.signedAt ? ` ${day(agreement.signedAt)}` : ''}
            {agreement.signedName ? ` as ${agreement.signedName}` : ''}. Press the button and take the quiz —
            it builds your stack and the whole thing comes out free. No code, no card.
          </Note>
          <div style={{ marginTop: 'var(--space-3)' }}>
            {/* No code, anywhere. The button IS the claim: it marks this tab
                as a claim and the checkout resolves who that is from their
                session. A partner receiving a gift should not have to do
                admin to accept it. */}
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

          {/*
            ── The job they have just agreed to do ─────────────────────────────
            Their own code and their own link, at the moment they signed up to
            post both. The journey used to end on "here is your free stack" and
            go quiet about the work — leaving somebody who had just promised a
            TikTok and two stories with nothing to put in them, and no idea the
            assets existed one tab away.
          */}
          {partnerCode && (
            <div
              style={{
                marginTop: 'var(--space-5)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--edge)',
              }}
            >
              <p
                style={{
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 'var(--weight-display)',
                  fontFamily: 'var(--font-display)',
                  color: 'var(--ink-1)',
                }}
              >
                What to post
              </p>
              <p
                style={{
                  fontSize: 'var(--text-meta)',
                  lineHeight: 'var(--leading-snug)',
                  color: 'var(--ink-3)',
                  marginTop: 'var(--space-1)',
                }}
              >
                Your followers get 25% off with this code, and anyone who arrives on your link is credited to
                you for 30 days — whether or not they remember to type it.
              </p>

              <CopyRow label="Your code" value={partnerCode} />
              <CopyRow label="Your link" value={shareLink(partnerCode)} />

              <p
                style={{
                  fontSize: 'var(--text-micro)',
                  lineHeight: 'var(--leading-snug)',
                  color: 'var(--ink-3)',
                  marginTop: 'var(--space-3)',
                }}
              >
                Ready-made story and post images, with your code already on them, are under{' '}
                <a href="/partner" style={{ color: 'var(--accent)' }}>
                  Your assets
                </a>
                .
              </p>
            </div>
          )}

          {token && (
            <p
              style={{
                fontSize: 'var(--text-micro)',
                lineHeight: 'var(--leading-snug)',
                color: 'var(--ink-3)',
                marginTop: 'var(--space-3)',
              }}
            >
              You are signed in on this device. When you want to check what you have earned, set a password at{' '}
              <a href={`/partner/set-password?token=${encodeURIComponent(token)}`} style={{ color: 'var(--accent)' }}>
                partner settings
              </a>{' '}
              — no rush, and you do not need one to claim your stack.
            </p>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <p
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              letterSpacing: 'var(--tracking-eyebrow)',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              marginBottom: 'var(--space-2)',
            }}
          >
            What you’re agreeing to
          </p>
          <ul style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            {agreement.deliverables.map((d) => (
              <li
                key={d.id}
                style={{
                  fontSize: 'var(--text-meta)',
                  lineHeight: 'var(--leading-snug)',
                  color: 'var(--ink-2)',
                }}
              >
                {d.text}
              </li>
            ))}
          </ul>

          {/* The document itself, in full. Scrollable rather than truncated —
              a "read more" on the thing being signed is the one place a fold
              is not acceptable. */}
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
            <Input
              label="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Morgan"
              autoComplete="name"
            />
            <Input
              label="Where you'll post"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourhandle"
              hint="The account the content is going on, so we know where to look for it."
            />
            <Checkbox
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              label="I've read the agreement above and I'm signing it."
            />
          </div>

          {error && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Note tone="critical">{error}</Note>
            </div>
          )}

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button onClick={sign} loading={busy} disabled={!agreed || name.trim().length < 3}>
              Sign and unlock my stack
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
