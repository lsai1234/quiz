'use client'

import { useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { Button, Input, Modal, ModalBody } from '@/components/system'

/**
 * Choosing a product for a stack.
 *
 * Lifted out of the bundle editor when the products moved to their own record:
 * it belongs to whoever is building a stack, and that is now the pre-built
 * bundle editor rather than the package that sells one.
 */
export function ProductPicker({ products, disabledIds, onPick, onClose }: { products: CatalogueProduct[]; disabledIds: Set<string>; onPick: (p: CatalogueProduct) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const filtered = products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase()))
  return (
    <Modal onClose={onClose} size="md" label="Add a product to this bundle">
      <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--edge)' }}>
        <Input
          label="Search products"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products…"
        />
      </div>
      <ModalBody>
          {filtered.map((p) => {
            const disabled = disabledIds.has(p.id)
            return (
              <Button
                key={p.id}
                variant="ghost"
                fullWidth
                disabled={disabled}
                onClick={() => onPick(p)}
                className="justify-between text-left"
              >
                <span className="min-w-0">
                  <span
                    className="block truncate"
                    style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}
                  >
                    {p.title}
                  </span>
                  <span
                    className="block"
                    style={{
                      fontSize: 'var(--text-meta)',
                      fontWeight: 'var(--weight-body)',
                      color: 'var(--ink-3)',
                    }}
                  >
                    {p.category} · {p.stackSlots[0]}
                  </span>
                </span>
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--accent)' }}>
                  {disabled ? 'Added' : 'Add'}
                </span>
              </Button>
            )
          })}
        {filtered.length === 0 && (
          <p className="text-center" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', padding: 'var(--space-8) 0' }}>
            No products match.
          </p>
        )}
      </ModalBody>
    </Modal>
  )
}
