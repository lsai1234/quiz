/**
 * Email templates — pure functions from context to rendered email.
 *
 * Two things every product-change email must do, and the tests enforce both:
 *
 *  1. **State the money.** What they were paying, what they'll pay, and from
 *     when. A change to someone's bill that they have to work out for themselves
 *     is not a notification.
 *
 *  2. **Land the invitation somewhere useful.** Because nothing here asks the
 *     member to act, "you can change this in your hub" is the entire mechanism
 *     by which they keep control — so the link opens the flow that can act on
 *     it, pre-targeted, not the hub's front page.
 *
 * A substitution additionally carries the allergen sentence verbatim from
 * `lib/legal`, because a different product in the same box is exactly when
 * someone needs to be told to read the label.
 */
import { ALLERGEN_CHECK_SENTENCE, LEGAL_ENTITY } from '@/lib/legal/content'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { RenderedEmail } from './types'

const ACCENT = '#00D4FF'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? 'your next payment'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Escape anything interpolated into the HTML body — product titles are data. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface Block {
  paragraphs: string[]
  /** The call to action. Optional — a notice with nothing to adjust has none. */
  cta?: { label: string; url: string }
  /** Small print under the button. */
  footnote?: string
}

/** One house style for every email, so a new template can't drift visually. */
function layout(heading: string, block: Block): { text: string; html: string } {
  const text = [
    heading,
    '',
    ...block.paragraphs,
    ...(block.cta ? ['', `${block.cta.label}: ${block.cta.url}`] : []),
    ...(block.footnote ? ['', block.footnote] : []),
    '',
    `— ${LEGAL_ENTITY.tradingName}`,
  ].join('\n')

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#18181b;line-height:1.6">
  <h1 style="font-size:20px;font-weight:800;margin:0 0 16px">${esc(heading)}</h1>
  ${block.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:14px">${esc(p)}</p>`).join('\n  ')}
  ${block.cta ? `<p style="margin:24px 0"><a href="${esc(block.cta.url)}" style="display:inline-block;background:${ACCENT};color:#001018;font-weight:700;font-size:14px;text-decoration:none;padding:12px 20px;border-radius:12px">${esc(block.cta.label)}</a></p>` : ''}
  ${block.footnote ? `<p style="margin:0 0 12px;font-size:12px;color:#71717a">${esc(block.footnote)}</p>` : ''}
  <p style="margin:24px 0 0;font-size:12px;color:#71717a">— ${esc(LEGAL_ENTITY.tradingName)}</p>
</div>`

  return { text, html }
}

/** "your monthly stays at £X" / "goes from £X to £Y from <date>". */
function monthlyLine(before: number, after: number, effectiveFrom: string): string {
  if (Math.abs(after - before) < 0.01) {
    return `Your monthly stays exactly the same at ${formatGBP(before)}.`
  }
  const direction = after < before ? 'drops' : 'goes up'
  return `Your monthly ${direction} from ${formatGBP(before)} to ${formatGBP(after)}, starting ${formatDate(effectiveFrom)}.`
}

// ─── Product substituted ──────────────────────────────────────────────────────

export interface SubstitutedContext {
  productTitle: string
  replacementTitle: string
  /** Why it went: temporarily unavailable, or gone for good. */
  discontinued: boolean
  monthlyBefore: number
  monthlyAfter: number
  effectiveFrom: string
  /** Deep link that opens the swap flow on this line. */
  changeUrl: string
}

export function productSubstituted(ctx: SubstitutedContext): RenderedEmail {
  const paragraphs = [
    ctx.discontinued
      ? `${ctx.productTitle} has been discontinued by our supplier, so we've swapped it for ${ctx.replacementTitle} — the closest match we could find.`
      : `${ctx.productTitle} is out of stock, so we've swapped it for ${ctx.replacementTitle} — the closest match we could find.`,
    'You asked us to keep your plan whole if something became unavailable, so we did that rather than leave a gap in your box.',
    monthlyLine(ctx.monthlyBefore, ctx.monthlyAfter, ctx.effectiveFrom),
    ALLERGEN_CHECK_SENTENCE,
  ]

  return {
    subject: `We've swapped ${ctx.productTitle} for ${ctx.replacementTitle}`,
    ...layout(`A change to your plan`, {
      paragraphs,
      cta: { label: 'Pick something else instead', url: ctx.changeUrl },
      footnote: "Happy with the swap? You don't need to do anything.",
    }),
  }
}

