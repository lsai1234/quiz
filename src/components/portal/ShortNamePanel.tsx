'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Card, Note } from '@/components/system'
import { deriveShortName } from '@/lib/catalogue/short-name'
import { liveProducts, ProductLink, useProductIndex } from '@/components/portal/fixups/product-index'
import type { FixupPanelProps } from '@/components/portal/fixups/types'

interface Candidate {
  id: string
  title: string
  current: string | null
  derived: string
}

interface Scan {
  total: number
  withShortName: number
  hasKey: boolean
  candidates: Candidate[]
}

interface Change {
  id: string
  title: string
  before: string | null
  after: string
  source: 'ai' | 'derived'
  reason?: string
  flags?: { match: string; why: string }[]
  invented?: string[]
}

/**
 * Small enough that a request finishes well inside its budget, big enough that
 * a few hundred products don't take a few hundred round trips.
 */
const BATCH = 10

type Mode = 'derive' | 'ai'

interface Progress {
  mode: Mode
  done: number
  total: number
}

const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const

/** Why an AI name was thrown away, in words a founder can act on. */
function fallbackReason(change: Change): string {
  switch (change.reason) {
    case 'ungrounded':
      return `the AI made up a word that isn’t in the product’s own name (${change.invented?.map((w) => `“${w}”`).join(', ')}) — used the title instead`
    case 'claim-flagged':
      return `the AI’s name read as a health claim (${change.flags?.map((f) => `“${f.match}”`).join(', ')}) — used the title instead`
    case 'too-long':
      return 'the AI’s name didn’t fit the card — used the title instead'
    case 'empty-answer':
      return 'the AI came back empty — used the title instead'
    case 'api-error':
      return 'the AI call failed — used the title instead'
    default:
      return 'used the title instead'
  }
}

/**
 * The name each product goes by on a card and on the share poster.
 *
 * A supplier title is sixty characters of brand, size and flavour, and the
 * poster's name column sets about twenty-four. Nothing breaks without a short
 * name — every surface derives one from the title on the fly — so this is about
 * the difference between a decent guess and the right answer.
 *
 * Two passes, deliberately separate, the same split the description cleanup
 * uses. Filling from titles is free, instant and always right about the
 * mechanical part, so it is the primary action. The AI pass costs a call per
 * product and is a judgement call about what a thing is really called, so it is
 * the quieter one — and it shows every name it wrote, because a name you would
 * trust on three products is not automatically one you trust on three hundred.
 *
 * ── The two must not lock each other out ────────────────────────────────────
 * Filling from titles STORES the derived name, after which the scan counts the
 * product as named — and the AI pass used to be offered only for products the
 * scan still counted, so pressing the free button first disabled the better one
 * for good. A stored name that is exactly what the title derives to is still a
 * guess, so those stay in the AI pass's reach: it is offered for every product
 * with no name AND every product whose name was derived. A name somebody wrote
 * (or the AI wrote) is neither, and is left alone.
 */
