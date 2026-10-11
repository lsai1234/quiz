'use client'

import { useState } from 'react'
import { Badge, Button, Card, Checkbox, Disclosure, Input, Note } from '@/components/system'
import { ProductStateBadge } from '@/components/portal/product/ProductStateBadge'
import { SUPPLIER_SETTINGS_HREF, productHref } from '@/lib/portal/product-links'
import { isProductId, money, plural, type Ask, type CodeCard } from './lookup'
import { Row, Stack, TextLink, bodyText, metaText } from './ui'

export interface CardActions {
  searchAgain: (cardKey: string, ask?: Ask) => void
  addCode: (groupKey: string, code: string) => void
  toggle: (cardKey: string, ticked: boolean) => void
  restore: (productId: string) => Promise<void>
  openIndex: () => void
}

type BadgeTone = 'neutral' | 'accent' | 'positive' | 'attention' | 'critical' | 'info'

/** The status as a word or two, for scanning a long list. */
function statusBadge(card: CodeCard): { tone: BadgeTone; text: string } | null {
  if (card.placed) return { tone: 'accent', text: 'Added' }
  switch (card.status) {
    case 'checking':
      return { tone: 'neutral', text: 'Checking' }
    case 'queued':
      return { tone: 'neutral', text: 'Waiting' }
    case 'searching':
      return { tone: 'info', text: 'Searching' }
    case 'found':
      return card.stored ? null : { tone: 'positive', text: 'Found' }
    case 'held':
      return null
    case 'not-yet':
      return { tone: 'attention', text: 'Not found yet' }
    case 'not-on-account':
      return { tone: 'attention', text: 'Not on the account' }
    case 'refused':
      return { tone: 'critical', text: 'PowerBody refused' }
    case 'wrong-product':
      return { tone: 'attention', text: 'A different product' }
    case 'unusable':
      return { tone: 'attention', text: 'Cannot be searched' }
    case 'stopped':
      return { tone: 'neutral', text: 'Not looked up' }
  }
}

/**
 * One code, and what became of it.
 *
 * Every state ends in something to press. That is the whole brief for this
 * component: the old screen's "Not in the feed: P1234" and "PowerBody timed
 * out" were true, and left the founder with nowhere to go. Here a code that is
 * not found yet can be searched again or given its product id; one that is not
 * on the account can be corrected, searched for anyway, or checked against a
 * refreshed list; a refusal says whose problem it is and links to the fix.
 */
