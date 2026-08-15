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
import { ALLERGEN_CHECK_SENTENCE } from '@/lib/legal/content'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { appBaseUrl } from './index'
import { defaultMarketing, emailShell, type MarketingAudience } from './brand'
import type { ReceiptData } from '@/lib/receipt/types'
import type { RenderedEmail } from './types'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? 'your next payment'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * What the shell needs that a template's own context doesn't carry.
 *
 * Optional throughout, so every template stays callable with nothing but its
 * own facts — which is how they are unit-tested, and how a preview is rendered
 * without a database. The queueing helpers fill it in for real sends.
 */
export interface BrandContext {
  /** Absolute origin for the footer links. Defaults to the configured APP_URL. */
  baseUrl?: string
  /**
   * The recipient's marketing opt-out link.
   *
   * **The promotional strip does not render without it.** See `./marketing`:
   * the opt-out is what makes marketing inside a transactional email lawful, so
   * it is wired as a precondition rather than as a footer someone remembers.
   */
  optOutUrl?: string | null
}

interface Block {
  paragraphs: string[]
  /** Sits under the heading, ahead of the paragraphs. */
  intro?: string
  /** The printed receipt, for the emails that have one. */
  receipt?: ReceiptData | null
  /** The call to action. Optional — a notice with nothing to adjust has none. */
  cta?: { label: string; url: string }
  /** A quieter second link under the button. */
  secondaryCta?: { label: string; url: string }
  /** Small print under the button. */
  footnote?: string
  /** The inbox preview line. Falls back to the first paragraph. */
  preheader?: string
  /**
   * Whether the promotional strip belongs on this email, and who it addresses.
   *
   * `false` for the emails where a pitch would be crass: a declined card, a
   * settlement that failed, a member packing up a box to send back. Those
   * readers are mid-problem, and selling to someone mid-problem is how a
   * solvable situation becomes a complaint.
   *
   * `'member'` for anyone with a running plan, whose pitch is about using it
   * rather than starting one.
   */
  marketing?: false | MarketingAudience
}

/** One house style for every email, so a new template can't drift visually. */
function layout(heading: string, block: Block, brand: BrandContext = {}): { text: string; html: string } {
  const base = (brand.baseUrl ?? appBaseUrl()).replace(/\/+$/, '')
  return emailShell({
    preheader: block.preheader ?? block.paragraphs[0] ?? heading,
    heading,
    intro: block.intro,
    paragraphs: block.paragraphs,
    receipt: block.receipt ?? null,
    cta: block.cta,
    secondaryCta: block.secondaryCta,
    footnote: block.footnote,
    links: { base, optOutUrl: brand.optOutUrl ?? null },
    marketing: block.marketing === false ? null : defaultMarketing(base, block.marketing || 'prospect'),
  })
}

/** "your monthly stays at £X" / "goes from £X to £Y from <date>". */
function monthlyLine(before: number, after: number, effectiveFrom: string): string {
  if (Math.abs(after - before) < 0.01) {
    return `Your monthly stays exactly the same at ${formatGBP(before)}.`
  }
  const direction = after < before ? 'drops' : 'goes up'
  return `Your monthly ${direction} from ${formatGBP(before)} to ${formatGBP(after)}, starting ${formatDate(effectiveFrom)}.`
}

// ─── Order confirmation ───────────────────────────────────────────────────────

export interface OrderConfirmationContext {
  /** The receipt, built from the same data the confirmation screen printed. */
  receipt: ReceiptData
  /** For the greeting, when we know it. */
  firstName?: string | null
  /** The customer-facing order reference, for the subject line. */
  reference: string
  /** When it should land, already formatted, when we can say. */
  deliveryWindow?: string | null
  /** Where they can see their orders — the shop's account view or the hub. */
  accountUrl?: string | null
  shopUrl: string
}

