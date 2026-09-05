/**
 * The content agreement a partner signs for their starter stack.
 *
 * ── Why the text lives in code ──────────────────────────────────────────────
 * Because it is hashed. The server renders this, hashes exactly what it
 * rendered, and stores the hash on the signature — the same rule
 * `lib/legal/consent` follows, and for the same reason: "they agreed to
 * something" is worth very little, and "they agreed to exactly this text" is
 * worth everything. A document the browser posted back, or one edited in a
 * database, can prove neither.
 *
 * ── Why the version is a date ───────────────────────────────────────────────
 * Rows are append-only and a signature names its version, so a change is a NEW
 * version and old signatures keep pointing at the wording they were made under.
 * Never edit a shipped version in place: that silently restates what forty
 * people agreed to.
 *
 * Pure. No crypto here — hashing is server-side, in `sign.ts`.
 */
import type { Deliverable, StarterTier } from './types'
import { starterTierLabel } from './rules'

/** Bump — never edit — when the wording changes. */
export const PARTNER_AGREEMENT_VERSION = '2026-09-1'

/**
 * What we are asking for, in the words the partner reads and signs.
 *
 * Three things, and deliberately only three. The programme's whole pitch to a
 * micro-influencer is that the ask is small and specific; a list that grows in
 * the agreement past what the outreach message promised is the fastest way to
 * lose somebody between saying yes and signing.
 *
 * `#ad` is not a preference. Under the UK ASA/CAP code an influencer post made
 * in return for a free product is an advert and must be identifiable as one
 * before anybody engages with it — so it is a term of the agreement rather than
 * a suggestion in a brief, and the wording says why.
 */
export const PARTNER_DELIVERABLES: Deliverable[] = [
  {
    id: 'tiktok',
    text: 'One TikTok in launch week, showing the quiz and your stack.',
  },
  {
    id: 'stories',
    text: 'Two stories, each with your discount code and your link.',
  },
  {
    id: 'ad-label',
    text:
      'Label both as an ad (#ad in the caption, and the paid-partnership toggle where the platform has one). ' +
      'A free product makes a post an advert under UK advertising rules, so this one is a legal requirement rather than a preference.',
  },
]

export interface AgreementContext {
  partnerName: string
  /** Their code — the one their followers type, not the starter code. */
  partnerCode: string
  tier: StarterTier
  /** The ceiling on the goods, already formatted (e.g. "£140"). */
  goodsCap: string
  /** ISO date the starter dies. */
  expiresAt: string
}

/**
 * The agreement, rendered.
 *
 * One string, plain text, deliberately short enough to actually be read. A
 * three-page document nobody reads is worse evidence than a page they did,
 * whatever it says.
 */
export function partnerAgreementText(ctx: AgreementContext): string {
  const expires = new Date(ctx.expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return [
    `CHRGD PARTNER CONTENT AGREEMENT — version ${PARTNER_AGREEMENT_VERSION}`,
    '',
    `Between CHRGD and ${ctx.partnerName} ("you"), for partner code ${ctx.partnerCode}.`,
    '',
    'WHAT WE GIVE YOU',
    '',
    `1. One ${starterTierLabel(ctx.tier)} stack, free. You take the quiz, it builds you a stack, and your`,
    `   starter code takes the whole order — products and delivery — to £0.00. Nothing is taken`,
    `   from a card, because there is nothing to take.`,
    `2. It covers up to ${ctx.goodsCap} of products. If the stack you build comes to more than that, you can`,
    '   drop something or buy the difference on a normal order.',
    '3. One order, once. The code is spent when the order is placed, and it expires on',
    `   ${expires}.`,
    '',
    'WHAT YOU AGREE TO POST',
    '',
    ...PARTNER_DELIVERABLES.map((d, i) => `${i + 1}. ${d.text}`),
    '',
    'HOW WE BOTH EXPECT THIS TO GO',
    '',
    '• Say what you actually think. We are not asking for a script, we are not approving your',
    '  content before it goes up, and we would rather have an honest reservation in a real',
    '  review than a perfect one nobody believes.',
    '• No medical claims. Supplements support a diet; they do not treat, cure or prevent',
    '  anything, and we cannot be part of a post that says they do.',
    '• If something comes up and the content is not going to happen, tell us. We will not chase',
    '  you for the value of a stack over a change of plan. If the content simply never appears',
    '  and you stop answering, we may end the partnership and ask you to pay the normal price',
    '  for the stack you took.',
    '',
    'THE MONEY SIDE',
    '',
    '• Your code gives your followers 25% off a stack, bundle or subscription. It replaces other',
    '  discounts rather than stacking with them.',
    '• You earn 15% of the net value of a first order and 5% of renewals for three months. Net is',
    '  before VAT and delivery.',
    '• Your own purchases get the discount but earn you no commission. This starter stack is a',
    '  gift, not an order you are paid on.',
    '• You are self-employed for this. What you earn from us is yours to declare.',
    '',
    'THE BORING BITS',
    '',
    '• You can walk away whenever you like. So can we. Anything already earned is still paid.',
    '• We record your name, your handle, this text and the time you signed it. That record is',
    '  what this agreement is; we keep it for as long as the partnership runs and for six years',
    '  after, which is how long we have to keep our books.',
    '• We may reshare your posts on our own channels, with credit. Tell us if you would rather',
    '  we did not and we will not.',
    '• England & Wales law.',
    '',
    'By typing your name below you are agreeing to all of the above.',
  ].join('\n')
}
