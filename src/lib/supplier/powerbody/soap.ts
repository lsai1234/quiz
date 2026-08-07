/**
 * Minimal SOAP 1.1 client for PowerBody's dropshipping API.
 *
 * PowerBody run Magento's classic SOAP v1 endpoint (`/api/soap/?wsdl`), whose
 * whole surface is three calls:
 *
 *   login(username, apiKey) → sessionId
 *   call(sessionId, resourcePath, args) → mixed
 *   endSession(sessionId) → bool
 *
 * Everything dropshipping-specific rides on `call` with a resource path like
 * `dropshipping.getProductList` and a JSON string argument — see `live.ts`.
 *
 * Hand-rolled rather than pulling in a `soap` package: we need exactly three
 * operations against one known endpoint, the WSDL adds a fetch-and-parse round
 * trip on every cold start, and the envelopes below are the entire protocol
 * surface we touch. The trade is that we do our own (small) XML handling, which
 * is why the parser here is deliberately narrow — it reads the one response
 * shape Magento returns and refuses anything else, rather than pretending to be
 * a general XML parser.
 *
 * Server-only: never import this from a client component — it holds the API key.
 */

/** How long a Magento session is reused before we log in again. Their default
 *  session lifetime is generous; 20 minutes keeps us well inside it while still
 *  saving a login on every call in a sync run. */
const SESSION_TTL_MS = 20 * 60 * 1000

/** Give a slow catalogue page room, but never hang a request handler forever. */
const DEFAULT_TIMEOUT_MS = 30_000

export interface PowerBodySoapConfig {
  /** The SOAP endpoint, e.g. `https://www.powerbody.co.uk/api/soap/`. */
  url: string
  username: string
  apiKey: string
  timeoutMs?: number
}

/** A fault returned by the SOAP endpoint (or a transport failure dressed as one). */
export class PowerBodySoapError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    /** True when the fault means "your session is gone" — the caller re-logs in. */
    readonly sessionExpired = false,
  ) {
    super(message)
    this.name = 'PowerBodySoapError'
  }
}

// ─── XML ───────────────────────────────────────────────────────────────────────

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    // Ampersand last, so `&amp;lt;` decodes to `&lt;` and not to `<`.
    .replace(/&amp;/g, '&')
}

/**
 * The text of the first `<name>…</name>` element, CDATA or entity-encoded.
 *
 * Namespace-agnostic: Magento's responses vary in whether they prefix the body
 * elements, so we match on the local name and ignore any prefix.
 */
