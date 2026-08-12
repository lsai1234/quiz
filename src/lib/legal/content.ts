/**
 * The legal documents, as versioned data.
 *
 * ⚠️ NOT LEGAL ADVICE. This copy was drafted to cover the commercial promises
 * the app actually makes — price changes, substitutions, the minimum term, and
 * the health/allergen position — in plain English. It has NOT been reviewed by
 * a solicitor. Have one review it before taking real money. `missingEntityDetails()`
 * lists the company details that must be filled in first; the terms page shows a
 * warning banner while any are outstanding, so this can't quietly go live.
 *
 * Two things make this file the single source of truth rather than one of
 * several copies of the same sentences:
 *
 *  • Every disclaimer that appears anywhere — checkout, confirmation emails,
 *    substitution emails, the hub — is built from the constants here. There is
 *    exactly one definition of "check the label", and P5's email tests assert
 *    against it.
 *
 *  • The documents are BUILT FROM THE LIVE CONFIG, not hardcoded. The terms
 *    quote the real notice period, so if a founder changes
 *    `priceChangeNoticeDays` in the portal the promise changes with it — and the
 *    content hash stored against a member's consent changes too, which is
 *    exactly what you want from evidence.
 */
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'

// ─── Who we are ───────────────────────────────────────────────────────────────

/**
 * Company details for the legal documents. The placeholders are deliberate —
 * inventing a company number or registered address would be worse than an
 * obvious gap. Fill these in (or wire them to env) before go-live.
 */
export const LEGAL_ENTITY = {
  tradingName: 'CHRGD',
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || '[Registered company name]',
  companyNumber: process.env.NEXT_PUBLIC_COMPANY_NUMBER || '[Company number]',
  registeredAddress: process.env.NEXT_PUBLIC_REGISTERED_ADDRESS || '[Registered address]',
  contactEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '[support email]',
}

/** Entity details still on their placeholder — surfaced as a warning in the app. */
export function missingEntityDetails(entity = LEGAL_ENTITY): string[] {
  return Object.entries(entity)
    .filter(([, v]) => typeof v === 'string' && v.startsWith('['))
    .map(([k]) => k)
}

// ─── Document model ───────────────────────────────────────────────────────────

export interface LegalSection {
  id: string
  heading: string
  /** Paragraphs. Rendered in order; no markup, so the text and the hash match. */
  body: string[]
}

export interface LegalDocument {
  id: LegalDocumentId
  title: string
  /**
   * Editorial version. Bump when the MEANING changes, so members can be asked to
   * re-consent. Wording that varies with config (the notice period) is caught by
   * the content hash instead — see `documentText`.
   */
  version: string
  effectiveFrom: string
  /** One line, for the checkout summary and the page header. */
  summary: string
  sections: LegalSection[]
}

export type LegalDocumentId = 'terms' | 'disclaimer'

/** Bump on a material change. Triggers the in-hub re-consent notice. */
export const TERMS_VERSION = '2026-08-12'
export const DISCLAIMER_VERSION = '2026-07-29'

/**
 * The first terms version that discloses the cancel settlement — the balance a
 * member settles on goods already sent them when they cancel early.
 *
 * This is a GATE, not a note. A member who agreed to the previous terms was told
 * they could cancel "with no fee", and we do not get to charge them a balance
 * they were never shown; they cancel free until they accept these terms. Consent
 * records are keyed by version (see `lib/legal/consent.ts`), so this is
 * enforceable per member rather than by deploy date.
 *
 * Moved to 2026-08-12. Most of that revision is more generous — the balance is
 * capped at what the member has paid, anything under £5 is waived, and a
 * first-month discount is no longer clawed back — but one part is a CORRECTION
 * rather than a concession: the previous wording said the balance "reaches zero
 * as soon as [payments catch up]" and stopped there, which is only half true.
 * It is a sawtooth, and it rises again each time a multi-month item ships. A
 * member who agreed to the old sentence was not told that, so the gate moves
 * with it and they re-consent before anything is charged.
 */
export const SETTLEMENT_TERMS_VERSION = '2026-08-12'

// ─── Shared sentences (one definition, used everywhere) ───────────────────────

