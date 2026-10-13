'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Disclosure, Note } from '@/components/system'
import { productHref, REVIEW_HREF, SUPPLIER_SETTINGS_HREF } from '@/lib/portal/product-links'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { readNdjson } from './ndjson'
import {
  needsPull,
  plural,
  pullSummary,
  stopFor,
  supplierGaps,
  unanswered,
  unansweredStop,
  type PullResult,
  type PullStop,
  type QueueEntry,
} from './queue-model'

/** A couple of seconds between products: PowerBody allow two calls at a time, and a bulk run shares that with everything else. */
export const PULL_PACE_MS = 2_000
/** Products per run. Enough to clear a morning's import; few enough that a run is minutes, not an hour. */
export const PULL_CAP = 20
/** Which products this browser has already asked about, so "Carry on" carries on. */
const TRIED_KEY = 'chrgd:review:pull-tried'

const LINK = { color: 'var(--accent)', fontWeight: 'var(--weight-strong)', textDecoration: 'underline', textUnderlineOffset: '0.2em' } as const
const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const
const INK = { positive: 'var(--tone-positive)', neutral: 'var(--ink-3)', attention: 'var(--tone-attention)', critical: 'var(--tone-critical)' } as const

interface Logged {
  id: string
  title: string
  tone: keyof typeof INK
  text: string
}

type Ending = 'finished' | 'stopped' | 'refused' | 'signed-out'

interface Run {
  running: boolean
  total: number
  done: number
  current: { id: string; title: string; step: string | null } | null
  log: Logged[]
  stop: (PullStop & { steps: string[]; title: string }) | null
  ended: Ending | null
}

