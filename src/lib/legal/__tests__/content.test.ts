import {
  ALLERGEN_CHECK_SENTENCE,
  CHECKOUT_BILLING_POINTS,
  CHECKOUT_DISCLAIMER_POINTS,
  NOT_MEDICAL_ADVICE_SENTENCE,
  READ_THE_LABEL_SENTENCE,
  checkoutDocuments,
  documentText,
  getDisclaimerDocument,
  getTermsDocument,
  missingEntityDetails,
} from '@/lib/legal/content'
import { getPricingConfig, resetPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'

afterEach(() => resetPricingOverrides())

/** All the prose in a document, lowercased, for "does it actually say X?" checks. */
function proseOf(doc: ReturnType<typeof getTermsDocument>): string {
  return documentText(doc).toLowerCase()
}

describe('terms cover the promises the app makes', () => {
  const terms = () => getTermsDocument()

  it('states that prices can change and that it affects future billing only', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('prices are not fixed forever')
    expect(prose).toContain('future billing only')
    expect(prose).toContain('never re-charge you for a month you have already paid')
  })

  it('quotes the real notice period, so the promise tracks the config', () => {
    setPricingOverrides({ priceChangeNoticeDays: 45 })
    expect(proseOf(getTermsDocument(getPricingConfig()))).toContain('at least 45 days before')
  })

  it('falls back to notice-without-a-number rather than promising "at least 0 days"', () => {
    setPricingOverrides({ priceChangeNoticeDays: 0 })
    const prose = proseOf(getTermsDocument(getPricingConfig()))
    expect(prose).not.toContain('at least 0 days')
    expect(prose).toContain('we will email you before the new price takes effect')
  })

  it('grants a free exit during the notice window, waiving any outstanding balance', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('cancel free of charge')
    expect(prose).toContain('we waive any balance outstanding on goods already sent you')
  })

  it('describes both unavailability options and the never-costs-you-more promise', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('keep my plan whole')
    expect(prose).toContain('take it off my plan')
    expect(prose).toContain('never costs you more')
    // The safety override has to be in the terms, not just in the code.
    expect(prose).toContain('never substitute a product that conflicts with the dietary requirements')
  })

  it('covers statutory cancellation and skips/pauses', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('consumer contracts regulations 2013')
    expect(prose).toContain('skipping a box does not cost you a payment')
  })

  // ── The cancel settlement ───────────────────────────────────────────────────
  // Charging a balance on cancellation is only defensible because it is a debt
  // for goods received, disclosed before purchase — not a fee for leaving. These
  // assertions are the wording that makes that true, so they guard a legal
  // position, not a phrasing preference.

  it('promises cancellation with no minimum term and no fee', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('no minimum term and no cancellation fee')
    expect(prose).toContain('cancel whenever you like')
  })

  it('discloses the settlement as a balance on goods received, never as a fee for leaving', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('not a charge for leaving')
    expect(prose).toContain('outstanding balance on goods you have received')
    // Capped by what was actually sent, and falls to zero — both are the
    // substance of the promise, not decoration.
    expect(prose).toContain('only ever covers goods already dispatched')
    expect(prose).toContain('reaches zero')
    expect(prose).toContain('never charge you for a box that has not shipped')
  })

  it('explains WHY a balance can arise, and shows the arithmetic', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('smoothed average')
    // A worked example, because "smoothed average" means nothing to most people.
    expect(prose).toContain('£150 of product')
    expect(prose).toContain('£80')
  })

  it('discloses the three things that make the balance survivable', () => {
    // Each is a policy in `PRICING_CONFIG.settlement`, and each has to be a
    // promise in the terms before it is worth anything to the member.
    const prose = proseOf(terms())
    // Capped at what they have paid.
    expect(prose).toContain('never ask you for more than you have already paid')
    // Small balances waived.
    expect(prose).toContain('£5 or less, there is nothing to pay')
    // The intro discount is not clawed back at the exit.
    expect(prose).toContain('do not take it back when you leave')
  })

  it('admits the balance can RISE again, rather than only that it falls', () => {
    // The correction that moved SETTLEMENT_TERMS_VERSION. The balance is a
    // sawtooth: it climbs every time a multi-month item ships. Saying only that
    // it "reaches zero" describes half the curve, and the missing half is the
    // half that costs the member money.
    const prose = proseOf(terms())
    expect(prose).toContain('rises again each time a new multi-month item arrives')
    expect(prose).toContain('leaving costs nothing at all')
  })

  it('shows the figure before the member confirms', () => {
    expect(proseOf(terms())).toContain('before you confirm the cancellation')
  })

  it('lists the cases that settle nothing', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('price-increase notice period')
    expect(prose).toContain('after we changed your plan ourselves')
    expect(prose).toContain('pausing is not cancelling')
  })

  it('puts the statutory 14-day right ahead of the settlement', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('that right comes first')
  })

  it('discloses the settlement at checkout too, not only in the terms', () => {
    const points = CHECKOUT_BILLING_POINTS.join(' ').toLowerCase()
    expect(points).toContain('no minimum term and no cancellation fee')
    expect(points).toContain('balance on what has already been sent')
    expect(points).toContain('before you confirm')
  })

  it('carries the health and allergen position through to the terms themselves', () => {
    const prose = proseOf(terms())
    expect(prose).toContain(NOT_MEDICAL_ADVICE_SENTENCE.toLowerCase())
    expect(prose).toContain(READ_THE_LABEL_SENTENCE.toLowerCase())
  })
})