/**
 * The allergen line. Every substitution email must carry this verbatim — it's
 * the sentence that turns "we swapped your product" from a convenience into an
 * informed one. Asserted by the notification tests in P5.
 */
export const ALLERGEN_CHECK_SENTENCE =
  'This is a different product, so check the ingredients and allergen information on the pack before you use it.'

/**
 * The general allergen position. Dietary tags come from supplier data and can
 * change between batches or when a manufacturer reformulates, so the pack in
 * someone's hand is the authority — not our filter.
 */
export const READ_THE_LABEL_SENTENCE =
  'Always read the label on the product you receive. We show dietary information (vegan, gluten-free and so on) from our supplier’s data, and formulations can change between batches — so the pack in your hand is always the final word, not our filters.'

export const NOT_MEDICAL_ADVICE_SENTENCE =
  'CHRGD sells food supplements. Nothing we send you is medical advice, diagnosis or treatment, and it is not a substitute for advice from your doctor or pharmacist.'

/** The short version shown at checkout, above the consent box. */
export const CHECKOUT_DISCLAIMER_POINTS: string[] = [
  NOT_MEDICAL_ADVICE_SENTENCE,
  'Your plan is built from the answers you gave us, which we can’t verify. You know your body and your medical history — we don’t.',
  'Speak to a doctor before starting if you are pregnant or breastfeeding, under 18, taking medication, or have a medical condition.',
  READ_THE_LABEL_SENTENCE,
  'Stop taking a product and get medical advice if you have any kind of reaction to it.',
]

/**
 * The billing points shown at checkout, above the consent box.
 *
 * The settlement is disclosed HERE, before anyone pays — not only in the terms.
 * A balance that only appears at the moment someone tries to leave is the kind
 * of surprise that gets a term struck down however sound the arithmetic is; one
 * shown next to the flat-monthly explanation, which is the reason it exists,
 * reads as what it is.
 */
export const CHECKOUT_BILLING_POINTS: string[] = [
  'You pay one flat amount every month. It is the smoothed average of your plan, so your bill stays the same even in months when a big tub is due.',
  'No minimum term and no cancellation fee — cancel whenever you like, from your account.',
  'Because longer-lasting items are spread across the months they last, cancelling early can leave a balance on what has already been sent you. You settle that, and nothing more. It falls to zero as your payments catch up, and you always see the figure before you confirm.',
]

/** The liability wording, shared by both documents so it can't drift. */
const LIABILITY_BODY = (entity: typeof LEGAL_ENTITY): string[] => [
  `We do not exclude or limit our liability to you where it would be unlawful to do so. That includes liability for death or personal injury caused by our negligence, for fraud or fraudulent misrepresentation, and for anything else that cannot lawfully be excluded under the Consumer Rights Act 2015 or the Unfair Contract Terms Act 1977.`,
  `Subject to that, ${entity.tradingName} is not liable for a health outcome that results from information you gave us being incomplete or inaccurate, from a product being taken other than as directed, or from an ingredient sensitivity you had not told us about and that was declared on the product label.`,
  `We are responsible for the products we send you being of satisfactory quality, as described, and fit for purpose. If something arrives damaged, wrong or not as described, tell us and we will put it right — those rights are yours by law and nothing here affects them.`,
]

// ─── Terms & conditions ───────────────────────────────────────────────────────