export function CodeCardView({ card, groupKey, actions }: { card: CodeCard; groupKey: string; actions: CardActions }) {
  const row = card.row
  const badge = statusBadge(card)
  const addable = card.status === 'found' && row && !card.stored && !card.placed
  const busy = card.status === 'checking' || card.status === 'queued' || card.status === 'searching'

  return (
    <Card as="li" solid padding="tight">
      <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
        {addable && (
          <Checkbox
            label={`Add ${row.name || row.sku}`}
            hideLabel
            checked={card.ticked}
            onChange={(e) => actions.toggle(card.key, e.target.checked)}
          />
        )}
        {row && <Picture src={row.imageUrl} />}

        <Stack gap="var(--space-2)" className="min-w-0 flex-1">
          <Row>
            <span style={{ ...bodyText, color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)' }}>
              {row ? row.name || row.sku : card.code}
            </span>
            {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
            {!card.placed && card.stored && <ProductStateBadge state={card.stored.state} />}
          </Row>

          {row ? <Facts card={card} /> : null}

          {/* What happened, in the server's words. Not repeated for a plain
              "Found X" — the card already shows X. */}
          {card.status !== 'found' && card.status !== 'held' && (
            <p style={metaText} aria-live="polite">
              {card.message}
            </p>
          )}

          {card.status === 'searching' && card.steps.length > 0 && <LiveSteps steps={card.steps} />}

          <WhereItIs card={card} actions={actions} />

          {card.note && (
            <Note tone={card.note.tone === 'positive' ? 'positive' : card.note.tone === 'attention' ? 'attention' : 'critical'} live="polite">
              {card.note.text}{' '}
              {card.note.href && <TextLink href={card.note.href}>{card.note.hrefLabel ?? 'Open it'}</TextLink>}
            </Note>
          )}

          {card.alsoMeant && (
            <Row>
              <span style={metaText}>An id and a SKU both match {card.code}.</span>
              <Button size="sm" variant="secondary" onClick={() => actions.addCode(groupKey, card.alsoMeant!.code)}>
                Did you mean SKU {card.alsoMeant.code}?
              </Button>
            </Row>
          )}

          {!busy && <NextSteps card={card} actions={actions} />}

          {!busy && !row && card.steps.length > 0 && (
            <Disclosure summary={`What it tried (${plural(card.steps.length, 'step')})`}>
              <ol style={{ ...metaText, paddingLeft: 'var(--space-5)', listStyle: 'decimal' }}>
                {card.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </Disclosure>
          )}
        </Stack>
      </div>
    </Card>
  )
}

/**
 * The supplier's own photograph, contained rather than cropped: this is the
 * screen a founder checks it on, and cropping hides what they came to look at.
 */
function Picture({ src }: { src: string | null }) {
  const box = {
    width: 'calc(var(--space-8) * 2)',
    height: 'calc(var(--space-8) * 2)',
    borderRadius: 'var(--radius-row)',
    background: 'var(--surface-2)',
  }
  if (!src) {
    return (
      <div className="shrink-0 grid place-items-center" style={{ ...box, fontSize: 'var(--text-micro)', color: 'var(--ink-3)' }}>
        No picture
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="shrink-0" style={{ ...box, objectFit: 'contain' }} />
}

/** What it is, what it costs us, and what it would make. */
function Facts({ card }: { card: CodeCard }) {
  const r = card.row!
  return (
    <Stack gap="var(--space-1)">
      {(r.brand || r.category) && <span style={metaText}>{[r.brand, r.category].filter(Boolean).join(' · ')}</span>}
      <span style={metaText}>
        SKU {r.sku}
        {/* The code that always works: looking it up again by id needs no search. */}
        {r.productId && <> · PowerBody id {r.productId}</>}
        {' · '}
        <span style={{ color: r.inStock ? 'var(--ink-2)' : 'var(--tone-critical)' }}>
          {r.inStock ? `${r.stock} in stock` : 'Out of stock at PowerBody'}
        </span>
      </span>
      <span style={metaText}>
        PowerBody charge us {money(r.wholesalePrice)} → our price {money(r.sellPrice)}
        {r.rrp !== null && <> · RRP {money(r.rrp)}</>}
        {' · '}
        <span style={{ fontWeight: 'var(--weight-strong)', color: r.marginPct > 0 ? 'var(--tone-positive)' : 'var(--tone-critical)' }}>
          {r.marginEstimated ? '≈' : ''}
          {r.marginPct}% margin
        </span>
        {r.marginEstimated && <> (no weight from PowerBody, so delivery is estimated)</>}
      </span>
      {!r.detailed && (
        <span style={{ ...metaText, color: 'var(--tone-attention)' }}>
          PowerBody did not send this one’s details, so the name and RRP are placeholders. Its page’s “Pull from
          PowerBody” fills them in after adding.
        </span>
      )}
    </Stack>
  )
}

/** The last few lines of a running search — enough to see it moving. */
function LiveSteps({ steps }: { steps: string[] }) {
  const recent = steps.slice(-3)
  return (
    <ul style={{ ...metaText, fontSize: 'var(--text-micro)', paddingLeft: 'var(--space-4)', listStyle: 'disc' }}>
      {recent.map((s, i) => (
        <li key={`${steps.length - recent.length + i}`}>{s}</li>
      ))}
    </ul>
  )
}

/** Already ours: a link to it, or Restore for a removed one. Or where this page just put it. */
function WhereItIs({ card, actions }: { card: CodeCard; actions: CardActions }) {
  const [restoring, setRestoring] = useState(false)
  const placed = card.placed
  if (placed) {
    if (placed.joined) {
      return (
        <p style={bodyText}>
          Added as a flavour of <TextLink href={productHref(placed.id, 'variants')}>{placed.title}</TextLink>
          {placed.live ? ' — on sale now, because that product is.' : ' — it goes on sale when that product is approved.'}
        </p>
      )
    }
    return (
      <p style={bodyText}>
        Added as <TextLink href={productHref(placed.id)}>{placed.title}</TextLink> — waiting for review.
      </p>
    )
  }
  const stored = card.stored
  if (!stored) return null
  if (stored.state === 'removed') {
    return (
      <Row>
        <span style={bodyText}>
          Removed — it was <TextLink href={productHref(stored.id)}>{stored.title}</TextLink>. Restore it rather than adding it again, and it comes back with everything it had.
        </span>
        <Button
          size="sm"
          variant="primary"
          loading={restoring}
          onClick={async () => {
            setRestoring(true)
            try {
              await actions.restore(stored.id)
            } finally {
              setRestoring(false)
            }
          }}
        >
          Restore
        </Button>
      </Row>
    )
  }
  return (
    <p style={bodyText}>
      Already in <TextLink href={productHref(stored.id)}>{stored.title} →</TextLink>
    </p>
  )
}

/** The buttons for whatever went wrong, driven by the server's `next`. */
function NextSteps({ card, actions }: { card: CodeCard; actions: CardActions }) {
  const [editing, setEditing] = useState(false)
  const next = new Set(card.next)
  const sku = card.sku ?? (isProductId(card.code) ? null : card.code)
  const again = (ask?: Ask) => actions.searchAgain(card.key, ask)

  switch (card.status) {
    case 'found':
    case 'held':
      return null

    case 'stopped':
      return (
        <Row>
          <Button size="sm" variant="secondary" icon="refresh" onClick={() => again()}>
            Look it up
          </Button>
        </Row>
      )

    case 'not-yet':
      return (
        <Stack gap="var(--space-2)">
          <Row>
            <Button size="sm" variant="secondary" icon="refresh" onClick={() => again(card.lastAsk ?? { code: card.code })}>
              Search again
            </Button>
          </Row>
          <PasteId sku={sku} onLookUp={(id) => again({ code: id, expectSku: sku })} />
        </Stack>
      )

    case 'not-on-account': {
      const sample = !next.has('search-anyway')
      return (
        <Stack gap="var(--space-2)">
          <Row>
            <Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)}>
              Check the code
            </Button>
            {!sample && (
              <>
                <Button size="sm" variant="ghost" onClick={actions.openIndex}>
                  Refresh the list
                </Button>
                <Button size="sm" variant="ghost" onClick={() => again({ code: card.code, searchAnyway: true })}>
                  Search anyway
                </Button>
              </>
            )}
            {sample && <TextLink href={SUPPLIER_SETTINGS_HREF}>Switch to Live in Settings → Supplier</TextLink>}
          </Row>
          {editing && (
            <EditCode
              code={card.code}
              onLookUp={(code) => {
                setEditing(false)
                again({ code })
              }}
            />
          )}
          {!sample && next.has('paste-id') && <PasteId sku={sku} onLookUp={(id) => again({ code: id, expectSku: sku })} />}
        </Stack>
      )
    }

    case 'wrong-product':
      return (
        <Stack gap="var(--space-2)">
          <PasteId sku={sku} onLookUp={(id) => again({ code: id, expectSku: sku })} />
          {sku && (
            <Row>
              <Button size="sm" variant="ghost" onClick={() => again({ code: sku })}>
                Search for {sku} instead
              </Button>
            </Row>
          )}
        </Stack>
      )

    case 'unusable':
      return (
        <Stack gap="var(--space-2)">
          <PasteId sku={sku} onLookUp={(id) => again({ code: id, expectSku: sku })} />
          <Row>
            <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
              Check the code
            </Button>
          </Row>
          {editing && (
            <EditCode
              code={card.code}
              onLookUp={(code) => {
                setEditing(false)
                again({ code })
              }}
            />
          )}
        </Stack>
      )

    case 'refused':
      return <Refused card={card} onAgain={() => again(card.lastAsk ?? { code: card.code })} />

    default:
      return null
  }
}

/** A refusal, by whose problem it is. */
function Refused({ card, onAgain }: { card: CodeCard; onAgain: () => void }) {
  switch (card.refusal) {
    case 'sandbox':
      return (
        <Stack gap="var(--space-2)">
          <p style={bodyText}>
            PowerBody start every new API account on a DEMO (sandbox) account, and that account cannot look products
            up. Only PowerBody can switch it to live — ask your account manager to move it to live API access. The
            checks show exactly what it is answering.
          </p>
          <Row>
            <TextLink href={SUPPLIER_SETTINGS_HREF}>Run the checks</TextLink>
          </Row>
        </Stack>
      )
    case 'credentials':
      return (
        <Row>
          <TextLink href={SUPPLIER_SETTINGS_HREF}>Check the PowerBody login in Settings → Supplier</TextLink>
        </Row>
      )
    case 'rate-limited':
      return (
        <Row>
          <Button size="sm" variant="secondary" icon="refresh" onClick={onAgain}>
            Search again
          </Button>
          <span style={metaText}>It passes on its own — give it a few minutes.</span>
        </Row>
      )
    default:
      return (
        <Row>
          <Button size="sm" variant="secondary" icon="refresh" onClick={onAgain}>
            Search again
          </Button>
          <TextLink href={SUPPLIER_SETTINGS_HREF}>Run the checks</TextLink>
        </Row>
      )
  }
}

/**
 * The way through when a SKU cannot be found: its product id, which PowerBody
 * answer for directly. Checked against the card's SKU, so a mistyped id cannot
 * put somebody else's product behind this code.
 */
function PasteId({ sku, onLookUp }: { sku: string | null; onLookUp: (id: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const id = value.trim()
    if (!/^\d{1,9}$/.test(id)) {
      setError('A product id is all digits — for example 44338.')
      return
    }
    setError(null)
    onLookUp(id)
  }
  return (
    <Row align="start">
      <Input
        compact
        label={sku ? `PowerBody product id for ${sku}` : 'PowerBody product id'}
        placeholder="Paste its product id"
        hint="It is on the product’s page on PowerBody’s site."
        inputMode="numeric"
        value={value}
        error={error ?? undefined}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        className="w-40"
      />
      <Button size="sm" variant="secondary" disabled={!value.trim()} onClick={submit}>
        Look up this id
      </Button>
    </Row>
  )
}

/** Correct a mistyped code and look it up again, without going back to the box. */
function EditCode({ code, onLookUp }: { code: string; onLookUp: (code: string) => void }) {
  const [value, setValue] = useState(code)
  const clean = value.trim().replace(/\s+/g, '').toUpperCase()
  return (
    <Row align="start">
      <Input
        compact
        label={`Corrected code for ${code}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && clean) {
            e.preventDefault()
            onLookUp(clean)
          }
        }}
        className="w-40"
      />
      <Button size="sm" variant="secondary" disabled={!clean} onClick={() => onLookUp(clean)}>
        Look it up
      </Button>
    </Row>
  )
}
