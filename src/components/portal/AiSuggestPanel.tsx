'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, Note } from '@/components/system'
import { invalidateCatalogue } from '@/hooks/useCatalogueProducts'
import { liveProducts, ProductLink, useProductIndex } from '@/components/portal/fixups/product-index'
import { FIELD_ORDER, FIELD_TITLES, needsTags, offersFor, setFor, type Offer } from '@/components/portal/fixups/suggest-model'
import type { FixupPanelProps } from '@/components/portal/fixups/types'

/**
 * Products per suggestion request. The classifier is one model call per
 * product with its own timeout, and a request has a ceiling of its own — five
 * finish comfortably inside it, and the screen shows progress between them.
 */
const BATCH = 5

interface Asked {
  id: string
  title: string
  offers: Offer[]
}

type Applied = { status: 'saving' } | { status: 'done'; fields: number } | { status: 'failed'; error: string }

const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const
const EYEBROW = {
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
} as const

/**
 * Suggest tags — fill in what the quiz needs, for products on sale that nobody
 * has tagged.
 *
 * A product with no stack slot, no goal or no swap group is one the quiz can
 * barely recommend, and typing all three for a hundred imported products is how
 * a catalogue stops getting finished. This asks the classifier (the model when
 * a key is set, the keyword rules when not) for each, and offers ONLY the blank
 * fields, one chip per tag, for the founder to keep or drop before anything is
 * written. See `suggest-model` for the rules and why each exists.
 *
 * Nothing is asked until the founder presses the button: the suggestion is a
 * model call per product, and the old panel made all of them every time it was
 * opened. Products waiting for review are not included — Review's own "Fill the
 * blanks" does that and leaves each answer for a person to check.
 *
 * Applying goes through the product edit (`set`), the same validated write the
 * product page makes — never the old raw patch, which skipped every check.
 */
