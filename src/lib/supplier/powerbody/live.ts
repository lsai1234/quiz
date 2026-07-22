/**
 * Live PowerBody supplier adapter — the ONLY file that changes when API access
 * lands. It implements the same `SupplierProvider` interface the rest of the app
 * already uses, so wiring it up is: fill these methods in against PowerBody's
 * real API (their surface is roughly getProductList / getProductInfo / getStock /
 * setOrder / getOrderList), set POWERBODY_API_URL + POWERBODY_API_KEY, and flip
 * SUPPLIER_SOURCE=powerbody.
 *
 * Until then every method throws a clear "not implemented" so a misconfiguration
 * fails loudly rather than silently — and the resolver in ./index.ts falls back
 * to the mock whenever credentials are absent, so this is never reached by
 * accident.
 */
import type {
  SupplierOrder,
  SupplierOrderInput,
  SupplierOrderResult,
  SupplierProduct,
  SupplierProvider,
  SupplierStockLevel,
} from '../types'

const NOT_IMPLEMENTED =
  'PowerBody live adapter is not implemented yet — awaiting API access. ' +
  'Set SUPPLIER_SOURCE=mock (or leave it unset) to use the mock supplier.'

export function createPowerBodyProvider(): SupplierProvider {
  const apiUrl = process.env.POWERBODY_API_URL
  const apiKey = process.env.POWERBODY_API_KEY
  if (!apiUrl || !apiKey) {
    throw new Error('POWERBODY_API_URL and POWERBODY_API_KEY must be set to use the live PowerBody adapter.')
  }

  return {
    name: 'powerbody',
    async listProducts(): Promise<SupplierProduct[]> {
      throw new Error(NOT_IMPLEMENTED)
    },
    async getProduct(): Promise<SupplierProduct | null> {
      throw new Error(NOT_IMPLEMENTED)
    },
    async getStockLevels(): Promise<SupplierStockLevel[]> {
      throw new Error(NOT_IMPLEMENTED)
    },
    async placeOrder(_order: SupplierOrderInput): Promise<SupplierOrderResult> {
      throw new Error(NOT_IMPLEMENTED)
    },
    async getOrder(): Promise<SupplierOrder | null> {
      throw new Error(NOT_IMPLEMENTED)
    },
    async listOrders(): Promise<SupplierOrder[]> {
      throw new Error(NOT_IMPLEMENTED)
    },
  }
}
