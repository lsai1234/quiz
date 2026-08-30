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
import {
  DISCLAIMER_VERSION,
  HEALTH_DATA_VERSION,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from './versions'

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

/**
 * Where a member sends goods back inside their 14-day cancellation period.
 *
 * Its own setting rather than a reuse of `registeredAddress`: a registered
 * office is frequently an accountant's, and parcels arriving there is how a
 * statutory return turns into a lost one. Falls back to the registered address
 * so the email is never sent with nowhere to post to, and carries the same
 * obvious-placeholder convention as everything else here.
 */
export const RETURNS_ADDRESS =
  process.env.NEXT_PUBLIC_RETURNS_ADDRESS || LEGAL_ENTITY.registeredAddress

/** The return address as lines, for an email or a label. */
export function returnAddressLines(address = RETURNS_ADDRESS): string[] {
  return address.split(',').map((line) => line.trim()).filter(Boolean)
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

export type LegalDocumentId = 'terms' | 'disclaimer' | 'privacy' | 'health-data'

/**
 * Versions live in their own leaf module so a client component needing one does
 * not pull this file — and with it the pricing config — into its bundle.
 * Re-exported here so every existing import keeps working.
 */
export {
  TERMS_VERSION,
  DISCLAIMER_VERSION,
  PRIVACY_VERSION,
  HEALTH_DATA_VERSION,
  SETTLEMENT_TERMS_VERSION,
} from './versions'

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

// ─── Privacy notice ───────────────────────────────────────────────────────────

/**
 * How long we keep each kind of record. Single source of truth: the retention
 * job reads these same constants, so the notice cannot promise a window the
 * code does not enforce. See `lib/legal/retention.ts`.
 */
export const RETENTION = {
  /** Quiz answers and the plan, after a subscription ends. */
  quizAfterEndDays: 365,
  /** Orders — set by tax law, not by us. HMRC requires six years. */
  ordersYears: 6,
  /** The rendered body of a sent email. The row itself is kept as an audit trail. */
  emailBodyDays: 90,
  /** Consent records, after the account closes. Evidence of what was agreed. */
  consentAfterCloseYears: 6,
  /** IP and user agent on a consent record. */
  consentMetadataDays: 365,
  /** Funnel analytics. */
  analyticsDays: 400,
  /** An account that never completed a purchase and has gone quiet. */
  abandonedAccountDays: 90,
} as const

export function getPrivacyDocument(entity = LEGAL_ENTITY): LegalDocument {
  return {
    id: 'privacy',
    title: 'Privacy notice',
    version: PRIVACY_VERSION,
    effectiveFrom: '2026-08-30',
    summary:
      'What we collect, why, who else sees it, how long we keep it, and how to get it back or have it deleted.',
    sections: [
      {
        id: 'who-we-are',
        heading: 'Who we are',
        body: [
          `${entity.tradingName} is a trading name of ${entity.legalName} (company number ${entity.companyNumber}), registered at ${entity.registeredAddress}. We are the data controller for the information described here.`,
          `For anything about your data — a copy of it, a correction, or deletion — email ${entity.contactEmail}.`,
          'If you are not happy with how we have handled your information you can complain to the Information Commissioner’s Office at ico.org.uk, or by calling 0303 123 1113. We would rather you came to us first so we can put it right.',
        ],
      },
      {
        id: 'what-we-collect',
        heading: 'What we collect',
        body: [
          'From the quiz: your goals, your training and diet, your daily routine, your age band, sex and weight band, your first name if you give it, and what supplements you already take. Answering is how the plan gets built.',
          'From the safety screen: whether you are pregnant or breastfeeding, whether you take prescription medication, and whether you have a shellfish allergy. This is health information and we treat it differently from everything else — see the next section.',
          'When you subscribe: your email address, your delivery address and phone number, and your payment details. Payment card details go straight to Stripe and never reach our systems.',
          'While you are a member: your plan and how you change it, your order history, the emails we have sent you, and any check-ins you write.',
          'Automatically: anonymous usage events so we can see where people get stuck in the quiz. These carry a random per-visit id that is discarded when you close the tab. No cookie, no third-party tracker, and we honour Do Not Track and Global Privacy Control.',
          'You can switch that off for this device at the bottom of this page, and it stops straight away.',
        ],
      },
      {
        id: 'health-information',
        heading: 'Your health information, specifically',
        body: [
          'Pregnancy, breastfeeding, prescription medication and allergies are special category data under the UK GDPR. We only ever process them because you have explicitly agreed on the safety screen, and you can decline — the quiz works without them, it simply cannot rule out products for you.',
          'We use them for exactly one thing: removing products that are not suitable for you, both when your plan is first built and whenever we would otherwise substitute something into it.',
          'They are never sent to any third party. They are not used for marketing, they are not used to profile you, and they are not included in anything our AI is asked to write. Our staff can see your plan, but the flags themselves are not displayed in the tools they use day to day.',
          'You can withdraw your agreement at any time from your account. Because these answers are what our product exclusions run on, withdrawing them means we can no longer promise a plan is suitable for you — so we will pause automatic substitutions and ask you what you would like to do rather than carry on without them.',
        ],
      },
      {
        id: 'why-we-can',
        heading: 'Why we are allowed to use it',
        body: [
          'To provide the plan you asked for, take payment and deliver your order, we rely on our contract with you.',
          'For your health information, we rely on your explicit consent, which you give on the safety screen and can withdraw at any time.',
          'To keep records of orders and tax, we rely on our legal obligations.',
          'To keep the site working, spot faults and prevent fraud, we rely on our legitimate interests in running the business safely. You can object to this and we will look at it properly.',
          'For marketing email, we rely on your consent or, where you have bought from us, the soft opt-in — and every message carries a one-click unsubscribe.',
        ],
      },
      {
        id: 'ai',
        heading: 'Where AI is involved',
        body: [
          'We use OpenAI to help order the quiz questions, to pick between products we have already shortlisted, and to write the description of your stack.',
          'What is sent: your goals, age band, sex, diet, lifestyle answers and any free-text follow-ups. What is never sent: your name, your email, your address, and your safety-screen answers.',
          'The model can only choose from options our own engine has already decided are suitable and safe for you. It cannot add a product, invent a question, or change what an option means, and nothing it writes is a medical claim.',
          'No decision here has a legal or similarly significant effect on you — you can change, swap or ignore anything we suggest — so this is not the kind of automated decision-making you have a specific right to object to. If you would rather a person looked at your plan, email us and we will.',
          'OpenAI processes this in the United States. That transfer is covered by the UK Addendum to the European Commission’s standard contractual clauses.',
        ],
      },
      {
        id: 'who-else',
        heading: 'Who else sees it',
        body: [
          'Stripe, for payments. PowerBody, our supplier, who receive your name, delivery address, phone and email so they can send your order — and nothing about your health. Our email provider, to deliver receipts and notices. Vercel, who host the site. OpenAI, as described above.',
          'Each of them acts on our instructions under a contract and cannot use your information for their own purposes. We do not sell your data, and we never share it with advertisers.',
        ],
      },
      {
        id: 'how-long',
        heading: 'How long we keep it',
        body: [
          `Your quiz answers and your plan: while you are a member, and for ${RETENTION.quizAfterEndDays} days after your subscription ends, so you can come back without starting over.`,
          `Orders and invoices: ${RETENTION.ordersYears} years, because tax law requires it.`,
          `The text of emails we sent you: ${RETENTION.emailBodyDays} days. We keep a record that the email was sent for longer, without its contents.`,
          `Consent records: ${RETENTION.consentAfterCloseYears} years after your account closes, because they are the evidence of what you agreed to. The IP address and browser recorded alongside are deleted after ${RETENTION.consentMetadataDays} days.`,
          `Anonymous usage events: ${RETENTION.analyticsDays} days.`,
          `If you start an account but never complete a purchase, we delete everything after ${RETENTION.abandonedAccountDays} days.`,
          'When you ask us to delete your account we do it straight away, keeping only what the law requires us to keep.',
        ],
      },
      {
        id: 'your-rights',
        heading: 'Your rights',
        body: [
          'You can get a copy of everything we hold about you, and you can download it yourself from your account at any time — you do not have to ask.',
          'You can delete your account from your account settings. That removes your quiz answers, your plan, your check-ins and your saved cards. We keep order records where tax law requires it, and the consent records that show what you agreed to.',
          'You can correct anything that is wrong, ask us to restrict how we use your information, object to processing we do on legitimate interests, and withdraw any consent you have given.',
          'We answer within one month and we do not charge for it.',
        ],
      },
      {
        id: 'security',
        heading: 'How we protect it',
        body: [
          'Passwords are hashed, never stored. Session tokens are stored hashed too, so a copy of our database does not let anyone sign in as you. Everything travels over HTTPS.',
          'Access to member data is limited to the people who run the business, and your safety-screen answers are kept out of the day-to-day tools entirely.',
          'If something does go wrong and it puts you at risk, we will tell you and the ICO within 72 hours of finding out.',
        ],
      },
      {
        id: 'children',
        heading: 'Children',
        body: [
          'CHRGD is not for under-18s. We do not knowingly collect information about children, and if we find we have, we delete it. If you believe a child has given us their details, email us and we will remove them.',
        ],
      },
      {
        id: 'changes',
        heading: 'Changes to this notice',
        body: [
          'If we change how we use your information in a way that affects you, we will tell you rather than quietly updating this page. Where the change involves your health information we will ask you to agree again.',
          'The version you are reading is shown at the top of this page.',
        ],
      },
    ],
  }
}

// ─── Health data consent (Article 9) ──────────────────────────────────────────

/**
 * The explicit consent taken at the safety screen, before a single health
 * answer is collected.
 *
 * Its own document rather than a paragraph in the terms, because Article 9(2)(a)
 * consent has to be specific and separable — bundled into a subscription
 * agreement it is neither, and a member who wants the plan would have no way to
 * refuse the health processing. It is short on purpose: this is read in the
 * middle of a quiz, on a phone.
 */
export function getHealthDataDocument(entity = LEGAL_ENTITY): LegalDocument {
  return {
    id: 'health-data',
    title: 'Using your health answers',
    version: HEALTH_DATA_VERSION,
    effectiveFrom: '2026-08-30',
    summary: 'What the next question does with your answer, and how to take it back.',
    sections: [
      {
        id: 'what',
        heading: 'What you are agreeing to',
        body: [
          'The next screen asks whether you are pregnant or breastfeeding, take prescription medication, or have a shellfish allergy. That is health information, and the law says we need your clear permission before we can use it.',
          'We use it for one thing only: leaving out products that are not right for you. It never adds anything to your plan.',
          'It is not sent to anyone else, it is not used for marketing, and it is not included in anything our AI writes.',
        ],
      },
      {
        id: 'optional',
        heading: 'You do not have to',
        body: [
          'Skip it and the quiz still works — you will still get a plan. We simply will not be able to rule products out for you, so you will need to check the label yourself before taking anything.',
          `You can change your mind whenever you like from your account, or by emailing ${entity.contactEmail}. Withdrawing stops us using these answers and deletes them.`,
        ],
      },
      {
        id: 'more',
        heading: 'The detail',
        body: [
          'How long we keep this, who can see it, and every other right you have is set out in our privacy notice.',
        ],
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