export function AiSuggestPanel({ onSummary, onRunningChange }: FixupPanelProps) {
  const index = useProductIndex()
  const candidates = useMemo(() => liveProducts(index).filter(needsTags), [index])

  const [asked, setAsked] = useState<Asked[]>([])
  /** Ids sent for a suggestion so far this visit — so a failure can carry on. */
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [usedModel, setUsedModel] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Products the classifier sent nothing back for — named, each a link, so they can be done by hand. */
  const [unanswered, setUnanswered] = useState<Array<{ id: string; title: string }>>([])
  /** Offer keys switched off, as `productId|offerKey` (or switched ON, for offers that start off). */
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const [applied, setApplied] = useState<Record<string, Applied>>({})
  const [applyingAll, setApplyingAll] = useState(false)
  const stopRef = useRef(false)

  const running = progress !== null || applyingAll
  useEffect(() => onRunningChange?.(running), [running, onRunningChange])

  const toAsk = candidates.filter((p) => !askedIds.has(p.id))

  useEffect(() => {
    if (!onSummary) return
    if (index.status === 'loading') return onSummary({ count: null, line: 'Counting…' })
    if (index.status !== 'ready') return onSummary({ count: null, line: 'Could not read the products, so nothing is counted.' })
    const n = candidates.length
    onSummary({
      count: n,
      line:
        n === 0
          ? 'Every product on sale has a stack slot, a goal and a swap group.'
          : `${n} product${n === 1 ? '' : 's'} on sale ${n === 1 ? 'is' : 'are'} missing a stack slot, a goal or a swap group — the quiz can barely recommend ${n === 1 ? 'it' : 'them'}.`,
    })
  }, [index.status, candidates.length, onSummary])

  const isOn = (id: string, offer: Offer) => offer.defaultOn !== flipped.has(`${id}|${offer.key}`)
  const flip = (id: string, offer: Offer) =>
    setFlipped((prev) => {
      const next = new Set(prev)
      const key = `${id}|${offer.key}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  async function ask() {
    const targets = toAsk
    if (targets.length === 0) return
    stopRef.current = false
    setError(null)
    setUnanswered([])
    setProgress({ done: 0, total: targets.length })
    try {
      for (let i = 0; i < targets.length; i += BATCH) {
        if (stopRef.current) break
        const slice = targets.slice(i, i + BATCH)
        let res: Response
        try {
          res = await fetch('/api/portal/ai-classify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: slice.map((p) => p.id), apply: false }),
          })
        } catch {
          setError('Could not reach the server — check the connection, then ask again. Nothing was changed.')
          return
        }
        const data = (await res.json().catch(() => null)) as
          | { results?: Array<{ id: string; title: string; suggestion: Record<string, unknown> }>; usedAI?: boolean; error?: string }
          | null
        if (res.status === 401) {
          setError('Your session has expired. Sign in again, then ask again — nothing was changed.')
          return
        }
        if (!res.ok || !data || !Array.isArray(data.results)) {
          // A reply that is not JSON is the platform stopping a slow request,
          // not the classifier answering — say which.
          setError(
            data?.error
              ? `The suggestion failed: ${data.error} Nothing was changed — ask again to carry on.`
              : `The suggestion did not come back (HTTP ${res.status}) — most likely the model took too long. ` +
                  `Nothing was changed. Ask again to carry on from ${slice[0].title}.`,
          )
          return
        }
        if (data.usedAI) setUsedModel(true)
        else setUsedModel((u) => u ?? false)
        const byId = new Map(slice.map((p) => [p.id, p]))
        const got = data.results
          .filter((r) => byId.has(r.id))
          .map((r) => ({ id: r.id, title: byId.get(r.id)!.title, offers: offersFor(byId.get(r.id)!, r.suggestion ?? {}) }))
        // A product the route did not answer for is reported, not passed over.
        const missing = slice.filter((p) => !data.results!.some((r) => r.id === p.id))
        setAsked((prev) => [...prev, ...got])
        setAskedIds((prev) => new Set([...prev, ...slice.map((p) => p.id)]))
        if (missing.length > 0) setUnanswered((prev) => [...prev, ...missing.map((p) => ({ id: p.id, title: p.title }))])
        setProgress({ done: Math.min(i + BATCH, targets.length), total: targets.length })
      }
    } finally {
      setProgress(null)
    }
  }

  async function apply(item: Asked): Promise<boolean> {
    const set = setFor(item.offers, (o) => isOn(item.id, o))
    const fields = Object.keys(set).length
    if (fields === 0) return true
    setApplied((a) => ({ ...a, [item.id]: { status: 'saving' } }))
    try {
      const res = await fetch('/api/portal/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, set }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; problems?: string[] } | null
      if (!res.ok) {
        const why = data?.problems?.length ? data.problems.join(' ') : data?.error ?? `The server answered ${res.status}.`
        setApplied((a) => ({ ...a, [item.id]: { status: 'failed', error: `Not saved — ${why}` } }))
        return false
      }
      setApplied((a) => ({ ...a, [item.id]: { status: 'done', fields } }))
      return true
    } catch {
      setApplied((a) => ({ ...a, [item.id]: { status: 'failed', error: 'Not saved — could not reach the server.' } }))
      return false
    }
  }

  async function applyOne(item: Asked) {
    if (await apply(item)) {
      invalidateCatalogue()
      index.reload()
    }
  }

  async function applyAll() {
    setApplyingAll(true)
    let any = false
    try {
      // One at a time: each is its own write, and a failure on one is shown on
      // it without stopping the rest.
      for (const item of asked) {
        if (applied[item.id]?.status === 'done') continue
        if (item.offers.every((o) => !isOn(item.id, o))) continue
        if (await apply(item)) any = true
      }
    } finally {
      setApplyingAll(false)
    }
    if (any) {
      invalidateCatalogue()
      index.reload()
    }
  }

  const waiting = asked.filter((a) => applied[a.id]?.status !== 'done' && a.offers.some((o) => isOn(a.id, o)))

  if (index.status === 'signed-out') {
    return <Note tone="attention" icon="lock">Your session has expired — sign in again to see which products need tags.</Note>
  }
  if (index.status === 'failed') {
    return (
      <Note tone="critical">
        The products could not be read ({index.message}), so there is nothing to suggest for yet.{' '}
        <Button size="sm" variant="ghost" icon="refresh" onClick={index.reload}>
          Try again
        </Button>
      </Note>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
        {progress ? (
          <Button size="sm" variant="secondary" icon="pause" onClick={() => (stopRef.current = true)}>
            Stop after this batch
          </Button>
        ) : toAsk.length > 0 ? (
          <Button size="sm" variant="primary" icon="sparkle" disabled={applyingAll || index.status !== 'ready'} onClick={() => void ask()}>
            {asked.length > 0 ? `Carry on — suggest for ${toAsk.length} more` : `Suggest tags for ${toAsk.length}`}
          </Button>
        ) : index.status === 'ready' && candidates.length === 0 && asked.length === 0 ? (
          <p style={META}>Every product on sale is tagged. A product is changed by hand on its own page, in Quiz &amp; subscription.</p>
        ) : null}
        {waiting.length > 0 && (
          <Button size="sm" variant="secondary" loading={applyingAll} disabled={progress !== null} onClick={() => void applyAll()}>
            Apply what is ticked, for all {waiting.length}
          </Button>
        )}
      </div>

      {asked.length === 0 && !progress && candidates.length > 0 && (
        <Note tone="info">
          Nothing is written until you apply it. Each product is offered only what it is missing, one chip per tag — tap a
          chip to drop that one tag. Dietary tags start unticked: a wrong one sells somebody something they cannot take,
          so tick only those the label confirms. It never sets a cost or a serving count; those come from PowerBody.
        </Note>
      )}

      {progress && (
        <p style={{ ...META, color: 'var(--ink-2)' }} role="status">
          Asking about {progress.done} of {progress.total}… Each one is a model call, so this takes a moment.
        </p>
      )}

      {usedModel === false && asked.length > 0 && (
        <p style={META}>
          No OpenAI key is set, so these come from the built-in keyword rules — blunter than the model, but never invented.
        </p>
      )}

      {error && (
        <Note tone="critical" live="assertive">
          {error}
        </Note>
      )}

      {unanswered.length > 0 && (
        <Note tone="attention">
          No suggestion came back for{' '}
          {unanswered.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <ProductLink id={p.id} section="quiz">
                {p.title}
              </ProductLink>
            </span>
          ))}{' '}
          — {unanswered.length === 1 ? 'it may have' : 'they may have'} been changed or removed since this page loaded. Open{' '}
          {unanswered.length === 1 ? 'it' : 'each'} to tag {unanswered.length === 1 ? 'it' : 'them'} by hand.
        </Note>
      )}

      {asked.length > 0 && (
        <ul style={{ display: 'grid', gap: 'var(--space-2)' }} aria-label="Suggestions">
          {asked.map((item) => (
            <SuggestionCard
              key={item.id}
              item={item}
              applied={applied[item.id]}
              isOn={(o) => isOn(item.id, o)}
              onFlip={(o) => flip(item.id, o)}
              onApply={() => void applyOne(item)}
              disabled={applyingAll}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function SuggestionCard({
  item,
  applied,
  isOn,
  onFlip,
  onApply,
  disabled,
}: {
  item: Asked
  applied: Applied | undefined
  isOn: (offer: Offer) => boolean
  onFlip: (offer: Offer) => void
  onApply: () => void
  disabled: boolean
}) {
  const done = applied?.status === 'done'
  const ticked = item.offers.filter(isOn).length
  const fields = FIELD_ORDER.filter((f) => item.offers.some((o) => o.field === f))

  return (
    <Card as="li" solid padding="tight">
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-2)' }}>
        <ProductLink id={item.id} section="quiz">
          {item.title}
        </ProductLink>
        {done && (
          <Badge tone="positive" icon="check">
            Applied
          </Badge>
        )}
      </div>

      {item.offers.length === 0 ? (
        <p style={{ ...META, marginTop: 'var(--space-2)' }}>
          Nothing it could add: its answers were for fields this product already has, “general”, or tags we do not use.
          Open it to set the rest by hand, in Quiz &amp; subscription.
        </p>
      ) : (
        !done && (
          <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            {fields.map((field) => (
              <div key={field}>
                <p style={EYEBROW}>{FIELD_TITLES[field]}</p>
                <div className="flex flex-wrap" style={{ gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
                  {item.offers
                    .filter((o) => o.field === field)
                    .map((offer) => {
                      const on = isOn(offer)
                      return (
                        // `aria-pressed`: whether this one tag will be applied is
                        // state a screen reader can hear, not a colour.
                        <Button
                          key={offer.key}
                          size="sm"
                          variant={on ? 'primary' : 'ghost'}
                          icon={on ? 'check' : 'plus'}
                          aria-pressed={on}
                          disabled={disabled || applied?.status === 'saving'}
                          onClick={() => onFlip(offer)}
                        >
                          {offer.label}
                        </Button>
                      )
                    })}
                </div>
              </div>
            ))}
            <div>
              <Button
                size="sm"
                variant="secondary"
                loading={applied?.status === 'saving'}
                disabled={ticked === 0 || disabled}
                onClick={onApply}
              >
                {ticked === 0 ? 'Nothing ticked' : `Apply ${ticked} to this product`}
              </Button>
            </div>
          </div>
        )
      )}

      {done && applied?.status === 'done' && (
        <p style={{ ...META, marginTop: 'var(--space-1)' }}>Saved. Open it to check how the quiz now sees it.</p>
      )}
      {applied?.status === 'failed' && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Note tone="critical" live="assertive">
            {applied.error} The suggestions are still here — change what is ticked and apply again.
          </Note>
        </div>
      )}
    </Card>
  )
}
