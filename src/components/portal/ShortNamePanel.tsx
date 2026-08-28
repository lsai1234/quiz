'use client'

import { useCallback, useEffect, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Note } from '@/components/system'

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
 */
export function ShortNamePanel() {
  const [scan, setScan] = useState<Scan | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/portal/product-short-names')
      .then((r) => r.json())
      .then((d) => setScan(d.ok ? d : null))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(load, [load])

  async function run(mode: Mode) {
    if (!scan) return
    const ids = scan.candidates.map((c) => c.id)
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
        const data = await res.json()
        if (!data.ok) throw new Error(data.error ?? 'Naming failed.')
        for (const change of data.changes as Change[]) {
          collected.push(change)
          if (mode === 'ai' && change.source !== 'ai') fellBack++
        }
        setProgress({ mode, done: Math.min(i + BATCH, ids.length), total: ids.length })
      }

      setChanges(collected)
      setDone(
        mode === 'ai'
          ? `Named ${collected.length}. ${collected.length - fellBack} written by AI, ${fellBack} from the title.`
          : `Named ${collected.length} from their titles.`,
      )
      invalidateCatalogue()
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Naming failed.')
    } finally {
      setProgress(null)
    }
  }

  if (!loaded || !scan) return null

  const busy = progress !== null
  const missing = scan.candidates.length
  const allNamed = missing === 0

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
            Short names
          </h2>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            {allNamed
              ? `All ${scan.total} product${scan.total === 1 ? '' : 's'} have a name that fits a card.`
              : `${scan.withShortName} of ${scan.total} have one. ${missing} fall back to their title.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {!allNamed && (
            <Button size="sm" loading={busy && progress?.mode === 'derive'} disabled={busy} onClick={() => run('derive')}>
              Fill from titles
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon="sparkle"
            loading={busy && progress?.mode === 'ai'}
            disabled={busy || allNamed || !scan.hasKey}
            title={
              allNamed
                ? 'Every product already has one'
                : !scan.hasKey
                  ? 'No OPENAI_API_KEY is set, so there is nothing to call'
                  : `Write a name for ${missing} product(s) with AI`
            }
            onClick={() => run('ai')}
          >
            Write with AI
          </Button>
        </div>
      </div>

      {!allNamed && !busy && (
        <Note tone="info">
          Nothing is broken without these — a product with no short name shows a name worked out from its title. What
          this changes is whether that name is a decent guess or the right answer. <strong>Fill from titles</strong>{' '}
          stores that guess for every product: instant, free and safe to re-run.
        </Note>
      )}

      {allNamed && !busy && (
        <Note tone="positive">
          Every product has a name that fits. Edit any of them on the product itself — this panel only writes the ones
          that have none.
        </Note>
      )}

      {progress && (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }} role="status">
          Naming {progress.done} of {progress.total}…
          {progress.mode === 'ai' && ' Each one is an API call, so this takes a moment.'}
        </p>
      )}

      {error && <Note tone="critical" live="assertive">{error}</Note>}
      {done && !error && <Note tone="positive" live="polite">{done}</Note>}

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
            Named ({changes.length})
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
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', lineHeight: 'var(--leading-snug)' }}>
                {c.title}
              </p>
              <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                → {c.after}
              </p>
              {c.source !== 'ai' && c.reason && c.reason !== 'no-api-key' && (
                <p style={{ fontSize: 'var(--text-micro)', color: 'var(--tone-attention)' }}>{fallbackReason(c)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
