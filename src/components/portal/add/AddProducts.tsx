'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Disclosure, Note, Textarea } from '@/components/system'
import { RosterImport } from '@/components/portal/RosterImport'
import { SupplierIndexBuilder } from '@/components/portal/SupplierIndexBuilder'
import { SUPPLIER_SETTINGS_HREF } from '@/lib/portal/product-links'
import { AddChoices } from './AddChoices'
import { CodeCardView, type CardActions } from './CodeCardView'
import { CsvPicker } from './CsvPicker'
import { FeedExport } from './FeedExport'
import { SampleSkus } from './SampleSkus'
import { StatusStrip, type IndexStatus, type SupplierStatus } from './StatusStrip'
import { MAX_CODES, isAddable, plural, splitCodes, type LookupGroup } from './lookup'
import { useLookup, type Lookup } from './useLookup'
import { Lede, Row, SectionTitle, Stack, TextLink, bodyText, metaText } from './ui'

/** Scroll a section into view once the render that opened it has landed. */
function bringIntoView(el: HTMLElement | null) {
  if (!el) return
  setTimeout(() => el.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0)
}

/**
 * Add products — the guided way in from PowerBody.
 *
 * ── What this replaced ─────────────────────────────────────────────────────
 * The PowerBody tab: seven panels on one scroll, three of them repairs for
 * products already in the shop, and two separate boxes for SKUs and product
 * ids whose failures read "PowerBody timed out" or "Not in the feed" with
 * nowhere to go next. The repairs moved to Fix-ups. What is left is one job,
 * top to bottom:
 *
 *   1. what is answering, and whether the index is built (the two standing
 *      conditions behind most of the old errors)
 *   2. one box for any codes — each gets its own card and its own next step
 *   3. what to do with the ones found: separate, one with flavours, or new
 *      flavours of something already here
 *   4. PowerBody's own spreadsheet, for choosing when you have no codes
 *   5. your roster spreadsheet, for bringing a decided range in at once
 *   6. the index itself, tucked away once it is built
 *
 * Nothing added here is on sale. Everything lands in Review.
 */
