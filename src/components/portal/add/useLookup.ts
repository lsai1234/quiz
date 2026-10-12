'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { productHref } from '@/lib/portal/product-links'
import {
  MAX_RATE_LIMIT_PAUSES,
  clause,
  freshCard,
  notOnAccountNext,
  rateLimitWait,
  readNdjson,
  withAnswer,
  type Ask,
  type CodeCard,
  type LookupGroup,
  type NextStep,
  type QuickPassResponse,
  type RefusalKind,
  type SearchResult,
  type StoredRef,
} from './lookup'

/** One search waiting its turn. Cards are addressed by key, which is unique across groups. */
interface Job {
  cardKey: string
  ask: Ask
}

/** A batch waiting out PowerBody's rate limit. */
export interface LookupPause {
  until: number
  attempt: number
  message: string
}

/**
 * Why the rest of a batch was not looked up — the circuit breaker's banner.
 * `signed-out` is our own session expiring, not PowerBody: every request after
 * it would be refused by this app before PowerBody was ever asked.
 */
export interface LookupHalt {
  kind: RefusalKind | 'gave-up' | 'signed-out'
  message: string
}

const SIGNED_OUT =
  'Your session has expired, so the hub refused the lookup before PowerBody was asked. Sign in again and look these codes up again.'

/** What the page learns about the supplier from answers, for the status strip. */
export interface SupplierSeen {
  source?: 'mock' | 'powerbody'
  /** PowerBody answered like their DEMO sandbox. */
  demo?: boolean
}

