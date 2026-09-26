'use client'

import { CHANGE_LABEL } from '@/lib/consult/summary'
import type { AgeingChange } from '@/lib/consult/types'
import type { GlyphName } from '../Glyph'
import { Tile } from '../controls'
import type { SceneProps } from './registry'

/**
 * What's got harder lately? (batch 5, active agers only)
 *
 * Everyday things, in everyday words: the stairs, carrying the shopping,
 * remembering where the keys went. Not symptoms and not conditions, which
 * belong to the circuit check. "Nothing's changed" is an answer of its own,
 * and so is leaving it blank.
 */

export const CHANGES: { key: AgeingChange; icon: GlyphName; sub: string }[] = [
  { key: 'getting-about', icon: 'body', sub: 'Stairs, stiff mornings, getting up' },
  { key: 'strength', icon: 'gym', sub: 'Carrying shopping, opening jars' },
  { key: 'staying-sharp', icon: 'focus', sub: 'Names, keys, losing a thought' },
  { key: 'energy', icon: 'battery', sub: 'Flagging by the afternoon' },
  { key: 'sleeping-through', icon: 'sleep', sub: 'Waking in the night' },
]

export function toggleChange(changes: AgeingChange[] | null, key: AgeingChange): AgeingChange[] | null {
  const now = changes ?? []
  const next = now.includes(key) ? now.filter((c) => c !== key) : [...now, key]
  return next.length ? next : null
}

export function ChangesPicker({ answers, onAnswer }: SceneProps) {
  const changes = answers.changes
  const nothing = changes !== null && changes.length === 0
  return (
    <div role="group" aria-label="What’s got harder" className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
      {CHANGES.map((c) => (
        <Tile
          key={c.key}
          layout="row"
          icon={c.icon}
          label={CHANGE_LABEL[c.key]}
          sub={c.sub}
          selected={Boolean(changes?.includes(c.key))}
          onSelect={() => onAnswer({ changes: toggleChange(changes, c.key) })}
        />
      ))}
      <Tile layout="row" icon="check" label="Nothing’s changed" selected={nothing} onSelect={() => onAnswer({ changes: nothing ? null : [] })} />
    </div>
  )
}