function extractTag(xml: string, name: string): string | null {
  const pattern = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${name}>`,
  )
  const match = xml.match(pattern)
  if (!match) return null
  const raw = match[1]
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return cdata ? cdata[1] : decodeXml(raw)
}

/** A SOAP fault, if the response carries one. */
function readFault(xml: string): PowerBodySoapError | null {
  if (!/<(?:[A-Za-z0-9_.-]+:)?Fault\b/.test(xml)) return null
  const code = extractTag(xml, 'faultcode') ?? undefined
  const message = extractTag(xml, 'faultstring') ?? 'SOAP fault'
  // Magento answers an unknown/expired session with fault code 5 ("Session
  // expired. Try to relogin"). Recognising it is what lets a long sync survive
  // crossing the session lifetime instead of failing halfway through.
  const expired = code === '5' || /session\s*expired|invalid\s*session/i.test(message)
  return new PowerBodySoapError(message, code, expired)
}

function envelope(body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
    `<soapenv:Body>${body}</soapenv:Body>` +
    '</soapenv:Envelope>'
  )
}

function stringParam(name: string, value: string): string {
  return `<${name} xsi:type="xsd:string">${escapeXml(value)}</${name}>`
}

// ─── Client ────────────────────────────────────────────────────────────────────

export interface PowerBodySoapClient {
  /** Run a dropshipping method. `args` is JSON-encoded when it isn't already a string. */
  call<T = unknown>(resourcePath: string, args?: unknown): Promise<T>
  /** Drop the cached session (tests, and the end of a long batch job). */
  endSession(): Promise<void>
}

export function createSoapClient(config: PowerBodySoapConfig): PowerBodySoapClient {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let session: { id: string; at: number } | null = null
  // Collapses the login stampede when several calls start at once (a sync run
  // fans out) — they all await the same login rather than opening N sessions.
  let pendingLogin: Promise<string> | null = null

  async function post(body: string): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '""',
        },
        body: envelope(body),
        signal: controller.signal,
        // Supplier stock is the definition of uncacheable.
        cache: 'no-store',
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new PowerBodySoapError(`PowerBody did not respond within ${timeoutMs}ms.`)
      }
      throw new PowerBodySoapError(
        `Could not reach PowerBody: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      clearTimeout(timer)
    }

    const text = await res.text()
    // A SOAP fault is returned with HTTP 500, so read the body before the status:
    // the fault string is far more useful than "500".
    const fault = readFault(text)
    if (fault) throw fault
    if (!res.ok) {
      throw new PowerBodySoapError(`PowerBody returned HTTP ${res.status}.`, String(res.status))
    }
    return text
  }

  async function login(): Promise<string> {
    const xml = await post(
      '<urn:login xmlns:urn="urn:Magento">' +
        stringParam('username', config.username) +
        stringParam('apiKey', config.apiKey) +
        '</urn:login>',
    )
    const id = extractTag(xml, 'loginReturn') ?? extractTag(xml, 'result')
    if (!id) {
      throw new PowerBodySoapError('PowerBody login returned no session id — check the API user and key.')
    }
    return id.trim()
  }

  async function sessionId(force = false): Promise<string> {
    if (!force && session && Date.now() - session.at < SESSION_TTL_MS) return session.id
    if (force) session = null
    if (!pendingLogin) {
      pendingLogin = login()
        .then((id) => {
          session = { id, at: Date.now() }
          return id
        })
        .finally(() => {
          pendingLogin = null
        })
    }
    return pendingLogin
  }

  async function invoke<T>(resourcePath: string, args: unknown, force: boolean): Promise<T> {
    const id = await sessionId(force)
    // PowerBody document every dropshipping method as taking a JSON string, so
    // anything that isn't already a string is encoded here. `undefined` becomes
    // an empty string — getComments and getPromoProductList are called with one.
    const encoded =
      args === undefined || args === null
        ? ''
        : typeof args === 'string'
          ? args
          : JSON.stringify(args)

    const xml = await post(
      '<urn:call xmlns:urn="urn:Magento">' +
        stringParam('sessionId', id) +
        stringParam('resourcePath', resourcePath) +
        stringParam('args', encoded) +
        '</urn:call>',
    )

    const raw = extractTag(xml, 'callReturn') ?? extractTag(xml, 'result')
    if (raw === null) return null as T
    const trimmed = raw.trim()
    if (trimmed === '') return null as T
    try {
      return JSON.parse(trimmed) as T
    } catch {
      // Some methods answer with a bare scalar rather than JSON — hand it back
      // as-is rather than failing the call.
      return trimmed as T
    }
  }

  return {
    async call<T = unknown>(resourcePath: string, args?: unknown): Promise<T> {
      try {
        return await invoke<T>(resourcePath, args, false)
      } catch (err) {
        // One retry on an expired session: a sync run that outlives the session
        // should re-login and carry on, not fail halfway through the catalogue.
        if (err instanceof PowerBodySoapError && err.sessionExpired) {
          return invoke<T>(resourcePath, args, true)
        }
        throw err
      }
    },

    async endSession(): Promise<void> {
      const current = session
      session = null
      if (!current) return
      try {
        await post(
          '<urn:endSession xmlns:urn="urn:Magento">' +
            stringParam('sessionId', current.id) +
            '</urn:endSession>',
        )
      } catch {
        // Best-effort: the session expires on its own soon enough, and failing to
        // close it must never fail the work that just succeeded.
      }
    },
  }
}

/** Exposed for tests — the XML helpers are the fiddly part worth pinning down. */
export const __soapInternals = { escapeXml, decodeXml, extractTag, readFault, envelope }