// ─── Product removed ──────────────────────────────────────────────────────────

export type RemovalReason =
  /** They asked us to take things off rather than swap them. */
  | 'member-choice'
  /** Nothing else in the category was available. */
  | 'nothing-available'
  /** Something was available, but not compatible with their diet or allergies. */
  | 'nothing-suitable'

export interface RemovedContext {
  productTitle: string
  reason: RemovalReason
  discontinued: boolean
  monthlyBefore: number
  monthlyAfter: number
  effectiveFrom: string
  /** Credit for a delivery they paid towards but never received. */
  credit?: number
  /** Deep link that opens the add flow, filtered to the same category. */
  addUrl: string
  /** A couple of things they might put in its place. */
  suggestions?: string[]
}

function removalExplanation(ctx: RemovedContext): string {
  const gone = ctx.discontinued
    ? `${ctx.productTitle} has been discontinued by our supplier`
    : `${ctx.productTitle} is out of stock`

  switch (ctx.reason) {
    case 'member-choice':
      return `${gone}, and you asked us to take things off your plan rather than swap them, so that's what we've done.`
    case 'nothing-suitable':
      // The honest version matters here: they opted into swaps and didn't get
      // one, and the reason is that we wouldn't risk their dietary needs.
      return `${gone}. You asked us to keep your plan whole, but nothing else in that category matches the dietary requirements you told us about — so we've taken it off rather than send you something that might not suit you.`
    case 'nothing-available':
      return `${gone}. You asked us to keep your plan whole, but there's nothing else in that category available right now — so we've taken it off for the time being.`
  }
}

export function productRemoved(ctx: RemovedContext): RenderedEmail {
  const paragraphs = [
    removalExplanation(ctx),
    monthlyLine(ctx.monthlyBefore, ctx.monthlyAfter, ctx.effectiveFrom),
  ]

  if (ctx.credit && ctx.credit > 0) {
    paragraphs.push(
      `You'd already paid ${formatGBP(ctx.credit)} towards a delivery of it that never arrived. That's credited against your next payment — we don't charge for anything we couldn't send.`,
    )
  }

  paragraphs.push(
    ctx.suggestions && ctx.suggestions.length > 0
      ? `If you'd like something in its place, ${ctx.suggestions.slice(0, 3).join(', ')} would all fit — but there's no rush, and no need to do anything at all.`
      : "You can add something in its place whenever you like — there's no rush, and no need to do anything at all.",
  )

  return {
    subject: `${ctx.productTitle} has come off your plan`,
    ...layout('A change to your plan', {
      paragraphs,
      cta: { label: 'Browse replacements', url: ctx.addUrl },
      footnote: 'Your next box is otherwise unchanged.',
    }),
  }
}

// ─── Price change notice ──────────────────────────────────────────────────────

export interface PriceChangeContext {
  productTitle: string
  monthlyBefore: number
  monthlyAfter: number
  effectiveFrom: string
  noticeDays: number
  hubUrl: string
}

export function priceChangeNotice(ctx: PriceChangeContext): RenderedEmail {
  return {
    subject: `Your monthly is changing to ${formatGBP(ctx.monthlyAfter)}`,
    ...layout('A change to your price', {
      paragraphs: [
        `Our supplier has put up the price of ${ctx.productTitle}, and we're passing part of that on.`,
        `Your monthly goes from ${formatGBP(ctx.monthlyBefore)} to ${formatGBP(ctx.monthlyAfter)}, starting ${formatDate(ctx.effectiveFrom)}. Everything you've already paid is unaffected.`,
        `We're telling you ${ctx.noticeDays} days ahead because you should have time to decide. If you'd rather not continue at the new price, you can cancel free of charge any time before that date — including if you're still inside a minimum term.`,
        "If you're happy to carry on, you don't need to do anything.",
      ],
      cta: { label: 'Review your plan', url: ctx.hubUrl },
    }),
  }
}

