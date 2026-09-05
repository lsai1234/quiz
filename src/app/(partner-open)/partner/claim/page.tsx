import { redirect } from 'next/navigation'
import { StarterStack } from '@/components/partner/StarterStack'

export const dynamic = 'force-dynamic'

/**
 * `/partner/claim?token=…` — the front door for a new partner.
 *
 * Deliberately OUTSIDE the `(partner-gated)` group, for the reason
 * `/partner/set-password` is: somebody following a link from a DM has no
 * session, and a gate here would lock out exactly the people it is for.
 *
 * ── Why this is the link a founder sends ────────────────────────────────────
 * It is the shortest true path to the thing that was promised. The offer was "a
 * free stack for a TikTok and two stories"; this page is that offer, the
 * agreement, and a box to put your name in. Nothing before it.
 *
 * When there is nothing to sign for — no token, a spent link, or a partner who
 * has already claimed — it falls through to setting a password, which is what
 * the link used to do and what a returning partner needs. One link, always
 * right, so a founder never has to decide which of two to send.
 */
export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/partner')

  return (
    <main className="my-hub" style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-6) var(--gutter)' }}>
      <p
        style={{
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          color: 'var(--ink-1)',
          marginBottom: 'var(--space-5)',
        }}
      >
        CHRGD <span style={{ color: 'var(--accent)' }}>Partners</span>
      </p>
      <StarterStack token={token} />
      {/*
        The fallback is rendered rather than redirected to, because whether
        there is anything to claim is only known on the client after the fetch —
        and a redirect that fires on a slow answer would bounce somebody off the
        page they were sent. `StarterStack` renders nothing when there is
        nothing, so this is what is left.
      */}
      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' }}>
        Already claimed your stack, or here to get back into your account?{' '}
        <a href={`/partner/set-password?token=${encodeURIComponent(token)}`} style={{ color: 'var(--accent)' }}>
          Set a password
        </a>
        .
      </p>
    </main>
  )
}