/**
 * The receipt for a one-off order, emailed.
 *
 * Its job is to be findable in six weeks' time, which is why the receipt itself
 * is in the body rather than behind a link: an email that says "view your order"
 * and nothing else is useless to someone searching their inbox for what they
 * paid, and useless again once the link needs a login they have forgotten.
 *
 * What it does NOT do is promise a delivery date. The supplier dropships on
 * their own schedule, so the window is a dispatch expectation and is worded as
 * one — the same restraint `deliveryEstimate` shows on the confirmation screen.
 */
export function orderConfirmation(ctx: OrderConfirmationContext, brand: BrandContext = {}): RenderedEmail {
  const paragraphs = [
    ctx.deliveryWindow
      ? `We are getting it ready now. It should be with you ${ctx.deliveryWindow} — we will email you again if anything about that changes.`
      : 'We are getting it ready now, and we will email you again when it is on its way.',
    'Your receipt is below. Keep this email — it is the record of what you ordered and what you paid.',
  ]

  return {
    subject: `Your getCHRGD order ${ctx.reference}`,
    ...layout(
      ctx.firstName ? `Thanks, ${ctx.firstName} — your order is confirmed` : 'Your order is confirmed',
      {
        preheader: `Order ${ctx.reference} — your receipt is inside.`,
        paragraphs,
        receipt: ctx.receipt,
        cta: ctx.accountUrl ? { label: 'View your orders', url: ctx.accountUrl } : { label: 'Shop again', url: ctx.shopUrl },
        footnote:
          'Something not right with the address? Reply to this email within 12 hours and we will change it before it ships.',
      },
      brand,
    ),
  }
}

// ─── Subscription confirmation ────────────────────────────────────────────────

export interface SubscriptionConfirmationContext {
  receipt: ReceiptData
  firstName?: string | null
  /** The plan reference, e.g. `SUB-7F3A91`. */
  reference: string
  /** What recurs, in major units. */
  monthly: number
  /** When the next payment goes out, already formatted. Null when unknown. */
  nextPayment?: string | null
  /** A minimum term, in months. 1 or less means none. */
  minMonths?: number
  /** The hub — where they change, pause, skip or cancel any of it. */
  hubUrl: string
}

/**
 * The receipt for a plan that has just started.
 *
 * Two things earn their place ahead of everything else, and both are here
 * because of what a member does NOT know at the moment they commit:
 *
 *  1. **The hub, named and linked.** Every other email in this system leans on
 *     "you can change this yourself in your hub", and this is the email that
 *     teaches them the hub exists. If it lands nowhere useful, every later
 *     invitation to self-serve lands nowhere useful too.
 *  2. **What happens next, on what date, for how much.** A recurring payment
 *     nobody remembers agreeing to is the single most common cause of a chargeback,
 *     and the fix is to put the amount and the date in the confirmation rather
 *     than in the terms.
 */
