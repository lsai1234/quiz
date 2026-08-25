'use client'

import { useCallback, useRef, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Card } from '@/components/system'

interface RowResult {
  sku: string
  id: string
  title: string
  enriched: boolean
  notes: string[]
}

/**
 * Import a curated roster CSV, enriched from PowerBody as it goes.
 *
 * WHY A FILE AND NOT THE SKU BOX
 * ──────────────────────────────
 * The SKU box asks PowerBody what a product IS. It cannot ask what a product is
 * FOR — which swap group it belongs to, what is in it, who must not take it,
 * which SKUs are flavours of one tub — and those are almost the only fields the
 * quiz reads. Deciding them one product at a time in a web form is how a
 * hundred-product roster never gets finished, so they are decided in a
 * spreadsheet and brought in together.
 *
 * Each row is still looked up as it imports, so the picture, category and blurb
 * come from PowerBody and the money is today's. A SKU they cannot answer for
 * still imports — it is orderable either way, since `createOrder` takes a SKU —
 * it just arrives without a picture, and the row says so.
 *
 * Sent in slices because each row costs a throttled supplier call: a hundred of
 * them will not fit in one request, so the screen loops and shows progress.
 */
export function RosterImport() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<RowResult[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const run = useCallback(async (csv: string) => {
    setBusy(true)
    setError(null)
    setResults(null)
    setWarnings([])
    setProgress(null)
    try {
      const all: RowResult[] = []
      let offset: number | null = 0
      let fileWarnings: string[] = []

      while (offset !== null) {
        const res: Response = await fetch('/api/portal/products/import-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv, offset }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(d.error ?? 'Import failed.')
          // Whatever landed before the failure is real and already in Review —
          // showing it is more use than pretending the run never happened.
          if (all.length > 0) setResults(all)
          return
        }
        all.push(...(d.results ?? []))
        if (offset === 0) fileWarnings = d.warnings ?? []
        if (d.lookupError) {
          fileWarnings = [...fileWarnings, `PowerBody could not be reached: ${d.lookupError}`]
        }
        setProgress({ done: all.length, total: d.total ?? all.length })
        offset = d.nextOffset ?? null
      }

      invalidateCatalogue()
      setResults(all)
      setWarnings(fileWarnings)
    } catch {
      setError('Could not import that file.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onFile = useCallback(
    async (file: File) => {
      setFileName(file.name)
      await run(await file.text())
    },
    [run],
  )

  const enriched = (results ?? []).filter((r) => r.enriched).length
  const flagged = (results ?? []).filter((r) => r.notes.length > 0)

  return (
    <Card padding="tight" className="space-y-2.5">
      <div>
        <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          Import a roster CSV
        </p>
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
          Your own spreadsheet of what to sell — one row per product, with a <code>sku</code> column. Each row is
          looked up as it imports, so the picture, category and description come from PowerBody. Everything lands in
          Review; nothing goes on sale.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        // `hidden`, not `sr-only`: this is a mechanism, not a control. The
        // Button is what is labelled and focusable, and sr-only would leave an
        // unnamed file input sitting in the tab order.
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Cleared so choosing the same file again still fires a change.
          e.target.value = ''
          if (file) void onFile(file)
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" loading={busy} onClick={() => fileRef.current?.click()}>
          Choose a CSV
        </Button>
        {fileName && (
          <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>{fileName}</span>
        )}
        {progress && busy && (
          <span role="status" style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
            {progress.done} of {progress.total} imported…
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--surface-2)', color: 'var(--tone-critical)', border: '1px solid var(--critical-line)' }}>
          {error}
        </p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs rounded-xl px-3.5 py-2.5" style={{ background: 'var(--accent-fill)', color: 'var(--ink-2)', border: '1px solid var(--accent-line)' }}>
            {results.length} product{results.length === 1 ? '' : 's'} imported, {enriched} with a picture and
            description from PowerBody. All waiting in Products → Review — nothing is on sale until you approve it.
          </p>

          {/* Named individually: a product that came in without a picture, or
              with an unusable swap group, is one somebody has to go and fix. */}
          {flagged.length > 0 && (
            <details className="rounded-xl px-3.5 py-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}>
              <summary className="text-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                {flagged.length} need{flagged.length === 1 ? 's' : ''} a look before approving
              </summary>
              <ul className="mt-2 space-y-1.5">
                {flagged.map((r) => (
                  <li key={r.id} className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                    <span style={{ color: 'var(--ink-2)' }}>{r.title}</span> ({r.sku})
                    <ul className="ml-3 list-disc">
                      {r.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {warnings.length > 0 && (
            <details className="rounded-xl px-3.5 py-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}>
              <summary className="text-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                {warnings.length} problem{warnings.length === 1 ? '' : 's'} in the file itself
              </summary>
              <ul className="mt-2 space-y-1 list-disc ml-4">
                {warnings.map((w) => (
                  <li key={w} className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                    {w}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  )
}