function readTried(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(TRIED_KEY)
    const ids = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeTried(ids: Set<string>) {
  try {
    window.sessionStorage.setItem(TRIED_KEY, JSON.stringify([...ids]))
  } catch {
    /* a convenience: without it, "Carry on" simply starts from the top */
  }
}

/**
 * "Fill all from PowerBody" — the review queue's bulk pull.
 *
 * The import deliberately does not fetch every product's picture and
 * description as it goes: a hundred throttled detail calls in a row is what
 * makes PowerBody start refusing, and a refused batch leaves every product
 * pictureless at once. This is the same pull the product page runs, walked over
 * the queue under rules that keep it from becoming that:
 *
 *   one at a time    each product's pull finishes (and saves) before the next
 *                    starts, so a stop never loses one half-written
 *   paced            a couple of seconds between products, leaving PowerBody's
 *                    two-at-a-time allowance room for anything else
 *   capped           twenty a run; a queue of a hundred is five presses, each
 *                    of which can be watched
 *   only the gaps    a product with a picture, a description and every SKU's
 *                    PowerBody id has nothing left to pull, and is skipped
 *   stops on refusal the first time PowerBody refuse — rate limit, DEMO
 *                    account, login — the run stops and shows their words.
 *                    Twenty more requests into a refusal teach nothing and can
 *                    lengthen a rate limit
 *   stops on silence two products in a row that PowerBody never finished
 *                    answering — each waits minutes — and the run stops rather
 *                    than spend the next hour waiting on the same silence
 *   resumable        what this browser has already asked about is remembered
 *                    for the session, so the next press carries on rather than
 *                    asking PowerBody about the same twenty again
 */
export function PullAll({
  entries,
  onPulled,
  onFinished,
  onRunningChange,
  onCurrent,
  paceMs = PULL_PACE_MS,
  cap = PULL_CAP,
}: {
  entries: QueueEntry[]
  /** A product as the pull left it, so its row can update without a reload. */
  onPulled: (id: string, next: { product: CatalogueProduct; remaining: string[] }) => void
  /** The run is over (finished, stopped or refused): time to re-read the queue. */
  onFinished: () => void
  onRunningChange?: (running: boolean) => void
  /** Which product the run is on now, or null between runs — so its row can say so. */
  onCurrent?: (id: string | null) => void
  paceMs?: number
  cap?: number
}) {
  const [tried, setTried] = useState<Set<string>>(new Set())
  const [run, setRun] = useState<Run | null>(null)
  const stopRef = useRef(false)
  const wakeRef = useRef<(() => void) | null>(null)

  // Read after mounting, never during the server render, so the first paint
  // matches on both sides.
  useEffect(() => setTried(readTried()), [])

  // Leaving the page ends the run after the product in hand — nothing is left
  // asking PowerBody on behalf of a screen nobody is looking at.
  useEffect(
    () => () => {
      stopRef.current = true
      wakeRef.current?.()
    },
    [],
  )

  const running = run?.running ?? false
  useEffect(() => onRunningChange?.(running), [running, onRunningChange])

  const gaps = useMemo(() => entries.filter((e) => needsPull(e.product)), [entries])
  const untried = useMemo(() => gaps.filter((e) => !tried.has(e.product.id)), [gaps, tried])
  const noSku = useMemo(() => entries.filter((e) => supplierGaps(e.product).skus === 0).length, [entries])

  const markTried = useCallback((id: string) => {
    setTried((prev) => {
      const next = new Set(prev).add(id)
      writeTried(next)
      return next
    })
  }, [])

  const forget = useCallback(() => {
    const next = new Set<string>()
    writeTried(next)
    setTried(next)
    setRun(null)
  }, [])

  function pause(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms)
      function done() {
        clearTimeout(timer)
        wakeRef.current = null
        resolve()
      }
      wakeRef.current = done
    })
  }

  function stop() {
    stopRef.current = true
    wakeRef.current?.()
  }

  async function pullOne(id: string, onStep: (message: string) => void) {
    const steps: string[] = []
    let result: PullResult | null = null
    try {
      const res = await fetch('/api/portal/products/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, stream: true }),
      })
      if (res.status === 401) return { result: null, steps, signedOut: true }
      await readNdjson(res, (line) => {
        if (line.type === 'step') {
          const message = String(line.message ?? '')
          steps.push(message)
          onStep(message)
        } else if (line.type === 'result') {
          result = line as PullResult
        } else if (!line.type && typeof line.error === 'string') {
          // Refused before the stream began — answered as plain JSON.
          result = { ok: false, status: res.status, error: line.error }
        }
      })
    } catch {
      // Our server, not PowerBody: the next product would meet the same wall.
      result = { ok: false, status: 503, error: 'Could not reach our server — check the connection, then carry on.' }
    }
    return { result: result as PullResult | null, steps, signedOut: false }
  }

  async function start() {
    const batch = untried.slice(0, cap).map((e) => ({ id: e.product.id, title: e.product.title }))
    if (batch.length === 0) return
    stopRef.current = false
    setRun({ running: true, total: batch.length, done: 0, current: null, log: [], stop: null, ended: null })
    const log = (entry: Logged) => setRun((r) => (r ? { ...r, done: r.done + 1, log: [...r.log, entry] } : r))

    let ended: Ending = 'finished'
    /** Products in a row PowerBody never finished answering for. */
    let silent = 0
    for (let i = 0; i < batch.length; i++) {
      if (stopRef.current) {
        ended = 'stopped'
        break
      }
      if (i > 0 && paceMs > 0) {
        await pause(paceMs)
        if (stopRef.current) {
          ended = 'stopped'
          break
        }
      }
      const { id, title } = batch[i]
      setRun((r) => (r ? { ...r, current: { id, title, step: null } } : r))
      onCurrent?.(id)
      const { result, steps, signedOut } = await pullOne(id, (step) =>
        setRun((r) => (r?.current?.id === id ? { ...r, current: { id, title, step } } : r)),
      )
      if (signedOut) {
        ended = 'signed-out'
        break
      }
      if (unanswered(result)) {
        // No answer from PowerBody: the request was cut off with no result
        // line, or the pull's own hard stop ended it (and saved what had
        // arrived). Not a refusal and not this product's fault, so it is left
        // untried — the next run asks again. But two in a row is PowerBody not
        // answering at all, and every further product would wait just as long.
        // A refusal they gave before going quiet is still a refusal, and stops
        // the run as one.
        const refusedFirst = result && result.ok !== false ? stopFor(result) : null
        if (refusedFirst) {
          if (result?.product) onPulled(id, { product: result.product, remaining: result.remaining ?? [] })
          setRun((r) => (r ? { ...r, stop: { ...refusedFirst, steps, title } } : r))
          ended = 'refused'
          break
        }
        silent += 1
        if (result?.product) onPulled(id, { product: result.product, remaining: result.remaining ?? [] })
        log({
          id,
          title,
          tone: 'attention',
          text:
            result?.message ??
            result?.error ??
            'Not reached this time — the request stopped before PowerBody answered. The next run tries it again.',
        })
        const quiet = unansweredStop(silent)
        if (quiet) {
          setRun((r) => (r ? { ...r, stop: { ...quiet, steps, title } } : r))
          ended = 'refused'
          break
        }
        continue
      }
      silent = 0
      if (!result) continue
      const refused = stopFor(result)
      if (refused) {
        setRun((r) => (r ? { ...r, stop: { ...refused, steps, title } } : r))
        ended = 'refused'
        break
      }
      markTried(id)
      if (result.ok !== false && result.product) onPulled(id, { product: result.product, remaining: result.remaining ?? [] })
      log({ id, title, ...pullSummary(result) })
    }
    setRun((r) => (r ? { ...r, running: false, current: null, ended } : r))
    onCurrent?.(null)
    onFinished()
  }

  const next = Math.min(untried.length, cap)
  const startLabel =
    untried.length === 0
      ? null
      : tried.size > 0 && gaps.some((e) => tried.has(e.product.id))
        ? `Carry on — fill ${next} more`
        : untried.length > cap
          ? `Fill the next ${cap} from PowerBody`
          : `Fill ${plural(untried.length, 'product')} from PowerBody`

  return (
    <Card padding="normal" as="section">
      <div className="flex flex-wrap items-start justify-between" style={{ gap: 'var(--space-3)' }}>
        <div className="min-w-0" style={{ flex: '1 1 20rem' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
            Fill all from PowerBody
          </h3>
          <p style={{ ...META, marginTop: 'var(--space-1)' }}>
            {gaps.length === 0
              ? 'Every product waiting has its picture, its description and its PowerBody ids — there is nothing left to pull.'
              : `${plural(gaps.length, 'product')} waiting ${gaps.length === 1 ? 'is' : 'are'} missing a picture, a description or a PowerBody id. ` +
                `This asks PowerBody about each in turn — one at a time, a couple of seconds apart, ${cap} a run — so it does not trip their rate limit. ` +
                'What they send is saved as it goes.'}
            {noSku > 0 && ` ${plural(noSku, 'product')} ${noSku === 1 ? 'has' : 'have'} no PowerBody SKU, so there is nothing to ask about — open ${noSku === 1 ? 'it' : 'them'} to fill in by hand.`}
          </p>
        </div>
        <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
          {running ? (
            <Button size="sm" variant="secondary" icon="pause" onClick={stop}>
              Stop after this one
            </Button>
          ) : startLabel ? (
            <Button size="sm" variant="primary" icon="download" onClick={() => void start()}>
              {startLabel}
            </Button>
          ) : gaps.length > 0 ? (
            <Button size="sm" variant="secondary" icon="refresh" onClick={forget}>
              Try all {gaps.length} again
            </Button>
          ) : null}
        </div>
      </div>

      {!running && untried.length === 0 && gaps.length > 0 && (
        <p style={{ ...META, marginTop: 'var(--space-2)' }}>
          Every one of them has been asked about this session. What is still missing is something PowerBody did not
          have — open each to fill it by hand, or try them all again later.
        </p>
      )}
      {!running && untried.length > cap && (
        <p style={{ ...META, marginTop: 'var(--space-2)' }}>
          {untried.length - cap} more after this run — press again when it finishes.
        </p>
      )}

      {run?.running && run.current && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Note tone="info" icon="refresh" live="polite">
            Filling {run.done + 1} of {run.total}: <strong>{run.current.title}</strong>
            {run.current.step && <span style={{ display: 'block', color: 'var(--ink-3)' }}>{run.current.step}</span>}
          </Note>
        </div>
      )}

      {run && !run.running && run.ended === 'stopped' && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Note tone="neutral" live="polite">
            Stopped after {plural(run.done, 'product')}. Everything filled so far is saved — press the button to carry on.
          </Note>
        </div>
      )}

      {run && !run.running && run.ended === 'finished' && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Note tone="positive" live="polite">
            Done: asked PowerBody about {plural(run.done, 'product')}.
            {untried.length > 0 ? ` ${untried.length} still to go — press again to carry on.` : ''}
          </Note>
        </div>
      )}

      {run && !run.running && run.ended === 'signed-out' && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Note tone="attention" icon="lock" live="assertive">
            Your session has expired, so the run stopped after {plural(run.done, 'product')}. Everything filled so far is
            saved.{' '}
            {/* A full page load: the sign-in screen is drawn by the hub's root layout. */}
            <a href={REVIEW_HREF} style={LINK}>
              Sign in again
            </a>
            , then carry on.
          </Note>
        </div>
      )}

      {run?.stop && <StopNote stop={run.stop} done={run.done} total={run.total} />}

      {run && run.log.length > 0 && (
        <ol style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }} aria-label="What the fill did">
          {run.log.map((entry, i) => (
            <li key={`${entry.id}-${i}`} style={META}>
              <Link href={productHref(entry.id, undefined, { queue: true })} style={{ ...LINK, color: 'var(--ink-1)' }}>
                {entry.title}
              </Link>
              {' — '}
              <span style={{ color: INK[entry.tone] }}>{entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

/**
 * Why the run stopped, in PowerBody's words, with the button for the fix.
 *
 * Their message already carries the remedy where there is one ("wait a minute,
 * then carry on", "ask PowerBody to switch it to live"), so this says where the
 * run got to and quotes them, rather than saying the same thing twice.
 */
function StopNote({ stop, done, total }: { stop: NonNullable<Run['stop']>; done: number; total: number }) {
  const lead =
    stop.kind === 'server'
      ? `Our server could not save “${stop.title}”, so the run stopped there (${done} of ${total} done).`
      : stop.kind === 'sample'
        ? 'The supplier is set to Sample, so nothing is being asked of PowerBody and the run stopped.'
        : stop.kind === 'unanswered'
          ? `The run stopped after “${stop.title}” (${done} of ${total} done). Everything PowerBody sent before then is saved.`
          : `PowerBody refused at “${stop.title}”, so the run stopped there (${done} of ${total} done). Everything before it is saved.`
  // Our words, not theirs: there is no "They said" when they said nothing.
  const ours = stop.kind === 'server' || stop.kind === 'unanswered'
  return (
    <div style={{ marginTop: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
      <Note
        tone={stop.kind === 'rate-limited' || stop.kind === 'sample' || stop.kind === 'unanswered' ? 'attention' : 'critical'}
        icon="alert-triangle"
        live="assertive"
      >
        {lead} {ours ? stop.message : <>They said: {stop.message}</>}{' '}
        {/*
          The checks live on Settings → Supplier, beside the API user and key,
          so one link serves both "see what PowerBody are answering" and "fix
          the login". A rate limit says when to carry on as well, because the
          checks will only meet the same limit.
        */}
        {stop.kind === 'server' ? (
          <>Try again in a minute.</>
        ) : stop.kind === 'sample' ? (
          <Link href={SUPPLIER_SETTINGS_HREF} style={LINK}>
            Open Settings → Supplier
          </Link>
        ) : (
          <>
            {stop.kind === 'rate-limited' && <>When a minute has passed, press the fill button again — it starts with this one. </>}
            {stop.kind === 'unanswered' && <>Press the fill button again later — it starts with the ones that were not answered. </>}
            {stop.kind === 'credentials' && <>The API user and key are set in Settings → Supplier. </>}
            <Link href={SUPPLIER_SETTINGS_HREF} style={LINK}>
              Run the checks
            </Link>
          </>
        )}
      </Note>
      {stop.steps.length > 0 && (
        // Every step it took, so a failure can be read rather than guessed at:
        // which call was made, what it saw, where it stopped.
        <Disclosure summary={`What it tried (${plural(stop.steps.length, 'step')})`}>
          <ol style={{ display: 'grid', gap: 'var(--space-1)', paddingLeft: 'var(--space-5)', listStyle: 'decimal' }}>
            {stop.steps.map((line, i) => (
              <li key={i} style={{ fontSize: 'var(--text-micro)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' }}>
                {line}
              </li>
            ))}
          </ol>
        </Disclosure>
      )}
    </div>
  )
}
