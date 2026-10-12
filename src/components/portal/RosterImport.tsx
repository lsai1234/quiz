'use client'

import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { Button, Card, Disclosure, Note, buttonSurface } from '@/components/system'
import { FilePickButton, readFileText } from '@/components/portal/FilePickButton'
import { REVIEW_HREF, productHref } from '@/lib/portal/product-links'

interface RowResult {
  sku: string
  id: string
  title: string
  enriched: boolean
  notes: string[]
  /** What the import did with this row's product. Absent from an older server: read as added. */
  outcome?: 'added' | 'refreshed' | 'already' | 'removed'
  existingId?: string
  existingTitle?: string
}

/** Everything the batches reported, added up. */
interface Totals {
  imported: number
  refreshed: number
  already: number
  enriched: number
  total: number
  /** SKUs PowerBody's product id is not known for yet. */
  withoutIds: string[]
  results: RowResult[]
  warnings: string[]
  lookupErrors: string[]
}

const empty = (): Totals => ({
  imported: 0,
  refreshed: 0,
  already: 0,
  enriched: 0,
  total: 0,
  withoutIds: [],
  results: [],
  warnings: [],
  lookupErrors: [],
})

const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
/** A server's sentence, made fit to sit inside one of ours: no full stop of its own. */
const clause = (message: string) => message.trim().replace(/[.。]+$/, '')
const quiet = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const

/**
 * Import a curated roster spreadsheet, enriched from PowerBody as it goes.
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
 * Each row is looked up in the stored PowerBody index as it imports, so the
 * picture, category and blurb come from PowerBody and the money is today's. A
 * SKU the index has no id for still imports — it is orderable either way — and
 * is reported, with a button that looks those ids up.
 *
 * ── Safe to run twice ──────────────────────────────────────────────────────
 * A product already in the catalogue is never replaced. One still waiting for
 * review gets the sheet's own fields refreshed (swap group, goals, warnings —
 * the half only the sheet knows); one on sale is left exactly as it is. Both
 * are counted, so a re-run says what it did rather than "0 imported".
 *
 * ── A batch that fails ─────────────────────────────────────────────────────
 * Sent twelve rows at a time, because each row can cost a throttled supplier
 * call. A failed batch is asked for once more on its own (PowerBody's server
 * fails transiently under load); if it fails again the import stops there and
 * offers to carry on from that row. What landed before it is real and stays.
 */