export function subscriptionConfirmation(
  ctx: SubscriptionConfirmationContext,
  brand: BrandContext = {},
): RenderedEmail {
  const paragraphs = [
    ctx.nextPayment
      ? `From here it runs itself: ${formatGBP(ctx.monthly)} a month, next taken on ${ctx.nextPayment}, with your box going out on the same day.`
      : `From here it runs itself: ${formatGBP(ctx.monthly)} a month, with your box going out on the same day the payment does.`,
    (ctx.minMonths ?? 1) > 1
      ? `Your plan has a ${ctx.minMonths}-month minimum term. After that you can cancel any time before a payment, and you can always skip, pause, swap a product or change what is in the box — all of it from your hub, without asking us.`
      : 'You can cancel any time before a payment — and you can skip a month, pause, swap a product or change what is in the box whenever you like, all from your hub, without asking us.',
    'Your receipt is below. Keep this email — it is the record of what your plan is and what it costs.',
  ]

  return {
    subject: `Your getCHRGD plan is live — ${ctx.reference}`,
    ...layout(
      ctx.firstName ? `You are in, ${ctx.firstName}` : 'Your plan is live',
      {
        preheader: `${formatGBP(ctx.monthly)} a month. Manage all of it from your hub.`,
        intro: 'Everything about your plan lives in one place, and you control all of it.',
        paragraphs,
        receipt: ctx.receipt,
        cta: { label: 'Open your hub', url: ctx.hubUrl },
        marketing: 'member',
        footnote:
          'Bookmark your hub — it is where you skip a delivery, swap a product, update your card or cancel, and it is the fastest way to change anything.',
      },
      brand,
    ),
  }
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

export function productSubstituted(ctx: SubstitutedContext, brand: BrandContext = {}): RenderedEmail {
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
    ...layout(
      `A change to your plan`,
      {
        paragraphs,
        cta: { label: 'Pick something else instead', url: ctx.changeUrl },
        marketing: 'member',
        footnote: "Happy with the swap? You don't need to do anything.",
      },
      brand,
    ),
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

export function productRemoved(ctx: RemovedContext, brand: BrandContext = {}): RenderedEmail {
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
    ...layout(
      'A change to your plan',
      {
        paragraphs,
        cta: { label: 'Browse replacements', url: ctx.addUrl },
        marketing: 'member',
        footnote: 'Your next box is otherwise unchanged.',
      },
      brand,
    ),
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

export function priceChangeNotice(ctx: PriceChangeContext, brand: BrandContext = {}): RenderedEmail {
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
      marketing: 'member',
    }, brand),
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
export function paymentFailed(ctx: PaymentFailedContext, brand: BrandContext = {}): RenderedEmail {
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
      // Nothing is being sold to someone whose card just declined.
      marketing: false,
    }, brand),
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
export function exitReceipt(ctx: ExitReceiptContext, brand: BrandContext = {}): RenderedEmail {
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
    }, brand),
  }
}

export interface ExitReturnContext {
  /** The MOST that can come back (£) — a full, unopened return. */
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
export function exitReturnRequested(ctx: ExitReturnContext, brand: BrandContext = {}): RenderedEmail {
  return {
    subject: 'Your CHRGD plan has ended — sending it back',
    ...layout('Your plan has ended', {
      paragraphs: [
        'Your subscription is cancelled and nothing further will be billed. You cancelled inside your 14-day cancellation period and chose to return what you have.',
        `Send everything back to: ${ctx.returnAddress.join(', ')}.`,
        `Please put your plan reference ${ctx.reference} in with it, so we can match the parcel to your account.`,
        `Once it reaches us we will refund what you paid for everything that comes back unopened — up to ${formatGBP(ctx.refund)} if the whole box returns — to the card you paid with, and email you the exact figure. Post it within 14 days of telling us — by ${ctx.deadline} — and keep your proof of postage.`,
        'Supplements you have already opened cannot be refunded, for food hygiene reasons, unless they arrived faulty or damaged. If anything did, tell us before you post it: we will refund those and cover your postage. Return postage is otherwise yours to pay.',
      ],
      cta: { label: 'View your account', url: ctx.hubUrl },
      footnote: 'Changed your mind about returning it? Keep it — there is nothing to pay either way. Just let us know so we are not waiting on a parcel.',
      // They are packing a box to send back. Selling into that is tone-deaf.
      marketing: false,
    }, brand),
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
export function exitChargeFailed(ctx: ExitChargeFailedContext, brand: BrandContext = {}): RenderedEmail {
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
      // An unpaid balance is not the moment to advertise.
      marketing: false,
    }, brand),
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
export function exitScheduled(ctx: ExitScheduledContext, brand: BrandContext = {}): RenderedEmail {
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
      marketing: 'member',
    }, brand),
  }
}

// ─── Terms updated ────────────────────────────────────────────────────────────

export interface TermsUpdatedContext {
  summary: string
  effectiveFrom: string
  termsUrl: string
}

export function termsUpdated(ctx: TermsUpdatedContext, brand: BrandContext = {}): RenderedEmail {
  return {
    subject: "We've updated our subscription terms",
    ...layout("We've updated our terms", {
      paragraphs: [
        ctx.summary,
        `The new terms apply from ${formatDate(ctx.effectiveFrom)}. Your plan and your price are unchanged by this.`,
      ],
      cta: { label: 'Read the new terms', url: ctx.termsUrl },
      marketing: 'member',
    }, brand),
  }
}

