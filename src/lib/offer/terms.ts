/**
 * The free gift's terms, as customers read them (plan Phase 4). The choices
 * in them (returns, sold out after payment, codes) were signed off with the
 * Phase 4 proposals; the wording is in the review pack.
 *
 * Built from the hub's settings, so a minimum or a depth changed there is the
 * minimum or depth the terms state. In the review pack (`bonusTermRows`).
 */
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { LEVEL_NAME } from './bonus-economics'
import { STACK_LEVELS, type BonusSettings } from './settings'

export interface TermsSection {
  heading: string
  lines: string[]
}

export function freeGiftTerms(bonus: BonusSettings): TermsSection[] {
  const tiers = STACK_LEVELS.filter((t) => bonus.tiers.includes(t)).map((t) => LEVEL_NAME[t])
  return [
    {
      heading: 'Who it’s for',
      lines: [
        bonus.firstOrderOnly
          ? 'Your first order with us only, and one free gift per customer. We check by account and by email address.'
          : 'Any order that meets these terms, one free gift per order.',
        `Stacks only: ${tiers.length ? tiers.join(', ') : 'no'} stacks from the quiz or the Amp Consult. Not a single product bought on its own, and not a shop basket.`,
      ],
    },
    {
      heading: 'What you need to spend',
      lines: [`Stacks from ${formatGBP(bonus.minSubtotal)}, before any discount. Delivery doesn’t count towards it.`],
    },
    {
      heading: 'What it costs you',
      lines: [
        'Nothing. The gift never makes your stack cost more, never makes your stack saving smaller and never adds a delivery charge. It shows on your receipt as a £0.00 line.',
        'Which gift you get is chosen from the products we’re giving away at the time, to suit your answers. You can’t swap it for cash or for another product.',
      ],
    },
    {
      heading: 'Discount codes',
      lines: [
        bonus.codes === 'better-of'
          ? 'The gift doesn’t combine with a discount code. You get whichever is worth more on your order, and your receipt says which.'
          : 'The gift doesn’t combine with a discount code. Using a code means no gift.',
      ],
    },
    {
      heading: 'Subscriptions',
      lines: ['On a subscription, the gift comes in your first box only. Later boxes don’t include it.'],
    },
    {
      heading: 'While stocks last',
      lines: [
        'If your gift sells out before you pay, we tell you before any money is taken. If it sells out after you’ve paid, we send your order without it and tell you by email; the gift was free, so there is nothing to refund for it.',
      ],
    },
    {
      heading: 'Returns',
      lines: [
        'If you return your stack, you don’t need to send the gift back, and nothing is taken off your refund for it.',
        'If you return part of your stack and what you keep is under the minimum spend, you keep the gift; we don’t charge you for it.',
      ],
    },
    {
      heading: 'Changes',
      lines: ['We can end or change the free gift at any time. That never affects an order you’ve already placed.'],
    },
  ]
}

/**
 * The first-box guarantee's terms (Option 1), for sign-off before the switch
 * goes on. A satisfaction promise about the order, never a health promise:
 * nothing here says what the products will do. Refunds are made by hand, from
 * the order, to the card that paid.
 */
export function guaranteeTerms(): TermsSection[] {
  return [
    {
      heading: 'What it is',
      lines: [
        'If your first CHRGD box isn’t right for you, tell us and we’ll refund what you paid for it.',
        'It’s about whether the box suits you. It is not a promise about any result from the products.',
      ],
    },
    {
      heading: 'Who it’s for',
      lines: [
        'Your first order only, one-off or the first box of a monthly plan. One per customer: one household, one address, one card.',
      ],
    },
    {
      heading: 'How to ask',
      lines: [
        'Reply to your order confirmation email, or email us, within 30 days of your box being delivered. Tell us your order reference; you don’t have to give a reason.',
        'You don’t need to send anything back. If you have unopened products, we may ask you to return them, at our cost.',
      ],
    },
    {
      heading: 'What you get back',
      lines: [
        'What you paid for the first box, including delivery, to the card you paid with, within 14 days of us agreeing it. A free gift and any discount stay with the order and aren’t refunded as cash.',
        'On a monthly plan, the refund covers the first box only. Your plan carries on unless you cancel it, which you can do at any time in your account.',
      ],
    },
    {
      heading: 'Ask your trainer',
      lines: [
        'While it’s on, you can message our trainer from your hub about your training. A real person, one of our team, reads every question and writes every answer: nothing you send goes to an AI.',
        'Answers are general fitness coaching, not medical advice. For an injury, pain or a health condition, see your GP or a physio first, and please don’t send medical details.',
        'Your hub shows how soon the trainer usually answers. It’s what we work to, not a guaranteed response time, and there’s a limit on questions a day so everyone gets an answer.',
        'Your questions and the answers are kept with your account, included in your data export, and deleted with your account.',
        'While form checks are on, you can send a video clip of up to 30 seconds with a question. Only you and our team can watch it, and it’s deleted after 30 days.',
      ],
    },
    {
      heading: 'Your other rights',
      lines: [
        'This guarantee is on top of your legal rights, including your right to cancel an online order, not instead of them.',
      ],
    },
  ]
}