export function RosterImport({
  onPowerBodyCsv,
  onFindIds,
}: {
  /** The file turned out to be PowerBody's own catalogue: hand it to the picker that reads it. */
  onPowerBodyCsv?: (csv: string, fileName: string) => void
  /** Look up the SKUs that came in without a PowerBody id. */
  onFindIds?: (skus: string[]) => void
} = {}) {
  const csvRef = useRef<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [failure, setFailure] = useState<{ message: string; resumeAt: number | null; total: number } | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  const run = useCallback(async (startAt: number, carried: Totals | null) => {
    const csv = csvRef.current
    if (csv === null) return
    setBusy(true)
    setFailure(null)
    setRefusal(null)
    const acc: Totals = carried ? { ...carried, withoutIds: [...carried.withoutIds], results: [...carried.results] } : empty()
    let offset: number | null = startAt
    try {
      while (offset !== null) {
        let data: Record<string, unknown> | null = null
        let problem = ''
        let fatal = false
        for (let attempt = 0; attempt < 2 && !data; attempt += 1) {
          try {
            const res: Response = await fetch('/api/portal/products/import-csv', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ csv, offset }),
            })
            const d = (await res.json().catch(() => ({}))) as Record<string, unknown>
            if (res.ok) {
              data = d
              break
            }
            if (d.powerBodyCsv) {
              setRefusal(typeof d.error === 'string' ? d.error : 'That is PowerBody’s own product list, not a roster spreadsheet.')
              return
            }
            problem = typeof d.error === 'string' ? d.error : `the server answered ${res.status}`
            // A 400 is the file, not the weather: asking again gets the same answer.
            if (res.status === 400) {
              fatal = true
              break
            }
          } catch {
            problem = 'the connection dropped'
          }
          if (attempt === 0) {
            setProgress(`Row ${offset + 1} did not go through (${clause(problem)}) — trying that batch once more…`)
            await new Promise((resolve) => setTimeout(resolve, 2000))
          }
        }

        if (!data) {
          if (acc.imported + acc.refreshed > 0) invalidateCatalogue()
          setTotals(acc.results.length > 0 ? acc : null)
          setFailure({ message: problem, resumeAt: fatal ? null : offset, total: acc.total })
          return
        }

        const results = Array.isArray(data.results) ? (data.results as RowResult[]) : []
        acc.results.push(...results)
        acc.total = Number(data.total ?? acc.total) || acc.total
        // The counts are the server's; an older server sent only results, which were all imports.
        acc.imported += typeof data.imported === 'number' ? data.imported : results.length
        acc.refreshed += Number(data.refreshed ?? 0)
        acc.already += Number(data.already ?? 0)
        acc.enriched += Number(data.enriched ?? results.filter((r) => r.enriched).length)
        for (const sku of Array.isArray(data.withoutIds) ? (data.withoutIds as string[]) : []) {
          if (!acc.withoutIds.includes(sku)) acc.withoutIds.push(sku)
        }
        if (offset === 0 && Array.isArray(data.warnings)) acc.warnings = data.warnings as string[]
        if (typeof data.lookupError === 'string' && !acc.lookupErrors.includes(data.lookupError)) acc.lookupErrors.push(data.lookupError)
        setProgress(`${acc.results.length} of ${acc.total} rows done…`)
        offset = typeof data.nextOffset === 'number' ? data.nextOffset : null
      }
      invalidateCatalogue()
      setTotals(acc)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [])

  const onFile = useCallback(
    async (file: File) => {
      setFileName(file.name)
      setTotals(null)
      try {
        csvRef.current = await readFileText(file)
      } catch {
        setFailure({ message: `${file.name} could not be read — if it is open in Excel, close it and choose it again`, resumeAt: null, total: 0 })
        return
      }
      await run(0, null)
    },
    [run],
  )

  const flagged = (totals?.results ?? []).filter((r) => r.notes.length > 0)
  const elsewhere = (totals?.results ?? []).filter((r) => r.outcome && r.outcome !== 'added' && r.outcome !== 'refreshed' && r.existingId)

  return (
    <Card padding="normal" as="section">
      <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
        <div>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
            Import a roster spreadsheet
          </h3>
          <p style={{ ...quiet, marginTop: 'var(--space-1)' }}>
            Your own spreadsheet of what to sell — one row per product with a <code>sku</code> column, and your choices
            for each (swap group, goals, actives, warnings, which SKUs are its flavours). Not PowerBody’s product list:
            that one goes in “Pick from PowerBody’s spreadsheet” above. Everything lands in Review; nothing goes on sale.
          </p>
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
          <FilePickButton accept=".csv,text/csv" variant="secondary" loading={busy} onFile={onFile}>
            Choose a roster spreadsheet
          </FilePickButton>
          {fileName && <span style={quiet}>{fileName}</span>}
          {progress && busy && (
            <span role="status" style={quiet}>
              {progress}
            </span>
          )}
        </div>

        {refusal && (
          <Note tone="attention" live="polite">
            {refusal}{' '}
            {onPowerBodyCsv && csvRef.current !== null && (
              <Button size="sm" variant="secondary" onClick={() => onPowerBodyCsv(csvRef.current as string, fileName ?? 'PowerBody’s spreadsheet')}>
                Open it in the spreadsheet picker
              </Button>
            )}
          </Note>
        )}

        {failure && (
          <Note tone="critical" live="assertive">
            {failure.resumeAt !== null ? (
              <>
                Stopped at row {failure.resumeAt + 1}
                {failure.total ? ` of ${failure.total}` : ''} — that batch failed twice ({clause(failure.message)}). Rows
                before it are in and stay in.{' '}
                <Button size="sm" variant="secondary" onClick={() => run(failure.resumeAt as number, totals)}>
                  Carry on from row {failure.resumeAt + 1}
                </Button>
              </>
            ) : (
              <>Not imported — {clause(failure.message)}. Fix the file and choose it again.</>
            )}
          </Note>
        )}

        {totals && totals.results.length > 0 && (
          <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            <Note tone="positive" live="polite">
              {s(totals.imported, 'product')} imported, {totals.enriched} with a picture and description from PowerBody.
              {totals.refreshed > 0 &&
                ` ${s(totals.refreshed, 'product')} already waiting for review ${totals.refreshed === 1 ? 'was' : 'were'} refreshed with your sheet’s swap groups, goals and warnings — prices, pictures and names kept.`}
              {totals.already > 0 &&
                ` ${s(totals.already, 'product')} already in the catalogue ${totals.already === 1 ? 'was' : 'were'} left exactly as ${totals.already === 1 ? 'it is' : 'they are'}.`}{' '}
              Nothing is on sale until you approve it.
            </Note>

            {totals.withoutIds.length > 0 && (
              <Note tone="attention">
                {s(totals.withoutIds.length, 'SKU')} {totals.withoutIds.length === 1 ? 'has' : 'have'} no PowerBody
                product id yet, so {totals.withoutIds.length === 1 ? 'it' : 'they'} came in without PowerBody’s picture,
                cost and stock. Look them up to find their ids — each one found is kept, so pulling the product’s details
                on its page afterwards is instant.{' '}
                {onFindIds && (
                  <Button size="sm" variant="secondary" onClick={() => onFindIds(totals.withoutIds)}>
                    Find their ids
                  </Button>
                )}
              </Note>
            )}

            {totals.lookupErrors.length > 0 && (
              <Note tone="attention">
                PowerBody could not be reached for part of the file ({totals.lookupErrors.join('; ')}), so those rows came
                in without their details. Their product pages’ “Pull from PowerBody” fills them in.
              </Note>
            )}

            <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
              <Link href={REVIEW_HREF} {...buttonSurface('primary', 'sm')}>
                Next: review them
              </Link>
            </div>

            {elsewhere.length > 0 && (
              <Disclosure summary={`${s(elsewhere.length, 'row')} already in the catalogue`}>
                <ul className="flex flex-col" style={{ gap: 'var(--space-1)', ...quiet }}>
                  {elsewhere.map((r) => (
                    <li key={`${r.sku}-${r.existingId}`}>
                      {r.sku}: already in{' '}
                      <Link href={productHref(r.existingId as string)} className="system-focus" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                        {r.existingTitle ?? r.title}
                      </Link>
                      {r.outcome === 'removed' ? ' (removed — restore it on its page)' : ''}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}

            {/* Named individually: a product that came in without a picture, or
                with an unusable swap group, is one somebody has to go and fix. */}
            {flagged.length > 0 && (
              <Disclosure summary={`${flagged.length} need${flagged.length === 1 ? 's' : ''} a look before approving`}>
                <ul className="flex flex-col" style={{ gap: 'var(--space-2)', ...quiet }}>
                  {flagged.map((r) => (
                    <li key={`${r.id}-${r.sku}`}>
                      <span style={{ color: 'var(--ink-2)' }}>{r.title}</span> ({r.sku})
                      <ul style={{ paddingLeft: 'var(--space-4)', listStyle: 'disc' }}>
                        {r.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}

            {totals.warnings.length > 0 && (
              <Disclosure summary={`${s(totals.warnings.length, 'problem')} in the file itself`}>
                <ul style={{ paddingLeft: 'var(--space-4)', listStyle: 'disc', ...quiet }}>
                  {totals.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
