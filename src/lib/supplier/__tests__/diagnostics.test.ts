/**
 * The supplier diagnostics have to be right about failure, not just about
 * success — a panel that says "all good" whatever the account does is worse
 * than no panel, because it is trusted. Each test below drives a provider that
 * behaves in a particular way and checks the verdict.
 */
import { runSupplierDiagnostics, summarise } from '../diagnostics'
import { createMockSupplier } from '../powerbody/mock'
import type { SupplierProduct, SupplierProvider } from '../types'

const check = (report: Awaited<ReturnType<typeof runSupplierDiagnostics>>, id: string) => {
  const found = report.checks.find((c) => c.id === id)
  if (!found) throw new Error(`no check "${id}" in the report`)
  return found
}

/** A provider that answers everything, built from a real one and then patched. */
async function providerWith(patch: Partial<SupplierProvider>): Promise<SupplierProvider> {
  const base = createMockSupplier()
  return { ...base, ...patch } as SupplierProvider
}

describe('a working supplier', () => {
  it('passes the read-only calls', async () => {
    const report = await runSupplierDiagnostics(createMockSupplier())

    expect(check(report, 'sample-skus').status).toBe('pass')
    expect(check(report, 'product-detail').status).toBe('pass')
    expect(check(report, 'single-product').status).toBe('pass')
    expect(check(report, 'stock').status).toBe('pass')
    expect(check(report, 'list-orders').status).toBe('pass')
  })

  it('never places an order, whatever else it does', async () => {
    const placeOrder = jest.fn()
    const report = await runSupplierDiagnostics(await providerWith({ placeOrder }))
    expect(placeOrder).not.toHaveBeenCalled()
    expect(check(report, 'place-order').status).toBe('skip')
  })

  it('says plainly when the run proves nothing about PowerBody', async () => {
    const report = await runSupplierDiagnostics(createMockSupplier())
    expect(report.source).toBe('mock')
    expect(check(report, 'configuration').status).toBe('warn')
    expect(check(report, 'configuration').detail).toMatch(/sample catalogue|Nothing below touches PowerBody/i)
  })
})

describe('a supplier that is not answering', () => {
  it('reports the call that failed, and skips what depended on it', async () => {
    const report = await runSupplierDiagnostics(
      await providerWith({ sampleSkus: async () => { throw new Error('login failed: bad credentials') } }),
    )

    const skus = check(report, 'sample-skus')
    expect(skus.status).toBe('fail')
    expect(skus.detail).toContain('bad credentials')

    // Nothing to look up, so the rest do not repeat the same error.
    expect(check(report, 'product-detail').status).toBe('skip')
    expect(check(report, 'single-product').status).toBe('skip')
    expect(check(report, 'stock').status).toBe('skip')
  })

  it('reports a failure reading orders back', async () => {
    const report = await runSupplierDiagnostics(
      await providerWith({ listOrders: async () => { throw new Error('SOAP fault 500') } }),
    )
    expect(check(report, 'list-orders').status).toBe('fail')
    expect(summarise(report).status).toBe('fail')
  })
})

describe('the getProductInfo trap', () => {
  /**
   * The single most expensive thing to find out late. PowerBody's cheap feed
   * carries no names; `getProductInfo` is the only source of them, and on an
   * account where it is not enabled every product arrives named after its own
   * SKU. Everything imported inherits it, so the check has to fail rather than
   * warn.
   */
  const bare = (sku: string): SupplierProduct => ({
    sku,
    name: sku,
    brand: '',
    category: '',
    description: '',
    imageUrl: null,
    wholesalePrice: 10,
    rrp: 20,
    currency: 'GBP',
    stock: 100,
    inStock: true,
    barcode: null,
    flavours: [],
    servings: null,
    weightGrams: null,
    vatRate: null,
    detailed: false,
    updatedAt: new Date().toISOString(),
  })

  it('fails, and says what to do about it, when products come back unnamed', async () => {
    const report = await runSupplierDiagnostics(
      await providerWith({
        sampleSkus: async () => ['P64', 'P65', 'P66'],
        getProductsBySku: async (skus: string[]) => skus.map(bare),
      }),
    )
    const detail = check(report, 'product-detail')
    expect(detail.status).toBe('fail')
    expect(detail.detail).toMatch(/getProductInfo/)
    expect(summarise(report).status).toBe('fail')
  })

  it('recognises a sandbox account from its own tells', async () => {
    const report = await runSupplierDiagnostics(
      await providerWith({
        sampleSkus: async () => ['P64', 'P65'],
        getProductsBySku: async (skus: string[]) => skus.map(bare),
      }),
    )
    expect(report.looksLikeSandbox).toBe(true)
  })
})

describe('delivery services', () => {
  it('treats one service as an answer, not a failure', async () => {
    const report = await runSupplierDiagnostics(
      await providerWith({ shippingMethods: async () => [{ code: 'STD', name: 'Standard' }] }),
    )
    const methods = check(report, 'shipping-methods')
    expect(methods.status).toBe('warn')
    expect(methods.detail).toMatch(/prices we set/)
  })

  it('passes when the account really has a choice', async () => {
    const report = await runSupplierDiagnostics(
      await providerWith({
        shippingMethods: async () => [
          { code: 'STD', name: 'Standard' },
          { code: 'EXP', name: 'Express' },
        ],
      }),
    )
    expect(check(report, 'shipping-methods').status).toBe('pass')
    expect(check(report, 'shipping-methods').detail).toMatch(/transport_code/)
  })

  it('records a refusal as the answer it is', async () => {
    const report = await runSupplierDiagnostics(
      await providerWith({ shippingMethods: async () => { throw new Error('not callable on this account') } }),
    )
    const methods = check(report, 'shipping-methods')
    expect(methods.status).toBe('warn')
    expect(methods.detail).toMatch(/not callable/)
  })

  it('skips cleanly when the provider does not implement it', async () => {
    const base = createMockSupplier()
    const without = { ...base } as SupplierProvider
    delete (without as { shippingMethods?: unknown }).shippingMethods
    const report = await runSupplierDiagnostics(without)
    expect(check(report, 'shipping-methods').status).toBe('skip')
  })
})

describe('the summary', () => {
  it('leads with the first failure', async () => {
    const report = await runSupplierDiagnostics(
      await providerWith({ listOrders: async () => { throw new Error('nope') } }),
    )
    const { status, sentence } = summarise(report)
    expect(status).toBe('fail')
    expect(sentence).toMatch(/failed/)
  })

  it('does not count what was never run', async () => {
    const report = await runSupplierDiagnostics(createMockSupplier())
    const skipped = report.checks.filter((c) => c.status === 'skip').length
    expect(skipped).toBeGreaterThan(0)
    expect(summarise(report).sentence).not.toMatch(new RegExp(`of ${report.checks.length} `))
  })
})
