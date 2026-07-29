import {
  ALLERGEN_CHECK_SENTENCE,
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

  it('grants a free exit during the notice window, including inside a minimum term', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('cancel free of charge')
    expect(prose).toContain('including during any minimum term')
  })

  it('describes both unavailability options and the never-costs-you-more promise', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('keep my plan whole')
    expect(prose).toContain('take it off my plan')
    expect(prose).toContain('never costs you more')
    // The safety override has to be in the terms, not just in the code.
    expect(prose).toContain('never substitute a product that conflicts with the dietary requirements')
  })

  it('covers the minimum term, statutory cancellation and skips/pauses', () => {
    const prose = proseOf(terms())
    expect(prose).toContain('consumer contracts regulations 2013')
    expect(prose).toContain('minimum term')
    expect(prose).toContain('skipping a box does not cost you a payment')
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