// ─── Payment failed ───────────────────────────────────────────────────────────

export interface PaymentFailedContext {
  monthly: number
  /** Where they update the card — the Stripe billing portal, via the hub. */
  billingUrl: string
}

/**
 * The one email in this domain that DOES ask the member to act, and the reason
 * the rule is worth stating: nothing we can do at our end puts money on a card
 * that declined. Written to be easy rather than alarming — a card expires, it is
 * nobody's fault, and their plan is still there.
 */
export function paymentFailed(ctx: PaymentFailedContext): RenderedEmail {
  return {
    subject: "We couldn't take your payment",
    ...layout("We couldn't take this month's payment", {
      paragraphs: [
        `Your ${formatGBP(ctx.monthly)} payment didn't go through. Usually that's a card that has expired or been replaced — it's rarely anything more than that.`,
        "We'll try again automatically over the next few days, so if you've already sorted it you can ignore this. Updating your card now saves the wait.",
        'Your plan and everything on it are unchanged.',
      ],
      cta: { label: 'Update your card', url: ctx.billingUrl },
      footnote: "If you'd rather stop, you can cancel any time from your account.",
    }),
  }
}

// ─── Leaving ──────────────────────────────────────────────────────────────────

export interface ExitReceiptContext {
  /** What we charged (£). Zero when waived or already covered. */
  settlement: number
  /** Everything dispatched over the plan's life (£). */
  shippedTotal: number
  /** Everything they paid (£). */
  paidTotal: number
  /** Set when nothing was charged — the member's own words for why. */
  waiverExplanation?: string | null
  /** What we owe them back (£), when their payments outran their deliveries. */
  overpayment?: number
  shopUrl: string
}

/**
 * The receipt for an ended plan.
 *
 * Leads with the two totals rather than the balance, because the balance only
 * makes sense as the difference between them — and a member reading this has
 * usually already forgotten how many boxes they had. Everything they were sent
 * is theirs; saying so plainly is the difference between a receipt and a
 * demand.
 */
export function exitReceipt(ctx: ExitReceiptContext): RenderedEmail {
  const paragraphs: string[] = [
    `Your plan has ended. Over its life we sent you ${formatGBP(ctx.shippedTotal)} of product and you paid ${formatGBP(ctx.paidTotal)}.`,
  ]

  if (ctx.waiverExplanation) {
    paragraphs.push(ctx.waiverExplanation)
  } else if (ctx.settlement > 0) {
    paragraphs.push(
      `We've taken a final ${formatGBP(ctx.settlement)} — the balance on what had already been sent to you and your payments hadn't yet covered. That's it; nothing further will be billed.`,
    )
  } else {
    paragraphs.push('Your payments had covered everything we sent, so there was nothing left to settle.')
  }

  if ((ctx.overpayment ?? 0) > 0) {
    paragraphs.push(`You had paid ${formatGBP(ctx.overpayment!)} more than we sent, so that is coming back to your card.`)
  }

  paragraphs.push('Everything already delivered is yours to keep.')

  return {
    subject: 'Your CHRGD plan has ended',
    ...layout('Your plan has ended', {
      paragraphs,
      cta: { label: 'Shop one-offs', url: ctx.shopUrl },
      footnote: 'Your account stays open — you can start a new plan whenever you like.',
    }),
  }
}

export interface ExitReturnContext {
  /** Coming back to their card once the goods are with us (£). */
  refund: number
  /** The last day the statutory window runs to, already formatted. */
  deadline: string
  /** Where to send it back to. */
  returnAddress: string[]
  /** The plan reference to put in the box, so the parcel can be matched. */
  reference: string
  hubUrl: string
}

/**
 * They cancelled inside the 14 days and chose to send everything back.
 *
 * The one exit email that asks the member to DO something, so it has to be
 * unambiguous about all three of: where the parcel goes, what to put in it, and
 * what comes back to them when it arrives. A refund promise with no address is
 * how a statutory right becomes an argument.
 */
