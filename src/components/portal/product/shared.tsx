'use client'

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Badge, Button, Card } from '@/components/system'
import type { FieldSource } from '@/lib/catalogue/types'
import type { ProductPayload } from '@/lib/portal/product-edit'
import type { ProductSection } from '@/lib/portal/product-links'
import { invalidateCatalogue } from '@/lib/catalogue/load'

/**
 * The pieces every section of the product page shares.
 *
 * ── One product, one source of truth ────────────────────────────────────────
 * The page holds ONE copy of the product (the payload the server returns) and
 * every save answers with the product as it now stands, which replaces that
 * copy. Sections never re-fetch after a save and never keep their own idea of
 * the product beyond the fields being typed — so a save in one section cannot
 * be undone by a stale copy held by another, which is exactly how edits used to
 * vanish on the old screens.
 */

export type Payload = ProductPayload

export const EYEBROW: CSSProperties = {
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
}

export const META: CSSProperties = { fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }
export const BODY: CSSProperties = { fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }

export const money = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? `£${n.toFixed(2)}` : '—')

/** What came back from a write: the new product, or why it was refused. */
export type SendResult =
  | { ok: true; payload: Payload; body: Record<string, unknown> }
  | { ok: false; error: string; problems?: string[]; remaining?: string[]; link?: { label: string; href: string } | null }

/**
 * POST to a product route and, on success, hand the page the product as it
 * now stands. Every failure comes back as a sentence a founder can act on —
 * "Not saved — …" is the server's own wording for a write that did not land.
 */
export async function postProduct(url: string, body: unknown): Promise<SendResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 401) return { ok: false, error: 'Your session has expired — sign in again, then retry.' }
    if (!res.ok || !data || data.ok === false) {
      return {
        ok: false,
        error: (data?.error as string) ?? `That did not go through (HTTP ${res.status}).`,
        problems: data?.problems as string[] | undefined,
        remaining: data?.remaining as string[] | undefined,
        link: (data?.link as { label: string; href: string } | null | undefined) ?? null,
      }
    }
    invalidateCatalogue()
    return { ok: true, payload: data as unknown as Payload, body: data }
  } catch {
    return { ok: false, error: 'Could not reach the server — check the connection and try again.' }
  }
}

/** Read an NDJSON stream line by line (the pull and the lookup report progress this way). */
export async function readStream(
  res: Response,
  onLine: (line: Record<string, unknown>) => void,
): Promise<Record<string, unknown> | null> {
  const reader = res.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  let buffer = ''
  let result: Record<string, unknown> | null = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl = buffer.indexOf('\n')
    while (nl !== -1) {
      const text = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (text) {
        try {
          const line = JSON.parse(text) as Record<string, unknown>
          if (line.type === 'result') result = line
          else onLine(line)
        } catch {
          /* a partial line from a proxy — ignore */
        }
      }
      nl = buffer.indexOf('\n')
    }
  }
  return result
}

// ── Review marks ─────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<FieldSource, string> = {
  supplier: 'From PowerBody',
  rule: 'Our rule',
  ai: 'Written by AI',
  heuristic: 'Keyword guess',
  founder: 'You',
}
const SOURCE_TONE: Record<FieldSource, 'neutral' | 'info' | 'attention' | 'positive'> = {
  supplier: 'neutral',
  rule: 'info',
  ai: 'attention',
  heuristic: 'attention',
  founder: 'positive',
}

/**
 * Where a field's value came from, and — while the product waits for review and
 * this field is still unchecked — the button that checks it as it stands.
 *
 * "Looks right" is what lets a correct guess be approved without being retyped:
 * the review needs every machine-made field confirmed by a person, and before
 * this the only way to confirm one was to change it.
 */
export function ReviewMark({
  field,
  payload,
  onConfirm,
  busy,
}: {
  field: string
  payload: Payload
  onConfirm: (field: string) => void
  busy?: boolean
}) {
  if (payload.state !== 'pending') return null
  const source = payload.product.review?.sources?.[field as keyof Payload['product']]
  const outstanding = payload.remaining.includes(field)
  if (!source && !outstanding) return null
  return (
    <span className="inline-flex items-center flex-wrap" style={{ gap: 'var(--space-2)' }}>
      {source && <Badge tone={SOURCE_TONE[source]}>{SOURCE_LABEL[source]}</Badge>}
      {outstanding ? (
        <Button size="sm" variant="ghost" loading={busy} onClick={() => onConfirm(field)} aria-label={`${field}: looks right`}>
          Looks right
        </Button>
      ) : (
        <Badge tone="positive" icon="check">
          Checked
        </Badge>
      )}
    </span>
  )
}

