'use client'

import { useState } from 'react'
import { Badge, Card, Modal, ModalBody, ModalHeader, buttonSurface } from '@/components/system'
import { HUB_COPY as C } from '@/lib/hub/copy'
import type { GuideProductLite, HubHome } from '@/lib/hub/home-types'
import { careTipsFor, faqsFor } from '@/lib/tips/pick'
import type { SwapGroup } from '@/lib/catalogue/types'
import { body, col, eyebrow, meta, SectionHead, strong } from './ui'

/**
 * Their stack: a row of their products, each with its moment on their day,
 * that opens into "more on this product": on your day, what's in a serving,
 * the approved science with its condition of use, the label's warnings,
 * storing and mixing, and common questions.
 */
export function StackSection({ guide }: { guide: NonNullable<HubHome['guide']> }) {
  const [open, setOpen] = useState<GuideProductLite | null>(null)
  const page = buttonSurface('ghost', 'sm')
  return (
    <section data-stack>
      <SectionHead
        eyebrowText={guide.stackName ?? undefined}
        title={C.guideTitle}
        action={
          <a href={`/stack-guide/${guide.token}`} className={page.className} style={page.style}>
            {C.guideOpen} →
          </a>
        }
      />
      <div className="hub-rail" role="list">
        {guide.products.map((p) => (
          <div key={p.id} role="listitem" style={{ width: 'calc(var(--space-8) * 5)' }}>
            <Card padding="normal" interactive>
              <a
                href={`#product-${p.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  setOpen(p)
                }}
                className="block w-full text-left"
                style={{ color: 'inherit' }}
                aria-label={p.title}
                data-stack-product={p.id}
              >
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    height: 'calc(var(--space-8) * 3)',
                    borderRadius: 'var(--radius-row)',
                    background: 'radial-gradient(120% 90% at 30% 20%, var(--accent-fill), var(--surface-2) 70%)',
                    border: '1px solid var(--edge)',
                    marginBottom: 'var(--space-3)',
                    overflow: 'hidden',
                  }}
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span className="hub-figure" style={{ fontSize: 'var(--text-hero)', color: 'var(--accent)', opacity: 0.9 }} aria-hidden>
                      {p.short.charAt(0)}
                    </span>
                  )}
                </div>
                <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>{p.short}</p>
                <p style={meta}>{[p.time, p.moment].filter(Boolean).join(' · ')}</p>
                <p style={{ ...meta, color: 'var(--accent)', marginTop: 'var(--space-2)', fontWeight: 'var(--weight-strong)' }}>{C.productMore} →</p>
              </a>
            </Card>
          </div>
        ))}
      </div>
      {open && <ProductSheet product={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

function ProductSheet({ product: p, onClose }: { product: GuideProductLite; onClose: () => void }) {
  const care = careTipsFor(p.kind as SwapGroup | null)
  const faqs = faqsFor(p.kind as SwapGroup | null)
  return (
    <Modal onClose={onClose} presentation="sheet" size="md" label={p.title}>
      <ModalHeader eyebrow={p.type} title={p.short} subtitle={[p.time, p.moment, p.daysLabel].filter(Boolean).join(' · ')} />
      <ModalBody>
        <div style={col('var(--space-5)')} data-product-sheet={p.id}>
          <section>
            <h3 style={eyebrow}>{C.productOn}</h3>
            <p style={{ ...strong, marginTop: 'var(--space-2)' }}>{[p.time, p.moment].filter(Boolean).join(', ')}</p>
            <p style={body}>{[p.daysLabel, p.amount].filter(Boolean).join(' · ')}</p>
          </section>
          {p.serving && (
            <section>
              <h3 style={eyebrow}>{C.productServing}</h3>
              <p style={{ ...body, marginTop: 'var(--space-2)' }}>{p.serving}</p>
            </section>
          )}
          {p.claims.length > 0 && (
            <section>
              <h3 style={eyebrow}>{C.productScience}</h3>
              <ul style={{ ...col('var(--space-2)'), marginTop: 'var(--space-2)' }}>
                {p.claims.map((c) => (
                  <li key={c.text}>
                    <Card padding="tight" tone="accent">
                      <p style={{ ...body, color: 'var(--ink-1)' }}>“{c.text}”</p>
                      {c.condition && <p style={meta}>{c.condition}</p>}
                    </Card>
                  </li>
                ))}
              </ul>
              <p style={{ ...meta, marginTop: 'var(--space-2)' }}>{C.productScienceNote}</p>
            </section>
          )}
          {care.length > 0 && (
            <section>
              <h3 style={eyebrow}>{C.productCare}</h3>
              <ul style={{ ...col('var(--space-3)'), marginTop: 'var(--space-2)' }}>
                {care.map((t) => (
                  <li key={t.id}>
                    <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>{t.title}</p>
                    <p style={body}>{t.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 style={eyebrow}>{C.productQuestions}</h3>
            <ul style={{ ...col('var(--space-3)'), marginTop: 'var(--space-2)' }}>
              {faqs.map((f) => (
                <li key={f.q}>
                  <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>{f.q}</p>
                  <p style={body}>{f.a}</p>
                </li>
              ))}
            </ul>
          </section>
          {p.warnings.length > 0 && (
            <section>
              <h3 style={eyebrow}>{C.productWarnings}</h3>
              <div style={{ ...col('var(--space-1)'), marginTop: 'var(--space-2)' }}>
                {p.warnings.map((w) => (
                  <p key={w} style={meta}>
                    {w}
                  </p>
                ))}
              </div>
            </section>
          )}
          <div>
            <Badge tone="neutral">{p.type}</Badge>
          </div>
        </div>
      </ModalBody>
    </Modal>
  )
}
