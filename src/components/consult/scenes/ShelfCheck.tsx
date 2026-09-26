'use client'

import { useState } from 'react'
import { SHELF_LABEL } from '@/lib/consult/summary'
import type { ShelfItem } from '@/lib/consult/types'
import { Chip, Hint, QuietLink } from '../controls'
import { UploadSheet, type UploadCard } from '../UploadSheet'
import { scanShelf } from '../scanRequest'
import type { SceneProps } from './registry'

/**
 * The shelf check (build C11).
 *
 * Chips for what they already take, so the stack engine can skip duplicates
 * and count existing caffeine. "Nothing yet" is an answer of its own and clears
 * the rest; picking anything clears "Nothing yet".
 *
 * With the AI layer on, "Scan my shelf instead" (U1) reads a photo into the
 * same chips: what it finds comes back as cards to confirm, and only confirmed
 * ones are added — to whatever was already tapped, never replacing it.
 */

export const SHELF_CONSENT =
  'Send this photo to be read once. It isn’t stored, and any medicines in it are ignored.'

/** Confirmed scan results added to what's already tapped. */
export function mergeShelf(shelf: ShelfItem[] | null, found: ShelfItem[]): ShelfItem[] | null {
  const next = [...new Set([...(shelf ?? []), ...found])]
  return next.length ? next : shelf
}

export const SHELF: ShelfItem[] = [
  'multivitamin',
  'vitamin-d',
  'creatine',
  'protein',
  'omega-3',
  'pre-workout',
  'magnesium',
  'collagen',
]

export function toggleShelf(shelf: ShelfItem[] | null, item: ShelfItem): ShelfItem[] | null {
  const current = shelf ?? []
  const next = current.includes(item) ? current.filter((i) => i !== item) : [...current, item]
  // Untapping the last one goes back to unanswered, not to "nothing yet".
  return next.length ? next : null
}

export function ShelfCheck({ answers, onAnswer, ai, onReading, scan = scanShelf }: SceneProps & { scan?: (image: string) => Promise<ShelfItem[] | null> }) {
  const shelf = answers.shelf
  const nothing = shelf !== null && shelf.length === 0
  const [scanning, setScanning] = useState(false)

  const read = async (image: string): Promise<UploadCard[] | null> => {
    const items = await scan(image)
    return items && items.map((i) => ({ key: i, label: SHELF_LABEL[i] }))
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-5)' }}>
      <div role="group" aria-label="What you already take" className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
        {SHELF.map((item) => (
          <Chip key={item} label={SHELF_LABEL[item]} selected={Boolean(shelf?.includes(item))} onToggle={() => onAnswer({ shelf: toggleShelf(shelf, item) })} />
        ))}
        <Chip label="Nothing yet" selected={nothing} onToggle={() => onAnswer({ shelf: nothing ? null : [] })} />
      </div>
      {ai && (
        <div>
          <QuietLink icon="camera" onClick={() => setScanning(true)}>
            Scan my shelf instead
          </QuietLink>
        </div>
      )}
      <div aria-live="polite">
        {shelf && shelf.length > 0 && <Hint>I won&apos;t double up on {shelf.length === 1 ? 'that' : 'these'}.</Hint>}
      </div>
      {scanning && (
        <UploadSheet
          title="Scan my shelf"
          consent={SHELF_CONSENT}
          read={read}
          onReading={(r) => onReading?.(r)}
          onConfirm={(keys) => onAnswer({ shelf: mergeShelf(shelf, keys as ShelfItem[]) })}
          onClose={() => {
            setScanning(false)
            onReading?.(false)
          }}
        >
          <p style={{ color: 'var(--amp-ink-2)' }}>Line up your tubs and bottles with the labels facing the camera.</p>
        </UploadSheet>
      )}
    </div>
  )
}
