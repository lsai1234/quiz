'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Card, Note } from '@/components/system'
import { ProductLink, useProductIndex } from '@/components/portal/fixups/product-index'
import type { FixupPanelProps } from '@/components/portal/fixups/types'

interface Candidate {
  id: string
  title: string
  hasMarkup: boolean
}

interface Scan {
  total: number
  withDescription: number
  withMarkup: number
  candidates: Candidate[]
}

interface Change {
  id: string
  title: string
  before: string
  after: string
  source: 'cleaned' | 'ai'
  reason?: string
  flags?: { match: string; why: string }[]
}

/**
 * Small enough that a request finishes well inside its budget, big enough that a
 * few hundred products don't take a few hundred round trips. The markup strip
 * goes in one batch per chunk too — it costs nothing and keeps one code path.
 */
const BATCH = 10

type Mode = 'markup' | 'ai'

interface Progress {
  mode: Mode
  done: number
  total: number
}

const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const

function preview(text: string, width = 140): string {
  const line = text.replace(/\n/g, ' ⏎ ')
  return line.length > width ? `${line.slice(0, width)}…` : line
}

/** Why an AI rewrite was thrown away, in words a founder can act on. */
function fallbackReason(change: Change): string {
  switch (change.reason) {
    case 'claim-flagged':
      return `the rewrite made a health claim (${change.flags?.map((f) => `“${f.match}”`).join(', ')}) — kept the supplier's words instead`
    case 'api-error':
      return 'the rewrite call failed — kept the supplier’s words'
    case 'empty-answer':
      return 'the rewrite came back empty — kept the supplier’s words'
    case 'too-long':
      return 'the rewrite ran long — kept the supplier’s words'
    default:
      return 'kept the supplier’s words'
  }
}

/**
 * Descriptions that came in as raw supplier HTML.
 *
 * PowerBody's `description_en` is a fragment out of their storefront, and we
 * render descriptions as text — so before the import path started cleaning them,
 * customers were reading `<div class="RichText3-paragraph…">` in the shop. New
 * imports are clean on the way in; this is for everything pulled in before that.
 *
 * Two passes, deliberately separate. The markup strip is free, instant and
 * always right, so it is the primary action. The rewrite costs an API call per
 * product and is a judgement call about voice, so it is the quieter one — and it
 * shows what it changed, because a rewrite is the kind of thing you want to read
 * before you trust it on three hundred products.
 *
 * Only products on sale. One still waiting for review has its description
 * checked as part of that review, and rewriting it underneath the founder would
 * change the very text they are about to confirm.
 */