export function AddProducts() {
  const [supplier, setSupplier] = useState<SupplierStatus | null>(null)
  const [index, setIndex] = useState<IndexStatus | null>(null)
  const [indexError, setIndexError] = useState(false)
  const [indexOpen, setIndexOpen] = useState(false)
  const [showSkus, setShowSkus] = useState(false)
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [handover, setHandover] = useState<{ text: string; fileName: string; nonce: number } | null>(null)

  const boxRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const csvRef = useRef<HTMLDivElement>(null)
  const rosterRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef<HTMLDivElement>(null)

  const lookup = useLookup({
    onSupplier: (seen) =>
      setSupplier((prev) => ({
        ...(prev ?? {}),
        ...(seen.source ? { effective: seen.source } : {}),
        ...(seen.demo ? { demo: true } : {}),
      })),
    onIndex: (i) => {
      if (i) setIndex({ products: i.products, complete: i.complete, updatedAt: i.updatedAt })
    },
  })

  // Which supplier answers, before the first lookup has to find out the hard way.
  useEffect(() => {
    let active = true
    fetch('/api/portal/supplier-source', { cache: 'no-store' })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}))
        if (!active) return
        if (!res.ok) {
          setSupplier((prev) => prev ?? { unknown: true })
          return
        }
        setSupplier((prev) => ({ mode: d.mode, effective: d.effective, hasCredentials: d.hasCredentials, ...(prev?.demo ? { demo: true } : {}) }))
      })
      .catch(() => active && setSupplier((prev) => prev ?? { unknown: true }))
    return () => {
      active = false
    }
  }, [])

  // The stored index. The index section starts open only when there is none.
  useEffect(() => {
    let active = true
    fetch('/api/portal/supplier/index', { cache: 'no-store' })
      .then(async (res) => {
        if (!active) return
        if (!res.ok) {
          setIndexError(true)
          return
        }
        const d = await res.json()
        setIndex({ products: Number(d.products ?? 0), complete: Boolean(d.complete), updatedAt: d.updatedAt ?? null })
        if (!d.products) setIndexOpen(true)
      })
      .catch(() => active && setIndexError(true))
    return () => {
      active = false
    }
  }, [])

  const openIndex = useCallback(() => {
    setIndexOpen(true)
    bringIntoView(indexRef.current)
  }, [])

  const lookUpBox = () => {
    const codes = splitCodes(input)
    if (codes.length === 0) {
      setInputError('Paste at least one SKU or PowerBody product id.')
      return
    }
    if (codes.length > MAX_CODES) {
      setInputError(`That is ${codes.length} codes — look up ${MAX_CODES} or fewer at a time.`)
      return
    }
    setInputError(null)
    void lookup.run([{ title: null, source: 'box', codes }])
  }

  const typed = splitCodes(input).length

  const actions: CardActions = {
    searchAgain: lookup.searchAgain,
    addCode: lookup.addCode,
    toggle: lookup.toggle,
    restore: lookup.restore,
    openIndex,
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
          Add products
        </h2>
        <p style={{ ...metaText, marginTop: 'var(--space-1)', maxWidth: '68ch' }}>
          Bring products in from PowerBody. Type their codes, or pick them from PowerBody’s spreadsheet — each one is
          looked up and shown in full, with what it costs us and what we would charge, before anything is added.
          Everything added waits in Review: nothing goes on sale until you approve it.
        </p>
      </div>

      {/* 1 ── What every lookup depends on. */}
      <StatusStrip
        supplier={supplier}
        index={index}
        indexError={indexError}
        onOpenIndex={openIndex}
        onShowSkus={() => {
          setShowSkus((v) => !v)
          bringIntoView(boxRef.current)
        }}
        showingSkus={showSkus}
      />

      {/* 2 ── One box for any codes. */}
      <div ref={boxRef}>
        <Card padding="normal" as="section">
          <Stack gap="var(--space-3)">
            <div>
              <SectionTitle>Add by SKU or product id</SectionTitle>
              <Lede>
                Paste SKUs, PowerBody product ids, or both — one per line, or separated by commas or spaces. Codes we
                already know are answered straight away; the rest are searched for one at a time, each on its own card.
              </Lede>
            </div>
            <Textarea
              label="SKUs or product ids"
              hideLabel
              rows={3}
              value={input}
              error={inputError ?? undefined}
              placeholder={'e.g. P44338, P28352\nor 44338'}
              onChange={(e) => {
                setInput(e.target.value)
                if (inputError) setInputError(null)
              }}
              onKeyDown={(e) => {
                // Enter looks up; Shift+Enter keeps a multi-line paste editable.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  lookUpBox()
                }
              }}
            />
            <Row>
              <Button variant="primary" loading={lookup.checking} disabled={typed === 0} onClick={lookUpBox}>
                Look up
              </Button>
              <span style={metaText}>
                {typed === 0 ? 'Enter looks up; Shift+Enter starts a new line.' : `${plural(typed, 'code')} ready to look up.`}
              </span>
            </Row>

            {showSkus && (
              <SampleSkus
                onPick={(sku) => setInput((v) => (v.trim() ? `${v.trim()}, ${sku}` : sku))}
                onPutAll={(skus) => setInput(skus.join(', '))}
              />
            )}
          </Stack>
        </Card>
      </div>

      <div ref={resultsRef} className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
        <RunStatus lookup={lookup} />
        {lookup.groups.map((group) => (
          <GroupView key={group.key} group={group} lookup={lookup} actions={actions} />
        ))}
      </div>

      {/* 4 ── Choosing without codes. */}
      <div ref={csvRef}>
        <CsvPicker
          incoming={handover}
          busy={lookup.checking}
          onLookUp={(batches) => {
            void lookup.run(batches)
            bringIntoView(resultsRef.current)
          }}
          onRoster={() => bringIntoView(rosterRef.current)}
        />
      </div>

      {/* 5 ── A decided range, at once. */}
      <div ref={rosterRef}>
        <RosterImport
          onPowerBodyCsv={(text, fileName) => {
            setHandover({ text, fileName, nonce: Date.now() })
            bringIntoView(csvRef.current)
          }}
          onFindIds={(skus) => {
            void lookup.run([{ title: 'Roster SKUs without a PowerBody id', source: 'roster', codes: skus.slice(0, MAX_CODES) }])
            bringIntoView(resultsRef.current)
          }}
        />
      </div>

      {/* 6 ── The index: open while there is none, tucked away once built. */}
      <div ref={indexRef}>
        <Card padding="normal" as="section">
          <Disclosure
            open={indexOpen}
            onOpenChange={setIndexOpen}
            summary={
              <span className="inline-flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
                PowerBody index — makes every lookup instant
                {index && index.products === 0 && <Badge tone="attention">Not built</Badge>}
              </span>
            }
          >
            <Stack gap="var(--space-4)">
              <p style={bodyText}>
                Reads PowerBody’s whole product list once and keeps every product’s id, so every lookup is instant
                instead of a search. Build it once; refresh it weekly so new products are in it.
              </p>
              <SupplierIndexBuilder
                onChange={(s) => setIndex({ products: s.products, complete: s.complete, updatedAt: s.updatedAt })}
              />
              <Stack gap="var(--space-2)">
                <p style={metaText}>
                  The same list as a spreadsheet — every SKU with its product id, cost and stock — for checking a long
                  list of codes against in one go.
                </p>
                <FeedExport />
              </Stack>
            </Stack>
          </Disclosure>
        </Card>
      </div>
    </div>
  )
}

