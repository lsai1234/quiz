'use client'

import { useId } from 'react'
import Link from 'next/link'
import { Badge, Card } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { ProductStateBadge } from '@/components/portal/product/ProductStateBadge'
import { productHref } from '@/lib/portal/product-links'
import {
  attentionChecks,
  attentionSummary,
  priceLabel,
  sectionFor,
  servingsLabel,
  skuCountLabel,
  stockLabel,
  subscriptionLabel,
  type ListEntry,
} from './model'

const META = { fontSize: 'var(--text-meta)', color: 'var(--ink-3)' } as const

const STOCK_INK = { ok: 'var(--ink-3)', some: 'var(--tone-attention)', none: 'var(--tone-critical)' } as const

/**
 * One product in the list.
 *
 * ── The row is a link, and the checks are links of their own ────────────────
 * The whole top of the card opens the product page — the one place every part
 * of a product is changed — so the tap target is the card, not the words in the
 * middle of it. In an attention view each failing check sits underneath as its
 * OWN link, straight to the section that fixes it ("Cost not known" opens the
 * Supplier section, not the top of the page). They are siblings rather than
 * nested because a link inside a link is invalid HTML, and browsers resolve it
 * by quietly moving one of them somewhere you did not put it.
 *
 * The row link is NAMED by the product's title alone (`aria-labelledby`), and
 * the price, stock and status are its description. A screen reader moving
 * through forty rows hears forty titles, not forty paragraphs.
 */
export function ProductRow({ entry, showChecks }: { entry: ListEntry; showChecks: boolean }) {
  const { product: p, state } = entry
  const titleId = useId()
  const detailId = useId()
  const checks = showChecks ? attentionChecks(entry.readiness) : []
  const summary = showChecks ? null : attentionSummary(entry)
  const stock = stockLabel(p)
  const servings = servingsLabel(p)
  const facts = [skuCountLabel(p), servings, subscriptionLabel(p)].filter(Boolean).join(' · ')
  const brandLine = [p.brand, p.category].filter(Boolean).join(' · ')

  return (
    // `solid`: a catalogue is long and this is a scrolling list, which is the
    // case translucency is not paid for. `interactive` only when the card IS
    // the link — with checks under it, part of the card is other links.
    <Card as="li" solid padding="none" interactive={checks.length === 0}>
      <Link
        href={productHref(p.id)}
        aria-labelledby={titleId}
        aria-describedby={detailId}
        className="flex items-start system-focus"
        style={{
          gap: 'var(--space-3)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-card)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <span
          className="shrink-0 overflow-hidden inline-flex items-center justify-center"
          style={{
            width: 'var(--control-lg)',
            height: 'var(--control-lg)',
            borderRadius: 'var(--radius-row)',
            background: 'var(--surface-2)',
            border: '1px solid var(--edge)',
          }}
        >
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="w-full h-full object-contain" loading="lazy" />
          ) : (
            <span style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', textAlign: 'center' }}>No picture</span>
          )}
        </span>

        <span className="min-w-0 flex-1 block">
          <span className="flex items-start justify-between" style={{ gap: 'var(--space-2)' }}>
            <span
              id={titleId}
              className="min-w-0"
              style={{
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-strong)',
                fontFamily: 'var(--font-display)',
                color: 'var(--ink-1)',
                lineHeight: 'var(--leading-snug)',
              }}
            >
              {p.title}
            </span>
            <ProductStateBadge state={state} />
          </span>

          <span id={detailId} className="block">
            {brandLine && (
              <span className="block truncate" style={{ ...META, marginTop: 'var(--space-1)' }}>
                {brandLine}
              </span>
            )}
            <span
              className="block"
              style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)', marginTop: 'var(--space-1)', fontVariantNumeric: 'tabular-nums' }}
            >
              {priceLabel(p)}
            </span>
            <span className="block" style={{ ...META, marginTop: 'var(--space-1)' }}>
              {facts}
              {facts && ' · '}
              <span style={{ color: STOCK_INK[stock.tone] }}>{stock.text}</span>
            </span>
            {summary && (
              <span
                className="flex items-center"
                style={{
                  gap: 'var(--space-1)',
                  marginTop: 'var(--space-1)',
                  fontSize: 'var(--text-meta)',
                  fontWeight: 'var(--weight-strong)',
                  color: summary.tone === 'fail' ? 'var(--tone-critical)' : 'var(--tone-attention)',
                }}
              >
                <Icon name="alert-triangle" size={12} className="shrink-0" />
                {summary.text}
              </span>
            )}
          </span>
        </span>
      </Link>

      {checks.length > 0 && (
        <ul
          aria-label={`What to fix on ${p.title}`}
          style={{
            borderTop: '1px solid var(--edge)',
            padding: 'var(--space-2) var(--space-3) var(--space-3)',
            display: 'grid',
            gap: 'var(--space-1)',
          }}
        >
          {checks.map((check) => (
            <li key={check.id}>
              <Link
                href={productHref(p.id, sectionFor(check.section))}
                className="flex items-start system-focus"
                style={{
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius-row)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Badge tone={check.status === 'fail' ? 'critical' : 'attention'} dot>
                  {check.status === 'fail' ? 'Blocking' : 'Warning'}
                </Badge>
                <span className="min-w-0 flex-1" style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)' }}>
                  <span style={{ color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)' }}>{check.label}</span>
                  {check.detail && <span style={{ color: 'var(--ink-3)' }}>{` — ${check.detail}`}</span>}
                </span>
                <span
                  className="shrink-0 inline-flex items-center"
                  style={{ fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-strong)', color: 'var(--accent)' }}
                >
                  Fix
                  <Icon name="chevron-right" size={12} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