export function getTermsDocument(
  config: PricingConfig = getPricingConfig(),
  entity = LEGAL_ENTITY,
): LegalDocument {
  const noticeDays = Math.max(0, config.priceChangeNoticeDays)

  return {
    id: 'terms',
    title: 'Subscription terms',
    version: TERMS_VERSION,
    effectiveFrom: '2026-07-29',
    summary:
      'What you pay, what happens when prices or products change, and how to cancel — including the balance to settle on anything already sent you. Written to be read, not skimmed past.',
    sections: [
      {
        id: 'about',
        heading: 'Who we are and what this covers',
        body: [
          `${entity.tradingName} is a trading name of ${entity.legalName} (company number ${entity.companyNumber}), registered at ${entity.registeredAddress}. You can reach us at ${entity.contactEmail}.`,
          'These terms cover your CHRGD subscription — the monthly plan built from your quiz answers. By subscribing you agree to them. If you buy a one-off bundle instead, only the sections about products, health and our responsibilities apply.',
        ],
      },
      {
        id: 'plan',
        heading: 'Your plan and what you pay',
        body: [
          'Your plan is billed as one flat amount every month. That amount is the smoothed average of everything on your plan — items still arrive on their own schedules (some monthly, some every two or three months), but you pay the same predictable figure each month rather than a different amount every time something ships.',
          'Because the cost of longer-lasting items is spread this way, an early box can hold more value than you have paid for at that point. That evens out as you go, and there is nothing to think about while you are subscribed — but it is why cancelling early can leave a balance to settle on what has already been sent. See “Cancelling, and settling what we have already sent you”.',
          'If you claimed a first-month discount, it applies to your first payment only. The ongoing monthly price is shown clearly before you pay, and it is the price that continues afterwards.',
          'Your subscribe-and-save discount is fixed for your bundle and carries through anything you add or swap later, so changing your plan never quietly costs you your discount.',
        ],
      },
      {
        id: 'price-changes',
        heading: 'Prices can change',
        body: [
          'Our prices are not fixed forever. We buy from suppliers whose costs move, and when they do we may change what you pay. Any change applies to future billing only — we will never re-charge you for a month you have already paid.',
          noticeDays > 0
            ? `If your monthly price is going up, we will email you at least ${noticeDays} days before the new price takes effect. That email will tell you the current price, the new price, and the date it starts.`
            : 'If your monthly price is going up, we will email you before the new price takes effect, telling you the current price, the new price, and the date it starts.',
          `You do not have to accept an increase. You can cancel free of charge at any point between that email and the date the new price starts. Cancel in that window and there is nothing to pay beyond what you have already been billed — we waive any balance outstanding on goods already sent you.`,
          'We often absorb supplier increases rather than passing them on, and if our costs fall we may lower your price. We will not raise your price for any reason other than a genuine change in what a product costs us or a change in tax.',
          'Separately from this, your monthly amount changes automatically when YOU change your plan — adding a product, removing one, or changing how much you get through. Those changes are shown to you with the new figure before you confirm them.',
        ],
      },
      {
        id: 'availability',
        heading: 'If a product becomes unavailable',
        body: [
          'Occasionally a product on your plan goes out of stock at our supplier, or is discontinued altogether. When you subscribe you tell us which of two things you would like us to do, and you can change your answer at any time in your account — for your whole plan or product by product.',
          '“Keep my plan whole” — we swap in the closest equivalent product and your monthly stays the same. A replacement is always from the same category, always the same or better value, and never costs you more: if the closest match is more expensive, we hold your price where it is and absorb the difference.',
          '“Take it off my plan” — we remove the product and your monthly goes down by what it was contributing, from your next payment.',
          'Either way, we email you to tell you what happened, and you can change it yourself in your account afterwards — swap the replacement for something else, or add a different product back.',
          'We will never substitute a product that conflicts with the dietary requirements or allergies you told us about. If we cannot find a replacement that is both available and suitable for you, we remove the product and lower your monthly rather than sending you something that might not be right — even if you asked us to keep your plan whole. If a product we send you is a substitute, please still read its label; see our health and allergen information.',
          'If we remove a product and you had already paid towards a delivery you never received, that value is credited back against your next payment. We do not charge you for goods we could not send.',
        ],
      },
      {
        id: 'deliveries',
        heading: 'Deliveries, skips and pauses',
        body: [
          'You choose which day of the month your deliveries land, and you can move a delivery, skip one, or ask for something early from your account.',
          'Skipping a box does not cost you a payment — the value of the skipped box is credited against your next one.',
          'You can pause your plan for up to three months. Pausing stops billing and deliveries, your plan stays exactly as it is, and there is nothing to settle — it is not a cancellation.',
        ],
      },
      {
        id: 'term',
        heading: 'Cancelling, and settling what we have already sent you',
        body: [
          'There is no minimum term and no cancellation fee. You can cancel whenever you like, from your account, in a couple of taps — we will never ask you to phone us or make you wait out a notice period.',
          'What you do settle when you cancel is the balance on anything we have already sent you and you have not finished paying for. This is not a charge for leaving; it is the outstanding balance on goods you have received and kept.',
          'Here is why it can arise. Your monthly amount is a smoothed average, so items that last several months are spread across those months rather than charged in full the month they arrive. That is good for you while you are subscribed — it keeps your bill flat and predictable instead of spiking whenever a big tub is due. But it means a first box can contain more value than a first payment covers.',
          'A worked example. Your plan is £70 a month: a £30 protein you get every month, and two £60 tubs that each last three months (£20 a month each). Your first box contains all three — £150 of product — and you have paid £70. The difference is £80 — but we never ask you for more than you have already paid us, so you would settle £70, keep everything in the box, and owe nothing further.',
          'That cap always applies, whatever the arithmetic says. And if the balance comes to £5 or less, there is nothing to pay at all.',
          'If you claimed a first-month discount when you joined, we do not take it back when you leave. Your balance is worked out as though you had paid the full monthly amount, so accepting the offer can never make leaving cost you more.',
          'The balance only ever covers goods already dispatched to you, and we never charge you for a box that has not shipped. It falls every month as your payments catch up with what was sent, and reaches zero when they do — but it rises again each time a new multi-month item arrives, because that item has only just started being paid for. So there is a regular point in your plan, usually a month or two away, where leaving costs nothing at all. We will always show you when that next date is, so you can leave then instead if you would rather.',
          'You will see the exact figure, and what it is made up of, before you confirm the cancellation. Your plan then ends and nothing further is billed.',
          'Some cancellations settle nothing at all. You pay no balance if you cancel during a price-increase notice period (see “Prices can change”), if you are cancelling after we changed your plan ourselves because a product became unavailable, or if your payments have already covered everything sent to you.',
          'You also have the statutory right to cancel within 14 days of your first order under the Consumer Contracts Regulations 2013. That right comes first: exercise it and you return any unopened products for a refund rather than settling a balance. For hygiene reasons we cannot refund opened supplements unless they are faulty.',
          'Pausing is not cancelling. You can pause for up to three months with nothing to settle — deliveries and billing simply stop and your plan waits for you.',
        ],
      },
      {
        id: 'your-info',
        heading: 'The information you give us',
        body: [
          'Your plan is built from what you tell us in the quiz — your goals, your training, your diet, any allergies, and what you already take. We use those answers to exclude products that are not suitable for you.',
          'We cannot verify any of it, so please keep it accurate and tell us in your account if something changes — particularly an allergy, a dietary requirement, a medication, or a pregnancy. Those answers are what our exclusions run on, including when we choose a replacement product for you.',
        ],
      },
      {
        id: 'health',
        heading: 'Health, suitability and allergens',
        body: [
          NOT_MEDICAL_ADVICE_SENTENCE,
          READ_THE_LABEL_SENTENCE,
          'Our full health and allergen information forms part of these terms. Please read it — it is short.',
        ],
      },
      {
        id: 'liability',
        heading: 'Our responsibility to you',
        body: LIABILITY_BODY(entity),
      },
      {
        id: 'changes',
        heading: 'Changes to these terms',
        body: [
          'We may update these terms — for example when we add a feature or the law changes. If a change materially affects you, we will tell you and ask you to accept the new version before it applies to your plan.',
          'The version you agreed to, and when you agreed to it, is recorded against your account.',
        ],
      },
      {
        id: 'contact',
        heading: 'Complaints, contact and law',
        body: [
          `If something has gone wrong, email ${entity.contactEmail} and we will come back to you. We would much rather fix it than have you cancel.`,
          'These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. If you live in Scotland or Northern Ireland you can also bring proceedings in your local courts.',
          'Nothing in these terms affects your statutory rights as a consumer.',
        ],
      },
    ],
  }
}

