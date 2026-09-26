import { recordAi, type AiAuditEntry, type AiOutcome, type AiRoute } from './audit'

/**
 * Wraps an AI route so every call lands in the audit log (see `audit.ts`).
 *
 * The outcome is read off the route's own JSON reply; the subject is the one
 * field that names what was asked about (a scene id, a glossary term, an
 * upload kind). Nothing else is read from the request: not the text, not the
 * image, not the audio.
 */

const SUBJECT_FIELDS = ['sceneId', 'kind', 'key'] as const

export function outcomeOf(status: number, body: Record<string, unknown>): { outcome: AiOutcome; reason?: string } {
  if (status === 429) return { outcome: 'busy' }
  if (body.unavailable) return { outcome: 'unavailable' }
  if (body.held) return { outcome: 'held', reason: String(body.held) }
  if (body.medical) return { outcome: 'held', reason: 'medical' }
  if (body.error) return { outcome: 'error', reason: String(body.error) }
  if (body.fallback) return { outcome: 'fallback', reason: typeof body.reason === 'string' ? body.reason : undefined }
  if ('answer' in body && body.answer == null) return { outcome: 'fallback' }
  return { outcome: 'ok' }
}

export function auditRoute(route: AiRoute, model: string | (() => string), handler: (req: Request) => Promise<Response>) {
  return async function POST(req: Request): Promise<Response> {
    const t0 = Date.now()
    let subject: string | undefined
    if ((req.headers.get('content-type') ?? '').includes('json')) {
      try {
        const body = (await req.clone().json()) as Record<string, unknown>
        const field = SUBJECT_FIELDS.find((f) => typeof body[f] === 'string')
        if (field) subject = String(body[field]).slice(0, 40)
      } catch {
        // Unreadable body: the handler will say so; the log just has no subject.
      }
    }
    const res = await handler(req)
    try {
      const body = (await res.clone().json()) as Record<string, unknown>
      const entry: AiAuditEntry = { at: t0, route, subject, model: typeof model === 'function' ? model() : model, ms: Date.now() - t0, ...outcomeOf(res.status, body) }
      void recordAi(entry)
    } catch {
      // Not JSON: nothing to classify.
    }
    return res
  }
}
