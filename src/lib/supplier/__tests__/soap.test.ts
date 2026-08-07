import { createSoapClient, PowerBodySoapError } from '@/lib/supplier/powerbody/soap'

const URL = 'https://www.powerbody.co.uk/api/soap/'

function loginResponse(session = 'sess-1') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
<SOAP-ENV:Body><ns1:loginResponse><loginReturn xsi:type="xsd:string">${session}</loginReturn></ns1:loginResponse></SOAP-ENV:Body>
</SOAP-ENV:Envelope>`
}

function callResponse(payload: unknown) {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
<SOAP-ENV:Body><ns1:callResponse><callReturn xsi:type="xsd:string"><![CDATA[${json}]]></callReturn></ns1:callResponse></SOAP-ENV:Body>
</SOAP-ENV:Envelope>`
}

function faultResponse(code: string, message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
<SOAP-ENV:Body><SOAP-ENV:Fault><faultcode>${code}</faultcode><faultstring>${message}</faultstring></SOAP-ENV:Fault></SOAP-ENV:Body>
</SOAP-ENV:Envelope>`
}

function ok(body: string) {
  return { ok: true, status: 200, text: async () => body, headers: new Headers() } as unknown as Response
}
/** A SOAP fault — Magento returns these with HTTP 500. */
function serverError(body: string) {
  return { ok: false, status: 500, text: async () => body, headers: new Headers() } as unknown as Response
}
/** A bare status with no SOAP body, as rate limiting and gateway errors arrive. */
function status(code: number, headers: Record<string, string> = {}) {
  return {
    ok: false,
    status: code,
    text: async () => '<html>Too Many Requests</html>',
    headers: new Headers(headers),
  } as unknown as Response
}

describe('PowerBody SOAP client', () => {
  let fetchMock: jest.Mock
  let slept: number[]

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    slept = []
  })

  /** Backoff and throttling are recorded rather than actually waited out, so the
   *  suite exercises the real timing logic without spending the time. */
  const client = (over: Partial<Parameters<typeof createSoapClient>[0]> = {}) =>
    createSoapClient({
      url: URL,
      username: 'user',
      apiKey: 'key',
      minIntervalMs: 0,
      sleep: async (ms: number) => {
        slept.push(ms)
      },
      ...over,
    })

  it('logs in once and reuses the session across calls', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(loginResponse()))
      .mockResolvedValueOnce(ok(callResponse([{ sku: 'PB-1' }])))
      .mockResolvedValueOnce(ok(callResponse([{ sku: 'PB-2' }])))

    const c = client()
    await c.call('dropshipping.getProductList', { page: 1 })
    await c.call('dropshipping.getProductList', { page: 2 })

    expect(fetchMock).toHaveBeenCalledTimes(3) // one login + two calls
    const loginBody = fetchMock.mock.calls[0][1].body as string
    expect(loginBody).toContain('<urn:login')
    expect(loginBody).toContain('user')
    expect(loginBody).toContain('key')
  })

  it('sends the session id, resource path and JSON-encoded args', async () => {
    fetchMock.mockResolvedValueOnce(ok(loginResponse('sess-9'))).mockResolvedValueOnce(ok(callResponse([])))

    await client().call('dropshipping.getProductList', { page: 3 })

    const body = fetchMock.mock.calls[1][1].body as string
    expect(body).toContain('<urn:call')
    expect(body).toContain('sess-9')
    expect(body).toContain('dropshipping.getProductList')
    // JSON, entity-escaped into the XML.
    expect(body).toContain('{&quot;page&quot;:3}')
  })

  it('parses a CDATA JSON payload', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(loginResponse()))
      .mockResolvedValueOnce(ok(callResponse([{ sku: 'PB-1', qty: '4' }])))

    const result = await client().call('dropshipping.getProductList', {})
    expect(result).toEqual([{ sku: 'PB-1', qty: '4' }])
  })

  it('parses an entity-encoded (non-CDATA) payload', async () => {
    fetchMock.mockResolvedValueOnce(ok(loginResponse())).mockResolvedValueOnce(
      ok(
        '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body>' +
          '<callReturn>{&quot;api_response&quot;:&quot;SUCCESS&quot;}</callReturn>' +
          '</SOAP-ENV:Body></SOAP-ENV:Envelope>',
      ),
    )

    expect(await client().call('dropshipping.createOrder', {})).toEqual({ api_response: 'SUCCESS' })
  })

  it('escapes XML metacharacters in the arguments', async () => {
    fetchMock.mockResolvedValueOnce(ok(loginResponse())).mockResolvedValueOnce(ok(callResponse({})))

    await client().call('dropshipping.createOrder', { comment: 'Ben & Jerry <ping>' })

    const body = fetchMock.mock.calls[1][1].body as string
    // The payload must not be able to close the envelope's own tags.
    expect(body).not.toContain('<ping>')
    expect(body).toContain('&amp;')
  })

  it('raises a SOAP fault as an error, reading the fault string over the HTTP status', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(loginResponse()))
      .mockResolvedValueOnce(serverError(faultResponse('4', 'Invalid product data')))

    await expect(client().call('dropshipping.createOrder', {})).rejects.toThrow('Invalid product data')
  })

  it('re-logs in once and retries when the session has expired', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(loginResponse('old')))
      .mockResolvedValueOnce(serverError(faultResponse('5', 'Session expired. Try to relogin')))
      .mockResolvedValueOnce(ok(loginResponse('fresh')))
      .mockResolvedValueOnce(ok(callResponse([{ sku: 'PB-1' }])))

    const result = await client().call('dropshipping.getProductList', {})

    expect(result).toEqual([{ sku: 'PB-1' }])
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[3][1].body as string).toContain('fresh')
  })

  it('does not retry a fault that is not about the session', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(loginResponse()))
      .mockResolvedValueOnce(serverError(faultResponse('4', 'Bad request')))

    await expect(client().call('dropshipping.createOrder', {})).rejects.toThrow('Bad request')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails clearly when login returns no session', async () => {
    fetchMock.mockResolvedValueOnce(
      ok('<SOAP-ENV:Envelope xmlns:SOAP-ENV="x"><SOAP-ENV:Body></SOAP-ENV:Body></SOAP-ENV:Envelope>'),
    )
    await expect(client().call('dropshipping.getProductList', {})).rejects.toThrow(/API user and key/i)
  })

  it('wraps a transport failure rather than leaking a raw fetch error', async () => {
    // Persistent, not `…Once`: a transport failure is retried, so every attempt
    // must fail for the error to surface.
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(client().call('dropshipping.getProductList', {})).rejects.toBeInstanceOf(PowerBodySoapError)
  })

  it('collapses concurrent first calls into a single login', async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) =>
      init.body.includes('<urn:login') ? ok(loginResponse()) : ok(callResponse([])),
    )

    const c = client()
    await Promise.all([
      c.call('dropshipping.getProductList', { page: 1 }),
      c.call('dropshipping.getProductList', { page: 2 }),
      c.call('dropshipping.getProductList', { page: 3 }),
    ])

    const logins = fetchMock.mock.calls.filter((call) => (call[1].body as string).includes('<urn:login'))
    expect(logins).toHaveLength(1)
  })

  it('sends an empty args string when none are given', async () => {
    fetchMock.mockResolvedValueOnce(ok(loginResponse())).mockResolvedValueOnce(ok(callResponse([])))
    await client().call('dropshipping.getComments')
    const body = fetchMock.mock.calls[1][1].body as string
    expect(body).toContain('<args xsi:type="xsd:string"></args>')
  })

  describe('rate limiting', () => {
    it('retries a 429 and succeeds', async () => {
      fetchMock
        .mockResolvedValueOnce(ok(loginResponse()))
        .mockResolvedValueOnce(status(429))
        .mockResolvedValueOnce(ok(callResponse([{ sku: 'PB-1' }])))

      const result = await client().call('dropshipping.getProductList', {})

      expect(result).toEqual([{ sku: 'PB-1' }])
      expect(slept.length).toBeGreaterThan(0)
    })

    it('honours Retry-After given in seconds', async () => {
      fetchMock
        .mockResolvedValueOnce(ok(loginResponse()))
        .mockResolvedValueOnce(status(429, { 'retry-after': '3' }))
        .mockResolvedValueOnce(ok(callResponse([])))

      await client().call('dropshipping.getProductList', {})

      // Their number, not our backoff curve.
      expect(slept).toContain(3000)
    })

    it('gives up after the retry budget and says how to fix it', async () => {
      fetchMock.mockImplementation(async (_url: string, init: { body: string }) =>
        init.body.includes('<urn:login') ? ok(loginResponse()) : status(429),
      )

      await expect(
        client({ maxRetries: 2 }).call('dropshipping.getProductList', {}),
      ).rejects.toThrow(/rate limiting[\s\S]*POWERBODY_MAX_CONCURRENT/)
    })

    it('retries a gateway error with no SOAP body', async () => {
      fetchMock
        .mockResolvedValueOnce(ok(loginResponse()))
        .mockResolvedValueOnce(status(503))
        .mockResolvedValueOnce(ok(callResponse([])))

      await expect(client().call('dropshipping.getProductList', {})).resolves.toEqual([])
    })

    it('does NOT retry an application fault returned with HTTP 500', async () => {
      // Magento sends faults with a 500, so a status-first check would bury the
      // real reason under pointless retries.
      fetchMock
        .mockResolvedValueOnce(ok(loginResponse()))
        .mockResolvedValueOnce(serverError(faultResponse('4', 'Invalid product data')))

      await expect(client().call('dropshipping.createOrder', {})).rejects.toThrow('Invalid product data')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('caps how many requests are in flight at once', async () => {
      let inFlight = 0
      let peak = 0
      fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
        if (init.body.includes('<urn:login')) return ok(loginResponse())
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight -= 1
        return ok(callResponse([]))
      })

      const c = client({ maxConcurrent: 2 })
      await Promise.all(
        Array.from({ length: 8 }, (_, i) => c.call('dropshipping.getProductInfo', i)),
      )

      expect(peak).toBeLessThanOrEqual(2)
    })

    it('spaces request starts by the minimum interval', async () => {
      fetchMock.mockImplementation(async (_url: string, init: { body: string }) =>
        init.body.includes('<urn:login') ? ok(loginResponse()) : ok(callResponse([])),
      )

      const c = client({ maxConcurrent: 1, minIntervalMs: 200 })
      await c.call('dropshipping.getProductInfo', 1)
      slept.length = 0
      await c.call('dropshipping.getProductInfo', 2)

      // The second request waited out the remainder of the interval.
      expect(slept.some((ms) => ms > 0 && ms <= 200)).toBe(true)
    })
  })

  it('closes the session on endSession and logs in again afterwards', async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) =>
      init.body.includes('<urn:login') ? ok(loginResponse()) : ok(callResponse([])),
    )

    const c = client()
    await c.call('dropshipping.getProductList', {})
    await c.endSession()
    await c.call('dropshipping.getProductList', {})

    const logins = fetchMock.mock.calls.filter((call) => (call[1].body as string).includes('<urn:login'))
    expect(logins).toHaveLength(2)
  })
})