// ─── Health disclaimer ────────────────────────────────────────────────────────

export function getDisclaimerDocument(entity = LEGAL_ENTITY): LegalDocument {
  return {
    id: 'disclaimer',
    title: 'Health, allergens and what we’re responsible for',
    version: DISCLAIMER_VERSION,
    effectiveFrom: '2026-07-29',
    summary:
      'We sell supplements, not medical advice. What that means, and why the label on the pack always wins.',
    sections: [
      {
        id: 'not-medical-advice',
        heading: 'This is not medical advice',
        body: [
          NOT_MEDICAL_ADVICE_SENTENCE,
          'Our quiz, your plan, the check-ins and anything our AI writes for you are all general information to help you choose supplements. None of it diagnoses a condition, treats one, or replaces a conversation with a qualified healthcare professional.',
          'Food supplements are meant to support a varied, balanced diet and a healthy lifestyle — not replace them.',
        ],
      },
      {
        id: 'based-on-your-answers',
        heading: 'Your plan is built from what you told us',
        body: [
          'We build your plan from your quiz answers and rule out products that do not fit them — no stimulants if you said no to caffeine, nothing non-vegan if you told us you are vegan, and so on.',
          'We have no way of checking any of it. If an answer was wrong, incomplete, or has changed since, your plan may no longer be right for you. Please keep your answers up to date in your account, and tell us straight away about a new allergy, medication or pregnancy.',
        ],
      },
      {
        id: 'speak-to-a-doctor',
        heading: 'When to speak to a doctor first',
        body: [
          'Please talk to your doctor or pharmacist before starting any supplement if you are pregnant, trying to conceive or breastfeeding; under 18; taking prescription medication (some supplements interact with medicines); living with a medical condition, including any liver, kidney or heart condition; or preparing for surgery.',
          'If you are already taking supplements, check you are not doubling up on the same ingredient across products.',
        ],
      },
      {
        id: 'allergens',
        heading: 'Allergens and dietary suitability',
        body: [
          READ_THE_LABEL_SENTENCE,
          'We show dietary tags to help you filter and choose. They are drawn from supplier data, they can be incomplete, and manufacturers reformulate products without telling us. Treat them as a helpful signal, not a guarantee.',
          'If you have a serious allergy, check the pack every single time — including on a product you have had before. Do not rely on our tags, our quiz, or the fact that a product was suitable last month.',
          'Products are often made in facilities that also handle milk, soy, egg, nuts, gluten and other allergens. The pack will say so where the manufacturer declares it.',
        ],
      },
      {
        id: 'substitutions',
        heading: 'If we substitute a product',
        body: [
          'When something on your plan is unavailable, we may swap in the closest equivalent — that is a choice you make when you subscribe, and you can change it any time.',
          ALLERGEN_CHECK_SENTENCE,
          'We never substitute across a dietary requirement or allergy you have told us about. If we cannot find a suitable replacement, we take the product off your plan and lower your monthly instead of sending you something that might not suit you.',
        ],
      },
      {
        id: 'reactions',
        heading: 'If you have a reaction',
        body: [
          'Stop taking the product and seek medical advice. If the reaction is severe — trouble breathing, swelling of the face or throat — treat it as an emergency and call 999.',
          `Please also tell us at ${entity.contactEmail} so we can take the product off your plan and look into it.`,
          'You can report a side effect from a supplement to the Food Standards Agency, and any suspected reaction involving a medicine through the MHRA Yellow Card scheme.',
        ],
      },
      {
        id: 'liability',
        heading: 'What we’re responsible for',
        body: LIABILITY_BODY(entity),
      },
    ],
  }
}

// ─── Serialisation (what gets hashed) ─────────────────────────────────────────

/**
 * The document as one deterministic string. This — not the version — is what a
 * consent record is hashed against, so a member's agreement is tied to the exact
 * words they were shown, including any that vary with config.
 */
export function documentText(doc: LegalDocument): string {
  return [
    `${doc.id}@${doc.version}`,
    doc.title,
    doc.summary,
    ...doc.sections.flatMap((s) => [s.heading, ...s.body]),
  ].join('\n')
}

/** Both documents a member accepts at checkout, in a stable order. */
export function checkoutDocuments(config: PricingConfig = getPricingConfig()): LegalDocument[] {
  return [getTermsDocument(config), getDisclaimerDocument()]
}
