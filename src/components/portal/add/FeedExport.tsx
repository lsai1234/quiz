'use client'

import { useCallback, useState } from 'react'
import { Button, Note } from '@/components/system'
import { Row, Stack, metaText } from './ui'

/** A stop of last resort. The feed ending is what normally halts the loop. */
const MAX_PASSES = 60

/**
 * Download PowerBody's whole product list as a spreadsheet.
 *
 * Looking a code up asks "is this one there?". This asks "what is there?" once,
 * and answers for every code at the same time — the shape of the question when
 * you have a list of a hundred to check. What comes back is the SKU → product id
 * mapping plus cost and stock; names and pictures are the expensive half and are
 * not in it (PowerBody's own dashboard spreadsheet has those).
 *
 * Read in passes and stitched together: one request cannot hold a long feed —
 * the platform caps it and the supplier is throttled — so the server reads what
 * fits and says where it got to, and this loops until the feed ends.
 */
export function FeedExport() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    setResult(null)
    try {
      const parts: string[] = []
      let rows = 0
      let passes = 0
      let page: number | null = 1
      let complete = false
      while (page !== null && passes < MAX_PASSES) {
        const res: Response = await fetch('/api/portal/supplier/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromPage: page }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setResult({
            tone: 'critical',
            text:
              `PowerBody stopped answering after ${rows} products (${d.error ?? `the server answered ${res.status}`}). ` +
              'Nothing was downloaded — press it again in a few minutes, or run the checks in Settings → Supplier.',
          })
          return
        }
        parts.push(await res.text())
        rows += Number(res.headers.get('X-Row-Count') ?? 0)
        complete = res.headers.get('X-Feed-Complete') !== 'no'
        const next = res.headers.get('X-Next-Page')
        page = next ? Number(next) : null
        passes += 1
        setProgress(`Reading their list… ${rows.toLocaleString('en-GB')} products so far.`)
      }

      // Saved through a temporary link: the response is a POST, so there is no
      // address the browser could have downloaded on its own.
      const url = URL.createObjectURL(new Blob(parts, { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `powerbody-feed-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      // A partial file is still right about what IS in it. What it cannot
      // support is the opposite reading — "it is not on the account" — and that
      // is the one people act on, so it is said as loudly as a failure.
      setResult(
        complete
          ? {
              tone: 'positive',
              text:
                `Downloaded all ${rows.toLocaleString('en-GB')} products on this account. Anything missing from its sku ` +
                'column really is not on the account, and its productId column is what “Paste its product id” takes.',
            }
          : {
              tone: 'critical',
              text:
                `Stopped after ${passes} passes with ${rows.toLocaleString('en-GB')} products, so this file is only part ` +
                'of the catalogue. What is in it is real and the ids work — but anything missing proves nothing. Do not ' +
                'strike anything off a list using this file.',
            },
      )
    } catch {
      setResult({ tone: 'critical', text: 'The connection dropped while reading their list. Nothing was downloaded — press it again.' })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [])

  return (
    <Stack gap="var(--space-2)">
      <Row>
        <Button size="sm" variant="secondary" icon="download" loading={busy} onClick={run}>
          Download the full product list (CSV)
        </Button>
        {progress && (
          <span role="status" style={metaText}>
            {progress}
          </span>
        )}
      </Row>
      {result && (
        <Note tone={result.tone} live="polite">
          {result.text}
        </Note>
      )}
    </Stack>
  )
}