export function DescriptionCleanupPanel({ onSummary, onRunningChange }: FixupPanelProps) {
  const index = useProductIndex()
  const [raw, setRaw] = useState<Scan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    fetch('/api/portal/product-descriptions', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (r.ok && d?.ok) setRaw(d)
        else setLoadError(d?.error ?? `The server answered with an error (HTTP ${r.status}).`)
      })
      .catch(() => setLoadError('Could not reach the server — check the connection.'))
  }, [])

  useEffect(load, [load])

  const busy = progress !== null
  useEffect(() => onRunningChange?.(busy), [busy, onRunningChange])

  /*
    The scan covers every imported product; this narrows it to the ones on
    sale. Until the product list is in, nothing is counted (a count that drops
    a second later reads as a bug). If the list cannot be read at all, the scan
    is shown unnarrowed rather than not at all — every pass here is safe to run
    on any product, and the founder is not left with nothing.
  */
  const scan = useMemo<Scan | null>(() => {
    if (!raw) return null
    if (index.status === 'loading') return null
    if (index.status !== 'ready') return raw
    const candidates = raw.candidates.filter((c) => index.byId.get(c.id)?.state === 'live')
    return {
      total: raw.total,
      withDescription: candidates.length,
      withMarkup: candidates.filter((c) => c.hasMarkup).length,
      candidates,
    }
  }, [raw, index])

  useEffect(() => {
    if (!onSummary) return
    if (loadError) return onSummary({ count: null, line: 'Could not count — see inside.' })
    if (!scan) return onSummary({ count: null, line: 'Counting…' })
    onSummary({
      count: scan.withMarkup,
      line:
        scan.withDescription === 0
          ? 'No product on sale has an imported description to tidy.'
          : scan.withMarkup === 0
            ? `${scan.withDescription} imported description${scan.withDescription === 1 ? '' : 's'} on sale, none showing raw markup.`
            : `${scan.withMarkup} of ${scan.withDescription} on sale still show PowerBody's raw HTML in the shop.`,
    })
  }, [onSummary, scan, loadError])

  async function run(mode: Mode) {
    if (!scan) return
    const ids = scan.candidates.filter((c) => (mode === 'ai' ? true : c.hasMarkup)).map((c) => c.id)
    if (ids.length === 0) return

    setError(null)
    setDone(null)
    setChanges([])
    setProgress({ mode, done: 0, total: ids.length })

    const collected: Change[] = []
    let aiUsed = 0
    let fellBack = 0

    try {
      // Sequential on purpose: parallel batches would race each other's writes
      // to the same product list, and the last one in would win.
      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH)
        let res: Response
        try {
          res = await fetch('/api/portal/product-descriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: slice, ai: mode === 'ai' }),
          })
        } catch {
          setError(
            `Could not reach the server — check the connection. ${
              collected.length > 0 ? `The ${collected.length} already done are saved; press` : 'Nothing was changed. Press'
            } the button again to carry on.`,
          )
          return
        }
        const d = await res.json().catch(() => null)
        if (!res.ok || !d || d.ok === false) {
          setError(
            d?.error ??
              `The batch did not come back (HTTP ${res.status}) — most likely it ran out of time. What was done before it is saved; press again to carry on.`,
          )
          return
        }
        collected.push(...(d.changes ?? []))
        aiUsed += d.aiUsed ?? 0
        fellBack += d.fellBack ?? 0
        // Batches are written as they finish, so what has already been processed
        // survives whatever happens to the rest of the run.
        setChanges([...collected])
        setProgress({ mode, done: Math.min(i + BATCH, ids.length), total: ids.length })
      }

      setDone(
        mode === 'ai'
          ? `${aiUsed} rewritten, ${fellBack} kept as the supplier wrote them.`
          : `${collected.length} description${collected.length === 1 ? '' : 's'} cleaned.`,
      )
    } finally {
      setProgress(null)
      if (collected.length > 0) {
        // The shop and the product sheet read descriptions — let them re-fetch.
        invalidateCatalogue()
        load()
      }
    }
  }

  if (loadError) {
    return (
      <Note tone="critical">
        The descriptions could not be scanned: {loadError}{' '}
        <Button size="sm" variant="ghost" icon="refresh" onClick={load}>
          Try again
        </Button>
      </Note>
    )
  }
  if (!scan) return <p style={META}>Counting…</p>
  if (scan.withDescription === 0) {
    return <p style={META}>No product on sale has an imported description, so there is nothing for this to tidy.</p>
  }

  const clean = scan.withMarkup === 0

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <p style={{ ...META, color: 'var(--ink-2)' }}>
        {clean
          ? `${scan.withDescription} imported product${scan.withDescription === 1 ? '' : 's'} — none are showing raw markup.`
          : `${scan.withMarkup} of ${scan.withDescription} still show the supplier's raw HTML in the shop.`}
      </p>

      <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
        {!clean && (
          <Button size="sm" variant="primary" loading={busy && progress?.mode === 'markup'} disabled={busy} onClick={() => void run('markup')}>
            Clean markup
          </Button>
        )}
        <Button size="sm" variant="secondary" icon="sparkle" loading={busy && progress?.mode === 'ai'} disabled={busy} onClick={() => void run('ai')}>
          Rewrite with AI
        </Button>
      </div>

      {!clean && !busy && (
        <Note tone="attention">
          Anything pulled in before descriptions were cleaned on import still carries the tags PowerBody sent.{' '}
          <strong>Clean markup</strong> strips them and keeps every word — it is instant, free and safe to re-run.
        </Note>
      )}

      {clean && !busy && (
        <Note tone="info">
          Markup is already clean. <strong>Rewrite with AI</strong> is the optional second pass: it rewrites the
          supplier’s copy into our voice, one API call per product. Anything that reads as a health claim is rejected
          and their original wording kept.
        </Note>
      )}

      {progress && (
        <p style={{ ...META, color: 'var(--ink-2)' }} role="status">
          {progress.mode === 'ai' ? 'Rewriting' : 'Cleaning'} {progress.done} of {progress.total}…
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
        <ul style={{ display: 'grid', gap: 'var(--space-2)' }} aria-label="Descriptions changed">
          {changes.map((c) => (
            <Card key={c.id} as="li" solid padding="tight">
              <p style={{ fontSize: 'var(--text-body-sm)' }}>
                <ProductLink id={c.id} section="listing">
                  {c.title}
                </ProductLink>
              </p>
              <p style={{ ...META, lineHeight: 'var(--leading-snug)' }}>{preview(c.before)}</p>
              <p style={{ ...META, color: 'var(--ink-2)', lineHeight: 'var(--leading-snug)' }}>→ {preview(c.after)}</p>
              {c.source === 'cleaned' && c.reason && (
                <p style={{ fontSize: 'var(--text-micro)', color: 'var(--tone-attention)' }}>{fallbackReason(c)}</p>
              )}
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
