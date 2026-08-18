import { request } from '@playwright/test'

/**
 * Compile the API routes before the first spec asks for one.
 *
 * Next's dev server builds a route the first time something asks for it, and
 * under Turbopack a request that arrives during that first compile can come
 * back as a plain 404 rather than waiting. It is rare and it is not the app's
 * fault, but it fails whichever spec happened to be first — twice here it was
 * `/api/portal/login`, and twelve specs went red for a reason that had nothing
 * to do with any of them.
 *
 * So every route the suite depends on is asked for once, up front, and retried
 * until it answers with something other than a 404. A wrong password answering
 * 401 is a compiled route, which is all this is checking.
 */
const ROUTES: Array<{ path: string; method: 'get' | 'post' }> = [
  { path: '/api/config', method: 'get' },
  { path: '/api/catalogue', method: 'get' },
  { path: '/api/bundles', method: 'get' },
  { path: '/api/products', method: 'get' },
  { path: '/api/auth/me', method: 'get' },
  { path: '/api/auth/login', method: 'post' },
  { path: '/api/auth/signup', method: 'post' },
  { path: '/api/auth/logout', method: 'post' },
  { path: '/api/cart', method: 'post' },
  { path: '/api/share', method: 'post' },
  { path: '/api/partner-code', method: 'post' },
  { path: '/api/partner/me', method: 'get' },
  { path: '/api/partner/login', method: 'post' },
  { path: '/api/partner/logout', method: 'post' },
  { path: '/api/partner/set-password', method: 'get' },
  { path: '/api/portal/login', method: 'post' },
  { path: '/api/portal/me', method: 'get' },
  { path: '/api/portal/dashboard', method: 'get' },
  { path: '/api/portal/orders', method: 'get' },
  { path: '/api/portal/partners', method: 'get' },
  { path: '/api/portal/data-source', method: 'get' },
  { path: '/api/hub/subscription', method: 'get' },
  { path: '/api/hub/consent', method: 'post' },
  { path: '/api/checkout/finalize', method: 'post' },
]

export default async function warmup() {
  const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3114}`
  const api = await request.newContext({ baseURL })

  for (const route of ROUTES) {
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const res = route.method === 'get'
          ? await api.get(route.path, { timeout: 30_000 })
          : await api.post(route.path, { data: {}, timeout: 30_000 })
        // Anything but "no such route" means it compiled and is serving.
        if (res.status() !== 404) break
      } catch {
        // Server not up yet — wait and try again.
      }
      await new Promise((r) => setTimeout(r, 1_000))
    }
  }

  await api.dispose()
}