export function exitReturnRequested(ctx: ExitReturnContext): RenderedEmail {
  return {
    subject: 'Your CHRGD plan has ended — sending it back',
    ...layout('Your plan has ended', {
      paragraphs: [
        'Your subscription is cancelled and nothing further will be billed. You cancelled inside your 14-day cancellation period and chose to return what you have.',
        `Send everything back to: ${ctx.returnAddress.join(', ')}.`,
        `Please put your plan reference ${ctx.reference} in with it, so we can match the parcel to your account.`,
        `Once it reaches us we will refund ${formatGBP(ctx.refund)} to the card you paid with. Post it within 14 days of telling us — by ${ctx.deadline} — and keep your proof of postage.`,
        'Return postage is yours to pay unless the goods arrived damaged or wrong, in which case tell us and we will cover it.',
      ],
      cta: { label: 'View your account', url: ctx.hubUrl },
      footnote: 'Changed your mind about returning it? Keep it — there is nothing to pay either way. Just let us know so we are not waiting on a parcel.',
    }),
  }
}

export interface ExitChargeFailedContext {
  settlement: number
  /** Where they can pay it. Stripe's hosted invoice, or the billing page. */
  invoiceUrl: string
}

/**
 * The settlement invoice was not paid.
 *
 * The only exit email that asks for anything, and it opens by confirming the
 * cancellation went through — because that is the member's actual worry on
 * seeing an email about a failed payment after leaving.
 */
export function exitChargeFailed(ctx: ExitChargeFailedContext): RenderedEmail {
  return {
    subject: 'Your plan has ended — one payment did not go through',
    ...layout('Your plan has ended', {
      paragraphs: [
        'Your subscription is cancelled and nothing further will be billed. That part is done.',
        `The final ${formatGBP(ctx.settlement)} — the balance on products already sent to you — could not be taken from your card, so we have left it as an invoice you can pay whenever suits.`,
        'Everything already delivered is yours to keep either way.',
      ],
      cta: { label: 'Pay the balance', url: ctx.invoiceUrl },
      footnote: 'If the card on file has expired, paying through the link above will sort it.',
    }),
  }
}

export interface ExitScheduledContext {
  /** How many billing cycles away the free exit is. */
  monthsAway: number
  monthly: number
  hubUrl: string
}

/**
 * Confirming a scheduled free exit.
 *
 * The thing to be unambiguous about is that nothing changes in the meantime —
 * boxes still arrive and payments still go out. A member who thinks they have
 * stopped and then sees a charge will treat it as a mistake, however clearly the
 * screen explained it at the time.
 */
export function exitScheduled(ctx: ExitScheduledContext): RenderedEmail {
  const when = ctx.monthsAway <= 1 ? 'after your next payment' : `in ${ctx.monthsAway} months`
  return {
    subject: 'Your plan will end — nothing to pay',
    ...layout('Your plan ends ' + when, {
      paragraphs: [
        `You've chosen to leave on your next free date, so your plan will end ${when} with nothing to settle.`,
        `Until then everything carries on exactly as it is — your boxes still arrive and your ${formatGBP(ctx.monthly)} payment still goes out. That is what clears the balance on what has already been sent to you, which is why leaving this way costs nothing.`,
        'Change your mind any time before then and your plan simply carries on.',
      ],
      cta: { label: 'View your plan', url: ctx.hubUrl },
    }),
  }
}

// ─── Terms updated ────────────────────────────────────────────────────────────

export interface TermsUpdatedContext {
  summary: string
  effectiveFrom: string
  termsUrl: string
}

export function termsUpdated(ctx: TermsUpdatedContext): RenderedEmail {
  return {
    subject: "We've updated our subscription terms",
    ...layout("We've updated our terms", {
      paragraphs: [
        ctx.summary,
        `The new terms apply from ${formatDate(ctx.effectiveFrom)}. Your plan and your price are unchanged by this.`,
      ],
      cta: { label: 'Read the new terms', url: ctx.termsUrl },
    }),
  }
}