// ─── Getting back in ──────────────────────────────────────────────────────────

export interface PasswordResetContext {
  /** The one-time link. Also the reason the stored copy is not this one. */
  resetUrl: string
  /** For the greeting, when we know it. */
  firstName?: string | null
  /** How long the link lasts, in words: "60 minutes". */
  expiresIn: string
  /** Which sign-in this is for — the wording differs, the mechanism doesn't. */
  realm?: 'account' | 'partner'
}

/**
 * The reset link.
 *
 * Three things it has to do, and the third is the one usually missed:
 *
 *  1. **Be obviously from us and obviously about this.** Someone who has just
 *     asked to reset a password is primed to click a link in an email, which is
 *     the exact state a phisher wants them in. Plain, specific and boring.
 *  2. **Say how long it lasts.** A link that has quietly expired reads as a
 *     broken website; a link that said "60 minutes" an hour ago reads as a link
 *     that expired.
 *  3. **Tell them what to do if it wasn't them.** This is the only warning the
 *     owner of an account gets that somebody is trying the front door. It says
 *     nothing has changed yet, because nothing has — the password is still
 *     theirs until the link is used — so the honest instruction is "ignore it",
 *     not "act now".
 *
 * No promotional strip: somebody locked out of their account is mid-problem, and
 * this email has exactly one thing to say.
 */
export function passwordReset(ctx: PasswordResetContext, brand: BrandContext = {}): RenderedEmail {
  const partner = ctx.realm === 'partner'
  const greeting = ctx.firstName ? `${ctx.firstName}, here's your link.` : "Here's your link."
  return {
    subject: partner ? 'Reset your partner password' : 'Reset your password',
    ...layout('Set a new password', {
      preheader: `Your link works for the next ${ctx.expiresIn}.`,
      intro: greeting,
      paragraphs: [
        partner
          ? 'Someone asked to reset the password on your CHRGD partner account. Use the button below to set a new one.'
          : 'Someone asked to reset the password on your CHRGD account. Use the button below to set a new one.',
        `The link works once, for the next ${ctx.expiresIn}. After that, ask for another one — it takes a second.`,
        "If this wasn't you, you don't need to do anything. Your password hasn't changed and nobody can change it without this link.",
      ],
      cta: { label: 'Set a new password', url: ctx.resetUrl },
      footnote: 'We will never email you asking for your password, your card details, or a code.',
      marketing: false,
    }, brand),
  }
}

export interface PasswordChangedContext {
  /** Where to sign in with it. */
  signInUrl: string
  firstName?: string | null
  /** Who to tell if it wasn't them. Omitted when there is nowhere to point. */
  supportEmail?: string | null
}

/**
 * The receipt for a password change.
 *
 * Sent after the fact, to the address on the account, and it is the mechanism by
 * which a takeover gets noticed: whoever reset the password is reading the reset
 * email, but the person who owns the mailbox reads this one. Which is why it
 * goes even though nobody asked for it, and why it names somewhere to complain.
 */
export function passwordChanged(ctx: PasswordChangedContext, brand: BrandContext = {}): RenderedEmail {
  const complain = ctx.supportEmail
    ? `If this wasn't you, reply to this email or write to ${ctx.supportEmail} straight away and we'll lock the account.`
    : "If this wasn't you, reply to this email straight away and we'll lock the account."
  return {
    subject: 'Your password was changed',
    ...layout('Your password was changed', {
      intro: ctx.firstName ? `${ctx.firstName}, this is just a record.` : 'This is just a record.',
      paragraphs: [
        'The password on your CHRGD account has been changed, and everywhere that was signed in has been signed out.',
        complain,
      ],
      cta: { label: 'Sign in', url: ctx.signInUrl },
      marketing: false,
    }, brand),
  }
}
