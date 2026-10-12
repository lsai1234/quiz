'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, Checkbox } from '@/components/system'
import { productHref } from '@/lib/portal/product-links'
import { fieldLabels, money, plural, supplierGaps, type QueueEntry } from './queue-model'

const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' } as const

/** How many import notes show before the rest fold away behind a button. */
const NOTES_SHOWN = 2

/**
 * One product waiting for review.
 *
 * ── What a row has to answer ────────────────────────────────────────────────
 * Not "what is this product" — the product page does that — but "what is left
 * to do on it, and is it something PowerBody can do for me". So beside the
 * title sit three facts a pull from PowerBody would change (a picture, a
 * description, the PowerBody ids), how many review fields are still unchecked,
 * and the import's own notes: a size split, a flavour still showing a code, a
 * lookup that failed. Those notes are written once, at import, and this queue is
 * the only screen that shows them — so they are shown in full, not summarised.
 *
 * The title opens the product in queue mode, where the product page itself
 * shows "3 of 12 · Skip · Back to the queue".
 */
export function QueueRow({
  entry,
  picked,
  onToggle,
  filling,
}: {
  entry: QueueEntry
  picked: boolean
  onToggle: () => void
  /** True while the bulk fill is working on this one. */
  filling: boolean
}) {
  const { product: p, remaining, complete } = entry
  const titleId = useId()
  const [allNotes, setAllNotes] = useState(false)
  const gaps = supplierGaps(p)
  const notes = p.review?.notes ?? []
  const shownNotes = allNotes ? notes : notes.slice(0, NOTES_SHOWN)
  const cost = money(p.cost)
  const price = money(p.basePrice)
  const facts = [
    [p.brand, p.category || 'No category'].filter(Boolean).join(' · '),
    cost && price ? `${cost} → ${price}` : price ? `${price} (cost not known)` : null,
    p.variants.length > 1 ? plural(p.variants.length, 'flavour or size', 'flavours or sizes') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    // `solid`: the queue is a long scrolling list.
    <Card as="li" solid padding="tight">
      <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
        <Checkbox
          label={`Select ${p.title}`}
          hideLabel
          className="shrink-0"
          checked={picked}
          onChange={onToggle}
        />
        <span
          className="shrink-0 overflow-hidden inline-flex items-center justify-center"
          style={{
            width: 'var(--control-lg)',
            height: 'var(--control-lg)',
            borderRadius: 'var(--radius-row)',
            background: 'var(--surface-2)',
            border: '1px solid var(--edge)',
            fontSize: 'var(--text-micro)',
            color: 'var(--ink-3)',
            textAlign: 'center',
          }}
        >
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            'No picture'
          )}
        </span>

        <div className="min-w-0 flex-1" style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <div className="flex items-start justify-between" style={{ gap: 'var(--space-2)' }}>
            <Link
              id={titleId}
              href={productHref(p.id, undefined, { queue: true })}
              className="system-focus min-w-0"
              style={{
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-strong)',
                fontFamily: 'var(--font-display)',
                color: 'var(--ink-1)',
                textDecoration: 'none',
              }}
            >
              {p.title}
            </Link>
            {filling ? (
              <Badge tone="info" className="shrink-0">
                Filling from PowerBody…
              </Badge>
            ) : (
              <Badge tone={complete ? 'positive' : 'attention'} className="shrink-0">
                {complete ? 'Ready to approve' : `${remaining.length} to check`}
              </Badge>
            )}
          </div>

          {facts && <p style={META}>{facts}</p>}

          {/* What a pull from PowerBody would fill. Words as well as tone, so
              "missing" is not carried by colour alone. */}
          <div className="flex flex-wrap" style={{ gap: 'var(--space-1)' }}>
            <Badge tone={gaps.hasPicture ? 'neutral' : 'attention'} icon={gaps.hasPicture ? 'check' : undefined}>
              {gaps.hasPicture ? 'Picture' : 'No picture'}
            </Badge>
            <Badge tone={gaps.hasDescription ? 'neutral' : 'attention'} icon={gaps.hasDescription ? 'check' : undefined}>
              {gaps.hasDescription ? 'Description' : 'No description'}
            </Badge>
            {gaps.skus === 0 ? (
              <Badge tone="critical">No PowerBody SKU</Badge>
            ) : gaps.withIds === gaps.skus ? (
              <Badge tone="neutral" icon="check">
                PowerBody {gaps.skus === 1 ? 'id' : 'ids'}
              </Badge>
            ) : (
              <Badge tone="attention">
                PowerBody ids: {gaps.withIds} of {gaps.skus}
              </Badge>
            )}
          </div>

          {!complete && remaining.length > 0 && (
            <p style={META}>Still to check: {fieldLabels(remaining).join(', ')}.</p>
          )}

          {notes.length > 0 && (
            <div aria-label={`Import notes for ${p.title}`}>
              <ul style={{ display: 'grid', gap: 'var(--space-1)', paddingLeft: 'var(--space-4)', listStyle: 'disc' }}>
                {shownNotes.map((note, i) => (
                  <li key={i} style={{ ...META, color: 'var(--ink-2)' }}>
                    {note}
                  </li>
                ))}
              </ul>
              {notes.length > NOTES_SHOWN && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={allNotes}
                  aria-describedby={titleId}
                  onClick={() => setAllNotes((v) => !v)}
                >
                  {allNotes ? 'Fewer notes' : `${notes.length - NOTES_SHOWN} more ${notes.length - NOTES_SHOWN === 1 ? 'note' : 'notes'}`}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