export interface LookupBatch {
  title: string | null
  brand?: string
  source: LookupGroup['source']
  codes: string[]
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** A made-up answer for when the server never gave one, in the server's own shape. */
function noAnswer(code: string, message: string, next: NextStep[] = ['search-again', 'paste-id']): SearchResult {
  return { type: 'result', code, status: 'not-yet', message, next, card: null, stored: null }
}

/**
 * The lookup, run one code at a time.
 *
 * ── Why one at a time ──────────────────────────────────────────────────────
 * Every search is throttled requests against PowerBody's API, and the throttle
 * is per account, not per request. Two searches side by side do not finish in
 * half the time — they trip the limit in half the time, and then neither
 * finishes. So the quick pass answers everything it can in ONE request, and
 * what is left is searched in turn, each code showing its own progress.
 *
 * ── Why a refusal stops the batch ─────────────────────────────────────────
 * Some refusals are about the account, not the code. If PowerBody have put us
 * on their DEMO sandbox, or our login is wrong, the next nineteen codes will be
 * refused in exactly the same words, a couple of minutes each. So the first
 * one of those stops the rest (the circuit breaker) and says what to fix; the
 * codes it did not reach are kept for "Try the rest again".
 *
 * A rate limit is different: it passes on its own. The whole batch pauses with
 * a countdown — 45 seconds, then doubling — and carries on from the code that
 * was refused. Only if it keeps happening does the batch stop and say so.
 */
export function useLookup(options: {
  onSupplier?: (seen: SupplierSeen) => void
  onIndex?: (index: QuickPassResponse['index']) => void
} = {}) {
  const [groups, setGroups] = useState<LookupGroup[]>([])
  /** Quick passes in flight. */
  const [checking, setChecking] = useState(0)
  const [searching, setSearching] = useState(false)
  const [pause, setPause] = useState<LookupPause | null>(null)
  const [halt, setHalt] = useState<LookupHalt | null>(null)
  /** A sentence about the run as a whole — e.g. the quick pass falling back. */
  const [notice, setNotice] = useState<string | null>(null)

  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const optionsRef = useRef(options)
  optionsRef.current = options

  const queue = useRef<Job[]>([])
  const running = useRef(false)
  const halted = useRef(false)
  const stopping = useRef(false)
  const wake = useRef<(() => void) | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const limitedInARow = useRef(0)
  /**
   * A rate limit the quick pass already ran into. The first search waits it
   * out before asking, rather than spending a request to be told the same.
   */
  const pauseFirst = useRef<string | null>(null)
  const seq = useRef(0)
  /**
   * Every card key on the page, kept in step synchronously. The worker checks
   * a job's card against this rather than against rendered state, which can be
   * a render behind — and a job dropped for that reason is a code that silently
   * never gets looked up.
   */
  const liveKeys = useRef(new Set<string>())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    // Reset as well as set: in development React mounts, unmounts and mounts
    // again, and a stop flag left over from the first unmount would end every
    // batch before it started.
    stopping.current = false
    return () => {
      // Leaving the page ends the run: nothing should keep asking PowerBody
      // for answers nobody is there to read.
      mounted.current = false
      stopping.current = true
      inFlight.current?.abort()
      wake.current?.()
    }
  }, [])

  const nextKey = useCallback((prefix: string) => `${prefix}${(seq.current += 1)}`, [])

  const updateCard = useCallback((cardKey: string, change: (card: CodeCard) => CodeCard) => {
    if (!mounted.current) return
    setGroups((gs) =>
      gs.map((g) =>
        g.cards.some((c) => c.key === cardKey)
          ? { ...g, cards: g.cards.map((c) => (c.key === cardKey ? change(c) : c)) }
          : g,
      ),
    )
  }, [])

  const findCard = useCallback((cardKey: string): CodeCard | undefined => {
    for (const g of groupsRef.current) {
      const hit = g.cards.find((c) => c.key === cardKey)
      if (hit) return hit
    }
    return undefined
  }, [])

  /** The founder asked for more: whatever stopped the last batch no longer applies. */
  const clearHalt = useCallback(() => {
    halted.current = false
    setHalt(null)
  }, [])

  /** Mark everything still waiting as not reached, and empty the queue. */
  const strandQueue = useCallback(
    (message: string) => {
      for (const job of queue.current) {
        updateCard(job.cardKey, (c) => ({ ...c, status: 'stopped', message, next: [], lastAsk: job.ask }))
      }
      queue.current = []
    },
    [updateCard],
  )

  const breakCircuit = useCallback(
    (kind: LookupHalt['kind'], message: string) => {
      halted.current = true
      setHalt({ kind, message })
      strandQueue('Not looked up — the batch stopped at the refusal above. “Try the rest again” carries on once it is sorted.')
    },
    [strandQueue],
  )

  /** Wait out a rate limit, or until "Carry on now" / "Stop" is pressed. */
  const waitOut = useCallback(async (ms: number, message: string) => {
    setPause({ until: Date.now() + ms, attempt: limitedInARow.current, message })
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms)
      wake.current = () => {
        clearTimeout(timer)
        resolve()
      }
    })
    wake.current = null
    if (mounted.current) setPause(null)
  }, [])

  /**
   * One streamed search. Returns the server's answer, a stand-in "not yet" when
   * none arrived (asked once more first), or null when it was cancelled.
   */
  const searchOne = useCallback(
    async (job: Job): Promise<SearchResult | null | 'signed-out'> => {
      const { code } = job.ask
      const say = (line: string) =>
        updateCard(job.cardKey, (c) => ({ ...c, steps: [...c.steps, line].slice(-60) }))
      updateCard(job.cardKey, (c) => ({
        ...c,
        status: 'searching',
        message: `Searching PowerBody for ${code}…`,
        steps: [],
        note: undefined,
      }))

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController()
        inFlight.current = controller
        try {
          const res = await fetch('/api/portal/supplier/resolve', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({
              code,
              stream: true,
              ...(job.ask.searchAnyway ? { searchAnyway: true } : {}),
              ...(job.ask.expectSku ? { expectSku: job.ask.expectSku } : {}),
            }),
            signal: controller.signal,
          })
          if (res.status === 401) return 'signed-out'
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            return noAnswer(
              code,
              `The search for ${code} did not start${d.error ? ` — ${clause(String(d.error))}` : ''}. Search again to try once more.`,
            )
          }
          const got: { result: SearchResult | null } = { result: null }
          await readNdjson(res, (line) => {
            if (line.type === 'step' && typeof line.message === 'string') say(line.message)
            else if (line.type === 'result') got.result = line as unknown as SearchResult
          })
          if (got.result) return got.result
          // The request closed without its last line — usually the platform
          // cutting a long search off. The server keeps every id it saw, so
          // asking again carries on rather than starting over.
          if (attempt === 0) {
            say('The answer did not arrive — asking once more, carrying on from what it found.')
            continue
          }
          return noAnswer(
            code,
            `The search for ${code} ended twice without an answer — usually the connection closing on a long search. ` +
              'Search again to carry on (what it found so far is kept), or paste its product id.',
          )
        } catch {
          if (controller.signal.aborted) return null
          if (attempt === 0) {
            say('Lost the connection — asking once more.')
            continue
          }
          return noAnswer(code, `Lost the connection while searching for ${code}. Check you are online, then search again.`)
        } finally {
          if (inFlight.current === controller) inFlight.current = null
        }
      }
      return noAnswer(code, `No answer for ${code}. Search again.`)
    },
    [updateCard],
  )

  const pump = useCallback(async () => {
    if (running.current) return
    running.current = true
    setSearching(true)
    /*
      Take THIS job off the queue — not whatever is at its head by now. The
      queue can change during a search (the same codes looked up again replace
      their cards and drop their jobs), and shifting the head after that would
      throw away a code that was never searched, leaving its card waiting for
      ever.
    */
    const dequeue = (job: Job) => {
      queue.current = queue.current.filter((j) => j !== job)
    }
    try {
      while (queue.current.length > 0 && mounted.current) {
        if (halted.current || stopping.current) break
        const job = queue.current[0]
        if (!liveKeys.current.has(job.cardKey)) {
          dequeue(job)
          continue
        }
        if (pauseFirst.current !== null) {
          const message = pauseFirst.current
          pauseFirst.current = null
          limitedInARow.current += 1
          await waitOut(rateLimitWait(limitedInARow.current), message)
          continue
        }
        const answer = await searchOne(job)
        if (!mounted.current) return
        if (answer === 'signed-out') {
          // Left at the head of the queue, so it is stranded with the rest and
          // "Try the rest again" includes it once signed back in.
          breakCircuit('signed-out', SIGNED_OUT)
          break
        }
        if (answer === null) {
          dequeue(job)
          updateCard(job.cardKey, (c) => ({ ...c, status: 'stopped', message: 'Stopped before the search finished.', next: [], lastAsk: job.ask }))
          continue
        }
        if (answer.supplierName === 'mock' || answer.supplierName === 'powerbody') {
          optionsRef.current.onSupplier?.({ source: answer.supplierName })
        }

        if (answer.status === 'refused' && answer.refusal === 'rate-limited') {
          limitedInARow.current += 1
          if (limitedInARow.current > MAX_RATE_LIMIT_PAUSES) {
            // The refused code stays in the queue, so it is stranded with the
            // rest and "Try the rest again" includes it.
            limitedInARow.current = 0
            breakCircuit(
              'gave-up',
              `PowerBody asked us to slow down ${MAX_RATE_LIMIT_PAUSES} times in a row, so the lookup has stopped rather than keep ` +
                'knocking. Nothing is lost — try the rest again in a few minutes.',
            )
            break
          }
          updateCard(job.cardKey, (c) => ({
            ...c,
            status: 'queued',
            message: 'PowerBody asked us to slow down. This one is first in line when the pause ends.',
          }))
          await waitOut(rateLimitWait(limitedInARow.current), answer.message)
          continue
        }

        limitedInARow.current = 0
        dequeue(job)
        updateCard(job.cardKey, (c) => withAnswer({ ...c, lastAsk: job.ask }, answer))
        if (answer.status === 'refused' && (answer.refusal === 'sandbox' || answer.refusal === 'credentials')) {
          if (answer.refusal === 'sandbox') optionsRef.current.onSupplier?.({ demo: true })
          breakCircuit(answer.refusal, answer.message)
          break
        }
      }
    } finally {
      running.current = false
      if (stopping.current && mounted.current) {
        strandQueue('Not looked up — you stopped the lookup. “Try the rest again” carries on from here.')
        stopping.current = false
      }
      if (mounted.current) setSearching(false)
    }
  }, [breakCircuit, searchOne, strandQueue, updateCard, waitOut])

  const enqueue = useCallback(
    (jobs: Job[]) => {
      for (const job of jobs) {
        queue.current = queue.current.filter((j) => j.cardKey !== job.cardKey)
        queue.current.push(job)
        updateCard(job.cardKey, (c) => ({
          ...c,
          status: 'queued',
          message: 'Waiting its turn to be searched for.',
          steps: [],
          note: undefined,
          lastAsk: job.ask,
        }))
      }
      void pump()
    },
    [pump, updateCard],
  )

  /**
   * Look codes up: the quick pass for all of them at once, then a search for
   * each one it could not answer.
   */
  const run = useCallback(
    async (batches: LookupBatch[]) => {
      const codes = batches.flatMap((b) => b.codes)
      if (codes.length === 0) return
      clearHalt()
      setNotice(null)

      const fresh: LookupGroup[] = batches
        .filter((b) => b.codes.length > 0)
        .map((b) => ({
          key: nextKey('g'),
          title: b.title,
          brand: b.brand,
          source: b.source,
          cards: b.codes.map((code) => freshCard(nextKey('c'), code)),
        }))
      // A code looked up again replaces its old card rather than sitting
      // twice on the page, possibly with two different answers.
      const wanted = new Set(codes)
      const replaced = new Set(
        groupsRef.current.flatMap((g) => g.cards.filter((c) => wanted.has(c.code)).map((c) => c.key)),
      )
      queue.current = queue.current.filter((j) => !replaced.has(j.cardKey))
      for (const key of replaced) liveKeys.current.delete(key)
      setGroups((gs) => [
        ...fresh,
        ...gs
          .map((g) => ({ ...g, cards: g.cards.filter((c) => !replaced.has(c.key)) }))
          .filter((g) => g.cards.length > 0),
      ])
      const newCards = fresh.flatMap((g) => g.cards)
      for (const card of newCards) liveKeys.current.add(card.key)

      setChecking((n) => n + 1)
      let quick: QuickPassResponse | null = null
      let quickError: string | null = null
      try {
        const res = await fetch('/api/portal/supplier/resolve', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ codes: [...wanted] }),
        })
        if (res.status === 401) quickError = SIGNED_OUT
        else {
          const d = await res.json().catch(() => ({}))
          if (res.ok && Array.isArray(d.results)) quick = d as QuickPassResponse
          else quickError = d.error ?? `the server answered ${res.status}`
        }
      } catch {
        quickError = 'the server could not be reached'
      } finally {
        if (mounted.current) setChecking((n) => n - 1)
      }
      if (!mounted.current) return

      if (quickError === SIGNED_OUT) {
        // Searching one at a time would be refused in the same words, code by code.
        for (const card of newCards) {
          updateCard(card.key, (c) => ({ ...c, status: 'stopped', message: 'Not looked up — signed out.', next: [], lastAsk: { code: c.code } }))
        }
        halted.current = true
        setHalt({ kind: 'signed-out', message: SIGNED_OUT })
        return
      }

      if (!quick) {
        // Not a dead end: the search does everything the quick pass does, one
        // code at a time. Slower, and says so, but every code still gets an answer.
        setNotice(
          `The quick check did not answer (${clause(quickError ?? 'no reason given')}), so each code is being searched for one at a time instead. ` +
            'Slower, but each one still gets its own answer.',
        )
        enqueue(newCards.map((c) => ({ cardKey: c.key, ask: { code: c.code } })))
        return
      }

      optionsRef.current.onSupplier?.({ source: quick.source })
      optionsRef.current.onIndex?.(quick.index)

      const byCode = new Map(quick.results.map((r) => [r.code, r]))
      const toSearch: Job[] = []
      const refusedBatch =
        quick.refusal && (quick.refusal.kind === 'sandbox' || quick.refusal.kind === 'credentials') ? quick.refusal : null

      for (const card of newCards) {
        const r = byCode.get(card.code)
        if (!r) {
          toSearch.push({ cardKey: card.key, ask: { code: card.code } })
          continue
        }
        if (r.status === 'found') {
          updateCard(card.key, (c) => withAnswer(c, { ...r, type: 'result', status: 'found', next: [] }))
        } else if (r.status === 'not-on-account') {
          updateCard(card.key, (c) =>
            withAnswer(c, { ...r, type: 'result', status: 'not-on-account', next: notOnAccountNext(quick.source) }),
          )
        } else if (r.stored) {
          // We already sell it, so there is nothing to search PowerBody for —
          // the answer is a link to our own product (or a Restore).
          const stored = r.stored
          updateCard(card.key, (c) => ({
            ...c,
            status: 'held',
            stored,
            message: `Already in your catalogue, so PowerBody were not searched for it.`,
            next: [],
          }))
        } else if (refusedBatch) {
          updateCard(card.key, (c) => ({
            ...c,
            status: 'stopped',
            message: 'Not looked up — PowerBody refused the batch (see above). “Try the rest again” carries on once it is sorted.',
            lastAsk: { code: c.code },
          }))
        } else {
          toSearch.push({ cardKey: card.key, ask: { code: card.code } })
        }
      }

      if (refusedBatch) {
        if (refusedBatch.kind === 'sandbox') optionsRef.current.onSupplier?.({ demo: true })
        halted.current = true
        setHalt({ kind: refusedBatch.kind, message: refusedBatch.message })
        return
      }
      if (toSearch.length > 0) {
        if (quick.refusal?.kind === 'rate-limited' && !running.current) pauseFirst.current = quick.refusal.message
        enqueue(toSearch)
      }
    },
    [clearHalt, enqueue, nextKey, updateCard],
  )

  /** Search one card again — as it was, or with a pasted id, an edited code, or past the index. */
  const searchAgain = useCallback(
    (cardKey: string, ask?: Ask) => {
      const card = findCard(cardKey)
      if (!card) return
      clearHalt()
      const next = ask ?? card.lastAsk ?? { code: card.code }
      if (ask && ask.code !== card.code && !ask.expectSku) {
        // An edited code: the card is about the new code now.
        updateCard(cardKey, (c) => ({ ...c, code: ask.code, sku: /^\d+$/.test(ask.code) ? null : ask.code }))
      }
      enqueue([{ cardKey, ask: next }])
    },
    [clearHalt, enqueue, findCard, updateCard],
  )

  /** "Did you mean SKU P…?" — another card in the same group, searched straight away. */
  const addCode = useCallback(
    (groupKey: string, code: string) => {
      if (groupsRef.current.some((g) => g.cards.some((c) => c.code === code))) return
      const card = freshCard(nextKey('c'), code)
      liveKeys.current.add(card.key)
      setGroups((gs) => gs.map((g) => (g.key === groupKey ? { ...g, cards: [...g.cards, card] } : g)))
      enqueue([{ cardKey: card.key, ask: { code } }])
    },
    [enqueue, nextKey],
  )

  /** Everything the circuit breaker (or Stop) left unlooked-up, back in the queue. */
  const retryStopped = useCallback(() => {
    clearHalt()
    limitedInARow.current = 0
    const jobs = groupsRef.current.flatMap((g) =>
      g.cards.filter((c) => c.status === 'stopped').map((c) => ({ cardKey: c.key, ask: c.lastAsk ?? { code: c.code } })),
    )
    if (jobs.length > 0) enqueue(jobs)
  }, [clearHalt, enqueue])

  const carryOnNow = useCallback(() => wake.current?.(), [])

  const stop = useCallback(() => {
    pauseFirst.current = null
    stopping.current = true
    wake.current?.()
    inFlight.current?.abort()
  }, [])

  const toggle = useCallback(
    (cardKey: string, ticked: boolean) => updateCard(cardKey, (c) => ({ ...c, ticked })),
    [updateCard],
  )

  const setTicks = useCallback((groupKey: string, ticked: boolean) => {
    setGroups((gs) =>
      gs.map((g) =>
        g.key === groupKey
          ? { ...g, cards: g.cards.map((c) => (c.status === 'found' && c.row && !c.stored && !c.placed ? { ...c, ticked } : c)) }
          : g,
      ),
    )
  }, [])

  /** Record where added cards ended up, so they show as in the catalogue and cannot be added twice. */
  const placeCards = useCallback(
    (placed: Map<string, NonNullable<CodeCard['placed']>>) => {
      for (const [cardKey, where] of placed) {
        updateCard(cardKey, (c) => ({
          ...c,
          placed: where,
          ticked: false,
          stored: { id: where.id, title: where.title, state: where.live ? 'live' : 'pending', skus: c.sku ? [c.sku] : [] },
        }))
      }
    },
    [updateCard],
  )

  /** Cards an add found already in the catalogue: they become links to it (or a Restore). */
  const holdCards = useCallback(
    (held: Map<string, StoredRef>) => {
      for (const [cardKey, stored] of held) updateCard(cardKey, (c) => ({ ...c, stored, ticked: false }))
    },
    [updateCard],
  )

  /** Put a removed product back. Every card that points at it learns the answer. */
  const restore = useCallback(async (productId: string) => {
    const touch = (change: (c: CodeCard) => CodeCard) =>
      setGroups((gs) =>
        gs.map((g) => ({ ...g, cards: g.cards.map((c) => (c.stored?.id === productId ? change(c) : c)) })),
      )
    try {
      const res = await fetch('/api/portal/products', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ id: productId, action: 'restore' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        touch((c) => ({
          ...c,
          note: {
            tone: 'critical',
            text: `Not restored — ${d.error ?? `the server answered ${res.status}`}`,
            href: d.link?.href ?? productHref(productId),
            hrefLabel: d.link?.label ?? 'Open the product',
          },
        }))
        return
      }
      invalidateCatalogue()
      const state: 'live' | 'pending' = d.state === 'live' ? 'live' : 'pending'
      touch((c) => ({
        ...c,
        stored: c.stored ? { ...c.stored, state } : c.stored,
        ticked: false,
        note: {
          tone: 'positive',
          text: state === 'live' ? 'Restored — it is back on sale.' : 'Restored — it is back, waiting for review.',
          href: productHref(productId),
          hrefLabel: 'Open it',
        },
      }))
    } catch {
      touch((c) => ({
        ...c,
        note: { tone: 'critical', text: 'Not restored — the server could not be reached. Check you are online and press Restore again.' },
      }))
    }
  }, [])

  const removeGroup = useCallback((groupKey: string) => {
    const keys = new Set(groupsRef.current.find((g) => g.key === groupKey)?.cards.map((c) => c.key) ?? [])
    queue.current = queue.current.filter((j) => !keys.has(j.cardKey))
    for (const key of keys) liveKeys.current.delete(key)
    setGroups((gs) => gs.filter((g) => g.key !== groupKey))
  }, [])

  return {
    groups,
    checking: checking > 0,
    searching,
    busy: checking > 0 || searching,
    pause,
    halt,
    notice,
    run,
    searchAgain,
    addCode,
    retryStopped,
    carryOnNow,
    stop,
    toggle,
    setTicks,
    placeCards,
    holdCards,
    restore,
    removeGroup,
  }
}

export type Lookup = ReturnType<typeof useLookup>
