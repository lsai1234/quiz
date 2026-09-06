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
      {/*
        `StarterStack` owns the empty state as well as the offer, because it is
        the only thing here that knows which one applies — the answer arrives
        from a fetch after this page has rendered.

        This page used to carry a permanent "already claimed? set a password"
        line underneath instead. Under a live offer it was noise, and when the
        link had expired it was the entire page: a logo and a stray sentence,
        which reads as broken rather than as old.
      */}
      <StarterStack token={token} />
    </main>
  )
}