/** Ticks once a second while something is counting down. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

/**
 * The batch as a whole: paused for PowerBody's rate limit, stopped by a refusal
 * that would have refused every code after it, or simply working.
 */
function RunStatus({ lookup }: { lookup: Lookup }) {
  const now = useNow(Boolean(lookup.pause))
  const waiting = lookup.groups.flatMap((g) => g.cards).filter((c) => c.status === 'queued' || c.status === 'searching').length
  const stranded = lookup.groups.flatMap((g) => g.cards).filter((c) => c.status === 'stopped').length

  return (
    <>
      {lookup.notice && <Note tone="info">{lookup.notice}</Note>}

      {lookup.pause ? (
        <Note tone="attention" icon="pause">
          <span className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            <span>
              PowerBody asked us to slow down, so the lookup is paused. Carrying on in{' '}
              {Math.max(0, Math.ceil((lookup.pause.until - now) / 1000))}s
              {lookup.pause.attempt > 1 ? ` (pause ${lookup.pause.attempt} — each one twice as long)` : ''}. Nothing is lost.
            </span>
            <span style={metaText}>{lookup.pause.message}</span>
            <span className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
              <Button size="sm" variant="secondary" onClick={lookup.carryOnNow}>
                Carry on now
              </Button>
              <Button size="sm" variant="ghost" onClick={lookup.stop}>
                Stop
              </Button>
            </span>
          </span>
        </Note>
      ) : lookup.searching && waiting > 0 ? (
        <Row>
          <span role="status" style={bodyText}>
            Searching PowerBody — {plural(waiting, 'code')} still to go, one at a time.
          </span>
          <Button size="sm" variant="ghost" onClick={lookup.stop}>
            Stop
          </Button>
        </Row>
      ) : null}

      {lookup.halt && (
        <Note tone="critical" live="assertive">
          <span className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            <span>
              {lookup.halt.kind === 'sandbox'
                ? 'Stopped: this PowerBody API account is still their DEMO sandbox, which cannot look products up — so every code after this one would have been refused the same way. Only PowerBody can switch it to live: ask your account manager.'
                : lookup.halt.kind === 'credentials'
                  ? 'Stopped: PowerBody did not accept our login, so every code after this one would have been refused the same way.'
                  : 'Stopped before the rest were looked up.'}
            </span>
            <span style={metaText}>{lookup.halt.message}</span>
            <span className="flex flex-wrap items-center" style={{ gap: 'var(--space-3)' }}>
              {lookup.halt.kind === 'credentials' ? (
                <TextLink href={SUPPLIER_SETTINGS_HREF}>Check the login in Settings → Supplier</TextLink>
              ) : (
                <TextLink href={SUPPLIER_SETTINGS_HREF}>Run the checks</TextLink>
              )}
              {stranded > 0 && (
                <Button size="sm" variant="secondary" onClick={lookup.retryStopped}>
                  Try the rest again ({stranded})
                </Button>
              )}
            </span>
          </span>
        </Note>
      )}

      {!lookup.halt && !lookup.busy && stranded > 0 && (
        <Row>
          <span style={metaText}>{plural(stranded, 'code')} not looked up.</span>
          <Button size="sm" variant="secondary" onClick={lookup.retryStopped}>
            Look {stranded === 1 ? 'it' : 'them'} up
          </Button>
        </Row>
      )}
    </>
  )
}

/** One lookup's cards, with the choices for the ones ticked. */
function GroupView({ group, lookup, actions }: { group: LookupGroup; lookup: Lookup; actions: CardActions }) {
  const addable = group.cards.filter(isAddable)
  const allTicked = addable.length > 0 && addable.every((c) => c.ticked)
  const running = group.cards.some((c) => c.status === 'checking' || c.status === 'queued' || c.status === 'searching')
  const found = group.cards.filter((c) => c.status === 'found' || c.status === 'held').length

  return (
    <section aria-label={group.title ?? 'Looked-up codes'} className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
      <Row>
        <SectionTitle>
          {group.title ?? (group.source === 'roster' ? 'Roster SKUs without a PowerBody id' : 'Your codes')}
        </SectionTitle>
        {group.brand && <span style={metaText}>{group.brand}</span>}
        <span style={metaText}>
          {found} of {group.cards.length} found{running ? ' so far' : ''}
        </span>
        {addable.length > 1 && (
          <Button size="sm" variant="ghost" onClick={() => lookup.setTicks(group.key, !allTicked)}>
            {allTicked ? 'Untick all' : 'Tick all'}
          </Button>
        )}
        {!running && (
          <Button size="sm" variant="ghost" onClick={() => lookup.removeGroup(group.key)}>
            Clear from the list
          </Button>
        )}
      </Row>
      <ul className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
        {group.cards.map((card) => (
          <CodeCardView key={card.key} card={card} groupKey={group.key} actions={actions} />
        ))}
      </ul>
      <AddChoices group={group} lookup={lookup} />
    </section>
  )
}