/** Which review fields each section owns — the Checks list groups by this. */
export const REVIEW_SECTION: Record<string, ProductSection> = {
  imageUrl: 'listing',
  title: 'listing',
  shortName: 'listing',
  description: 'listing',
  category: 'listing',
  dietaryTags: 'listing',
  formats: 'listing',
  hasStimulants: 'listing',
  shortReason: 'listing',
  warnings: 'listing',
  basePrice: 'variants',
  servings: 'variants',
  stackSlots: 'quiz',
  goals: 'quiz',
  swapGroup: 'quiz',
  cost: 'supplier',
  weightGrams: 'supplier',
}

// ── Sections ─────────────────────────────────────────────────────────────────

/**
 * One section of the product page.
 *
 * Collapsed with the `hidden` attribute rather than unmounted, so a half-typed
 * edit survives being folded away (the Disclosure primitive unmounts, which is
 * right for a read-only panel and wrong here). Opens itself when the address
 * names it (`#listing`), which is how every "fix this" link on the page and in
 * the Products list lands on the right fields.
 */
export function Section({
  id,
  title,
  summary,
  children,
  defaultOpen = true,
  tone,
  actions,
}: {
  id: ProductSection
  title: string
  summary?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  tone?: 'attention' | 'accent'
  actions?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${id}`) setOpen(true)
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [id])

  return (
    <section id={id} aria-labelledby={`${id}-title`} style={{ scrollMarginTop: 'var(--space-8)' }}>
      <Card elevation={1} tone={tone} className="space-y-3">
        <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
          <div className="min-w-0 space-y-1" style={{ flex: '1 1 16rem' }}>
            <h2
              id={`${id}-title`}
              style={{
                fontSize: 'var(--text-lead)',
                fontWeight: 'var(--weight-strong)',
                fontFamily: 'var(--font-display)',
                color: 'var(--ink-1)',
              }}
            >
              {title}
            </h2>
            {summary && <div style={META}>{summary}</div>}
          </div>
          <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)' }}>
            {open && actions}
            <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide' : 'Show'}
            </Button>
          </div>
        </div>
        <div id={`${id}-body`} hidden={!open} className="space-y-4">
          {children}
        </div>
      </Card>
    </section>
  )
}

/**
 * A section's unsaved edits.
 *
 * `seed` is worked out from the product; `draft` is what is on screen. When the
 * product changes underneath (another section saved, a pull landed), every
 * field the founder has NOT touched is re-seeded, and every field they have is
 * left as they typed it. Dirtiness is measured against the value a field was
 * seeded from, not against the latest product — otherwise a save elsewhere
 * would light up this section's Save and send back yesterday's value.
 */
export function useDraft<T extends Record<string, unknown>>(seed: T) {
  const [seeded, setSeeded] = useState<T>(seed)
  const [draft, setDraft] = useState<T>(seed)
  const seedKey = JSON.stringify(seed)

  useEffect(() => {
    const next = JSON.parse(seedKey) as T
    setDraft((current) => {
      const out = { ...current }
      for (const key of Object.keys(next) as Array<keyof T>) {
        if (JSON.stringify(current[key]) === JSON.stringify(seeded[key])) out[key] = next[key]
      }
      return out
    })
    setSeeded(next)
    // `seeded` is deliberately the value from before this seed arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey])

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => setDraft((d) => ({ ...d, [key]: value })), [])
  const changed = (Object.keys(draft) as Array<keyof T>).filter(
    (k) => JSON.stringify(draft[k]) !== JSON.stringify(seeded[k]),
  )
  const reset = useCallback(() => setDraft(seeded), [seeded])
  return { draft, set, setDraft, changed, reset, seeded }
}

/** Shows a section's outcome: what was saved, or why not. */
export function Outcome({ done, error }: { done: string | null; error: string | null }) {
  return (
    <>
      {done && (
        <p role="status" style={{ ...META, color: 'var(--tone-positive)' }}>
          {done}
        </p>
      )}
      {error && (
        <p role="alert" style={{ ...META, color: 'var(--tone-critical)' }}>
          {error}
        </p>
      )}
    </>
  )
}

/** "Product X: 3 problems" → one sentence per problem. */
export function errorText(result: Extract<SendResult, { ok: false }>): string {
  if (result.problems && result.problems.length > 0) return result.problems.join(' ')
  if (result.remaining && result.remaining.length > 0) return `${result.error} Still to check: ${result.remaining.join(', ')}.`
  return result.error
}