describe('the health disclaimer', () => {
  const disclaimer = () => getDisclaimerDocument()

  it('says plainly that this is not medical advice', () => {
    expect(proseOf(disclaimer())).toContain(NOT_MEDICAL_ADVICE_SENTENCE.toLowerCase())
  })

  it('tells people when to speak to a doctor first', () => {
    const prose = proseOf(disclaimer())
    for (const trigger of ['pregnant', 'under 18', 'prescription medication', 'medical condition']) {
      expect(prose).toContain(trigger)
    }
  })

  it('makes the pack authoritative over our dietary tags', () => {
    const prose = proseOf(disclaimer())
    expect(prose).toContain(READ_THE_LABEL_SENTENCE.toLowerCase())
    expect(prose).toContain('not a guarantee')
    expect(prose).toContain('check the pack every single time')
  })

  it('carries the substitution allergen sentence verbatim', () => {
    expect(proseOf(disclaimer())).toContain(ALLERGEN_CHECK_SENTENCE.toLowerCase())
  })

  it('limits liability without excluding what cannot lawfully be excluded', () => {
    // An unqualified "we aren't liable" is void under UCTA/CRA and worse than
    // none — the carve-outs are what make the rest of the clause stand up.
    const prose = proseOf(disclaimer())
    expect(prose).toContain('death or personal injury caused by our negligence')
    expect(prose).toContain('consumer rights act 2015')
    expect(prose).toContain('unfair contract terms act 1977')
  })

  it('tells people what to do about a reaction', () => {
    const prose = proseOf(disclaimer())
    expect(prose).toContain('stop taking the product')
    expect(prose).toContain('999')
  })
})

describe('one definition of each shared sentence', () => {
  it('reuses the checkout points rather than restating them', () => {
    expect(CHECKOUT_DISCLAIMER_POINTS).toContain(NOT_MEDICAL_ADVICE_SENTENCE)
    expect(CHECKOUT_DISCLAIMER_POINTS).toContain(READ_THE_LABEL_SENTENCE)
  })

  it('shares one liability clause between both documents', () => {
    const inTerms = getTermsDocument().sections.find((s) => s.id === 'liability')!.body
    const inDisclaimer = getDisclaimerDocument().sections.find((s) => s.id === 'liability')!.body
    expect(inTerms).toEqual(inDisclaimer)
  })
})

describe('document serialisation', () => {
  it('is deterministic for the same inputs', () => {
    expect(documentText(getTermsDocument())).toBe(documentText(getTermsDocument()))
  })

  it('changes when the wording changes, even though the version does not', () => {
    setPricingOverrides({ priceChangeNoticeDays: 30 })
    const a = documentText(getTermsDocument(getPricingConfig()))
    setPricingOverrides({ priceChangeNoticeDays: 60 })
    const b = documentText(getTermsDocument(getPricingConfig()))

    expect(a).not.toBe(b)
    expect(getTermsDocument().version).toBe(getTermsDocument().version)
  })

  it('returns both documents a member accepts at checkout', () => {
    expect(checkoutDocuments().map((d) => d.id)).toEqual(['terms', 'disclaimer'])
  })
})

describe('go-live guard', () => {
  it('reports every company detail still on a placeholder', () => {
    expect(missingEntityDetails({
      tradingName: 'CHRGD',
      legalName: '[Registered company name]',
      companyNumber: '12345678',
      registeredAddress: '[Registered address]',
      contactEmail: 'hi@example.com',
    })).toEqual(['legalName', 'registeredAddress'])
  })

  it('reports nothing once they are all filled in', () => {
    expect(missingEntityDetails({
      tradingName: 'CHRGD',
      legalName: 'CHRGD Ltd',
      companyNumber: '12345678',
      registeredAddress: '1 Example Street, London',
      contactEmail: 'hi@example.com',
    })).toEqual([])
  })
})