export function ShortNamePanel({ onSummary, onRunningChange }: FixupPanelProps) {
  const index = useProductIndex()
  const [scan, setScan] = useState<Scan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    fetch('/api/portal/product-short-names', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (r.ok && d?.ok) setScan(d)
        else setLoadError(d?.error ?? `The server answered with an error (HTTP ${r.status}).`)
      })
      .catch(() => setLoadError('Could not reach the server — check the connection.'))
  }, [])

  useEffect(load, [load])

  const busy = progress !== null
  useEffect(() => onRunningChange?.(busy), [busy, onRunningChange])

  /** On sale, named, and the name is exactly what the title derives to. */
  const derived = useMemo(() => {
    const waiting = new Set(scan?.candidates.map((c) => c.id) ?? [])
    return liveProducts(index)
      .filter((p) => !waiting.has(p.id))
      .filter((p) => {
        const stored = p.shortName?.trim()
        return Boolean(stored) && stored === deriveShortName(p)
      })
      .map((p) => ({ id: p.id, title: p.title }))
  }, [index, scan])

  const missing = scan?.candidates.length ?? 0
  const aiTargets = useMemo(() => [...(scan?.candidates ?? []).map((c) => ({ id: c.id, title: c.title })), ...derived], [scan, derived])

  useEffect(() => {
    if (!onSummary) return
    if (loadError) return onSummary({ count: null, line: 'Could not count — see inside.' })
    if (!scan) return onSummary({ count: null, line: 'Counting…' })
    onSummary({
      count: missing,
      line:
        missing > 0
          ? `${missing} of ${scan.total} on sale ${missing === 1 ? 'has' : 'have'} no short name of ${missing === 1 ? 'its' : 'their'} own and fall${missing === 1 ? 's' : ''} back to the title.`
          : derived.length > 0
            ? `Every product on sale has one; ${derived.length} ${derived.length === 1 ? 'was' : 'were'} worked out from the title and can be improved with AI.`
            : `All ${scan.total} on sale have a name that fits a card.`,
    })
  }, [onSummary, scan, loadError, missing, derived.length])

  async function run(mode: Mode) {
    if (!scan) return
    const ids = mode === 'ai' ? aiTargets.map((t) => t.id) : scan.candidates.map((c) => c.id)
    if (ids.length === 0) return

    setError(null)
    setDone(null)
    setChanges([])
    setProgress({ mode, done: 0, total: ids.length })

    const collected: Change[] = []
    let fellBack = 0

    try {
      // Sequential on purpose: parallel batches would race each other's writes
      // to the same product list, and the last one in would win.
      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH)
        const res = await fetch('/api/portal/product-short-names', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: slice, ai: mode === 'ai' }),
        })
        const data = await res.json().catch(() => null)
        if (!data?.ok) {
          throw new Error(
            data?.error ??
              `The batch did not come back (HTTP ${res.status}) — most likely it ran out of time. The ${collected.length} named before it are saved; press again to carry on.`,
          )
        }
        for (const change of data.changes as Change[]) {
          collected.push(change)
          if (mode === 'ai' && change.source !== 'ai') fellBack++
        }
        // Saved as each batch lands, so what is done survives whatever happens next.
        setChanges([...collected])
        setProgress({ mode, done: Math.min(i + BATCH, ids.length), total: ids.length })
      }

      setDone(
        mode === 'ai'
          ? `Named ${collected.length}. ${collected.length - fellBack} written by AI, ${fellBack} from the title.`
          : `Named ${collected.length} from their titles. Write with AI is still there for any of them.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Naming failed.')
    } finally {
      setProgress(null)
      if (collected.length > 0) {
        invalidateCatalogue()
        index.reload()
      }
      load()
    }
  }

  if (loadError) {
    return (
      <Note tone="critical">
        The short names could not be counted: {loadError}{' '}
        <Button size="sm" variant="ghost" icon="refresh" onClick={load}>
          Try again
        </Button>
      </Note>
    )
  }
  if (!scan) return <p style={META}>Counting…</p>

  const noKey = !scan.hasKey

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
        {missing > 0 && (
          <Button size="sm" variant="primary" loading={busy && progress?.mode === 'derive'} disabled={busy} onClick={() => void run('derive')}>
            Fill {missing} from titles
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          icon="sparkle"
          loading={busy && progress?.mode === 'ai'}
          disabled={busy || aiTargets.length === 0 || noKey}
          onClick={() => void run('ai')}
        >
          {aiTargets.length > 0 ? `Write ${aiTargets.length} with AI` : 'Write with AI'}
        </Button>
      </div>

      {noKey && aiTargets.length > 0 && (
        <p style={META}>
          Write with AI needs an OpenAI key (OPENAI_API_KEY) on the server, and none is set. Filling from titles works
          without one.
        </p>
      )}

      {missing > 0 && !busy && (
        <Note tone="info">
          Nothing is broken without these — a product with no short name shows a name worked out from its title. What
          this changes is whether that name is a decent guess or the right answer. <strong>Fill from titles</strong>{' '}
          stores that guess: instant, free and safe to re-run, and <strong>Write with AI</strong> can still improve on it
          afterwards.
        </Note>
      )}

      {missing === 0 && derived.length === 0 && !busy && (
        <Note tone="positive">
          Every product on sale has a name that fits. Edit any of them on the product itself — this pass only writes the
          ones that have none, or the ones worked out from the title.
        </Note>
      )}

      {progress && (
        <p style={{ ...META, color: 'var(--ink-2)' }} role="status">
          Naming {progress.done} of {progress.total}…
          {progress.mode === 'ai' && ' Each one is an API call, so this takes a moment.'}
        </p>
      )}

      {error && (
        <Note tone="critical" live="assertive">
          {error}
        </Note>
      )}
      {done && !error && (
        <Note tone="positive" live="polite">
          {done}
        </Note>
      )}

      {changes.length > 0 && (
        <ul style={{ display: 'grid', gap: 'var(--space-2)' }} aria-label="Names written">
          {changes.map((c) => (
            <Card key={c.id} as="li" solid padding="tight">
              <p style={META}>
                <ProductLink id={c.id} section="listing">
                  {c.title}
                </ProductLink>
              </p>
              <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                → {c.after}
              </p>
              {c.source !== 'ai' && c.reason && c.reason !== 'no-api-key' && (
                <p style={{ fontSize: 'var(--text-micro)', color: 'var(--tone-attention)' }}>{fallbackReason(c)}</p>
              )}
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
