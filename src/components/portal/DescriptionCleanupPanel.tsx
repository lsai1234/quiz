'use client'

import { useCallback, useEffect, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Note } from '@/components/system'

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
 */
export function DescriptionCleanupPanel() {
  const [scan, setScan] = useState<Scan | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/product-descriptions')
      .then((r) => r.json())
      .then((d) => setScan(d.ok ? d : null))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(load, [load])

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
        const res = await fetch('/api/portal/product-descriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: slice, ai: mode === 'ai' }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || d.ok === false) {
          setError(d.error ?? 'Cleanup failed.')
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
      // The shop and the product sheet read descriptions — let them re-fetch.
      invalidateCatalogue()
      load()
    } finally {
      setProgress(null)
    }
  }

  if (!loaded) return null
  if (!scan || scan.withDescription === 0) return null

  const busy = progress !== null
  const clean = scan.withMarkup === 0

  return (
    <section
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--edge)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <div>
          <h2
            style={{
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-strong)',
              fontFamily: 'var(--font-display)',
              color: 'var(--ink-1)',
            }}
          >
            Product descriptions
          </h2>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            {clean
              ? `${scan.withDescription} imported product${scan.withDescription === 1 ? '' : 's'} — none are showing raw markup.`
              : `${scan.withMarkup} of ${scan.withDescription} still show the supplier's raw HTML in the shop.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {!clean && (
            <Button size="sm" loading={busy && progress?.mode === 'markup'} disabled={busy} onClick={() => run('markup')}>
              Clean markup
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            loading={busy && progress?.mode === 'ai'}
            disabled={busy}
            onClick={() => run('ai')}
          >
            Rewrite with AI
          </Button>
        </div>
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
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }} role="status">
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
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <p
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            Changed ({changes.length})
          </p>
          {changes.map((c) => (
            <div
              key={c.id}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--edge)',
                borderRadius: 'var(--radius-row)',
                padding: 'var(--space-3)',
                display: 'grid',
                gap: 'var(--space-1)',
              }}
            >
              <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                {c.title}
              </p>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', lineHeight: 'var(--leading-snug)' }}>
                {preview(c.before)}
              </p>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)', lineHeight: 'var(--leading-snug)' }}>
                → {preview(c.after)}
              </p>
              {c.source === 'cleaned' && c.reason && (
                <p style={{ fontSize: 'var(--text-micro)', color: 'var(--tone-attention)' }}>{fallbackReason(c)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