/**
 * The member hub's terms: what the hub is, how long it's open, and the
 * conditions every member price carries. Linked from the hub card on the
 * results page and from the hub. Draft wording, for sign-off (review pack).
 */
export function memberHubTerms(input: { freeOver: number; /** While the hub is on sale on its own (`lib/hub-plan`). */ hubPlan?: { monthly: number } | null }): TermsSection[] {
  const gbp = (n: number) => (Number.isInteger(n) ? `£${n}` : `£${n.toFixed(2)}`)
  const onItsOwn: TermsSection[] = input.hubPlan
    ? [
        {
          heading: 'The member hub on its own',
          lines: [
            `You can also join the member hub on its own, without an order, for ${gbp(input.hubPlan.monthly)} a month paid by card. It opens your training plan, Ask your trainer and member prices on what you buy. Your stack guide, reminders and check-ins come with an order, because they’re built from what you’ve bought.`,
            'Your membership renews every month until you cancel. Cancel any time in your hub: it stays open to the end of the month you’ve paid for, and nothing more is taken.',
            'Cancel within 14 days of joining and we refund your first payment in full, and your membership ends then.',
            'If the 90 days from an order are still running when you join, your first payment is taken when they end. While you’re a member, any order gives you 90 days free and your next payment waits until they’re used up.',
            'If we change the monthly price, we’ll email you at least 30 days before it applies to you, and you can cancel before then.',
          ],
        },
      ]
    : []
  return [
    {
      heading: 'What the member hub is',
      lines: [
        'Your member hub comes with any CHRGD order, one-off or monthly. Sign in at /myhub with the email you ordered with to open it.',
        'It holds your stack guide and reminders, Amp’s check-ins, tips for your stack, member prices on what you’ve bought and, while they’re running, your training plan and Ask your trainer.',
        'The 90 days that come with an order are free, and they are not a subscription: they end by themselves, with nothing to cancel and nothing charged.',
      ],
    },
    ...onItsOwn,
    {
      heading: 'How long it’s open',
      lines: [
        'For 90 days from your latest order. Every order, including a member price order, starts the 90 days again.',
        'On a monthly plan it stays open while the plan is running, and for 90 days after it ends.',
        'When it closes you keep your guide and your order history; the rest opens again with your next order.',
      ],
    },
    {
      heading: 'Member prices',
      lines: [
        'Each product you buy gets its own member price in your hub. It opens about a week before that product is due to run out, worked out from the pack size and how you said you use it, and stays open until your hub closes.',
        'A member price is for you only, through your hub, signed in. One use each: once you’ve bought it, that product’s next member price follows your new pack.',
        'Member prices don’t combine with discount codes, the free gift or any other offer.',
        `A top-up box of member prices ships free at £${input.freeOver.toFixed(2)} or more, anywhere in the UK we deliver (not Northern Ireland, Guernsey or Jersey). Products not yet due can join a box with one that is, if they’re due within 30 days.`,
        'On a monthly plan, your plan’s own products come at your monthly price. Member prices are for products you buy on top.',
        'We set member prices product by product and may change them; the price shown in your hub when you check out is the price you pay. We may end member prices, but never for an order you’ve already placed.',
      ],
    },
    {
      heading: 'Emails',
      lines: [
        'We email you when a member price opens. Every one of those emails has a link to stop them, and you can turn them off in your hub. Order and account emails always arrive.',
      ],
    },
    {
      heading: 'Your training plan',
      lines: [
        'The training plan is general fitness guidance, not medical advice. Check with your GP before starting if the readiness check suggests it, and stop if anything hurts.',
        'While our trainer checks plans, each new plan, new setup or rebuilt week is checked by our in-house fitness expert. You can use it straight away while it’s being checked, and change any part of it at any time.',
      ],
    },
    {
      heading: 'Ask your trainer',
      lines: [
        'While it’s on, you can message our trainer from your hub about your training. A real person, one of our team, reads every question and writes every answer: nothing you send goes to an AI.',
        'Answers are general fitness coaching, not medical advice. For an injury, pain or a health condition, see your GP or a physio first, and please don’t send medical details.',
        'Your hub shows how soon the trainer usually answers. It’s what we work to, not a guaranteed response time, and there’s a limit on questions a day so everyone gets an answer.',
        'Your questions and the answers are kept with your account, included in your data export, and deleted with your account.',
        'While form checks are on, you can send a video clip of up to 30 seconds with a question. Only you and our team can watch it, and it’s deleted after 30 days.',
      ],
    },
    {
      heading: 'Your other rights',
      lines: [
        'None of this changes your rights as a consumer, including to cancel an order and to a refund for faulty goods.',
      ],
    },
  ]
}
