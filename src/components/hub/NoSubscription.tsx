'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Icon, type IconName } from '@/components/ui/Icon'
import { LEGAL_ENTITY } from '@/lib/legal/content'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import { ACCENT, GLASS, tint } from '@/lib/ui/tokens'

/**
 * The hub, for somebody who is signed in and has no plan.
 *
 * Before this, `SubscriptionDashboard` returned `null` for a member with no
 * subscription, so the account they had just created rendered as a header and
 * an empty page. What kept anyone from noticing is that nobody ever got here:
 * `/api/hub/subscription` fabricated a demo plan for any account without one and
 * saved it — so a person who had never bought anything was shown products,
 * prices and delivery dates that were not theirs. That seeding is now confined
 * to deployments that cannot take real money (see `seedsDemoSubscription`), and
 * this is what a real account with no plan actually sees.
 *
 * ── What it is for ───────────────────────────────────────────────────────────
 * Three different people land here and they need different things:
 *
 *  1. **Someone who signed up but never subscribed** — most of them. They want
 *     the way in, so the quiz is the one loud thing on the screen.
 *  2. **Someone who only ever bought one-off from the shop.** A plan is not the
 *     only way to be a customer, so the shop is offered as a real alternative
 *     rather than a consolation link in the footer.
 *  3. **Someone who IS subscribed, under a different email.** This is the person
 *     an empty state normally fails: they know they pay us every month, and a
 *     cheerful "start your first stack" reads as us having lost their money.
 *     The address they are signed in as is printed, plainly, with what to do
 *     about it — because a plan lives with the address that paid for it, and
 *     nothing else on this screen explains why theirs looks missing.
 *
 * It deliberately does not sell hard. Someone whose plan seems to have vanished
 * is mid-problem, and the fix for them is three paragraphs down a page of
 * marketing if the marketing comes first.
 */
export function NoSubscription({
  name,
  email,
  onSignOut,
}: {
  /** The account's name, for the greeting. */
  name?: string | null
  /** The signed-in address. Null for a provider that never gave us one. */
  email?: string | null
  /** Offered as "use a different email" — the fix for the third case above. */
  onSignOut?: () => void
}) {
  /**
   * Same rule the dashboard uses: the half of an email address before the `@`
   * is a login, not a name, and greeting a member as "Hi lewissiara" is the
   * cheapest thing a paid product can do.
   */
  const firstName = (name ?? '').trim().split(/\s+/)[0]
  const greeting = firstName && !firstName.includes('@') ? `Hi ${firstName}` : 'Welcome'

  const savePct = Math.round(PRICING_CONFIG.subscriptionDiscount * 100)
  // The legal-entity settings use `[bracketed]` placeholders for "not filled in
  // yet". One of those is not an address to send anybody to.
  const support = LEGAL_ENTITY.contactEmail.startsWith('[') ? null : LEGAL_ENTITY.contactEmail

  return (
    <div>
      <div className="mb-6">
        <Eyebrow color={ACCENT}>Your hub</Eyebrow>
        <h1
          className="text-2xl font-black mt-1.5"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          {greeting}
        </h1>
        <p className="text-sm text-[var(--color-text-2)] mt-2 leading-relaxed">
          You’re signed in — there’s just no plan on this account yet. Build one and this page becomes
          your stack: what’s coming, when, and everything you can change about it.
        </p>
      </div>

      {/* The one loud thing. Same language as the confirmation screen's quiz
          invitation rather than a third grey pill: a glyph in a tinted disc, a
          headline, one line of why. */}
      <Link
        href="/"
        className={[
          // `items-start`, not centre: the copy runs to three lines on a phone,
          // and a glyph floating level with the middle of a paragraph reads as
          // a mistake.
          'flex items-start gap-4 w-full rounded-3xl px-5 py-5 mb-3',
          'transition-all duration-200 active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2',
        ].join(' ')}
        style={{
          background: `linear-gradient(100deg, ${tint(ACCENT, 12)}, ${tint(ACCENT, 4)})`,
          border: `1px solid ${tint(ACCENT, 28)}`,
          boxShadow: `0 8px 30px -14px ${tint(ACCENT, 45)}`,
          ['--tw-ring-color' as string]: tint(ACCENT, 45),
        }}
      >
        <span
          className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full"
          style={{ background: tint(ACCENT, 16), color: ACCENT }}
        >
          <Icon name="sparkle" size={20} />
        </span>
        <span className="flex-1 text-left">
          <span
            className="block text-base font-black text-[var(--color-text)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Build your stack
          </span>
          <span className="block text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">
            A few questions about your training and what you’re chasing, then a stack picked around
            the answers. About two minutes.
          </span>
        </span>
        <span aria-hidden className="mt-0.5" style={{ color: ACCENT }}>→</span>
      </Link>

      {/* A plan is not the only way to be a customer. */}
      <Link
        href="/shop"
        className={[
          'flex items-center gap-3 w-full rounded-2xl px-4 py-3.5 mb-6',
          'transition-all duration-200 active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2',
        ].join(' ')}
        style={{
          background: GLASS.surface,
          border: `1px solid ${GLASS.hairline}`,
          ['--tw-ring-color' as string]: tint(ACCENT, 45),
        }}
      >
        <span className="shrink-0 text-[var(--color-muted)]">
          <Icon name="box" size={17} />
        </span>
        <span className="flex-1 text-left text-xs font-semibold text-[var(--color-text)]">
          Just after one thing? Buy it once from the shop
        </span>
        <span aria-hidden className="text-[var(--color-muted)]">→</span>
      </Link>

      {/* Why a plan, in the terms someone weighing one up actually cares about:
          what it costs them to change their mind. */}
      <Card eyebrow="What a plan gives you" className="mb-3">
        <ul className="space-y-3">
          <Benefit icon="swap">
            Swap or drop anything on it, any month, from this page.
          </Benefit>
          <Benefit icon="pause">
            Skip a box or pause the whole thing whenever — no phone call, no notice period.
          </Benefit>
          <Benefit icon="bolt">
            Subscribe &amp; save up to {savePct}% against buying the same products one at a time.
          </Benefit>
        </ul>
      </Card>

      {/* The person this screen most easily fails. Last, because it is the
          smallest group — but said plainly, because for them nothing else here
          makes sense. */}
      <Card eyebrow="Already subscribed?">
        <p className="text-xs text-[var(--color-text-2)] leading-relaxed">
          A plan lives with the email address that paid for it. This hub is showing
          {email ? (
            <>
              {' '}
              {/* A long address must wrap inside the card rather than push it
                  wider than the phone. */}
              <strong className="text-[var(--color-text)] break-all">{email}</strong>
            </>
          ) : (
            ' the account you signed in with'
          )}
          , so if you subscribed with a different address, sign in with that one instead and your
          stack will be there.
        </p>
        {onSignOut && (
          <Button variant="secondary" size="sm" onClick={onSignOut} className="mt-3.5">
            Use a different email
          </Button>
        )}
        {support && (
          <p className="text-[11px] text-[var(--color-muted)] mt-3 leading-relaxed">
            Still can’t find it?{' '}
            <a href={`mailto:${support}`} className="underline text-[var(--color-text-2)]">
              {support}
            </a>{' '}
            — tell us the address you paid with and we’ll sort it.
          </p>
        )}
      </Card>
    </div>
  )
}

function Benefit({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full"
        style={{ background: GLASS.raised, color: 'var(--color-muted)' }}
      >
        <Icon name={icon} size={14} />
      </span>
      <span className="text-xs text-[var(--color-text-2)] leading-relaxed">{children}</span>
    </li>
  )
}
