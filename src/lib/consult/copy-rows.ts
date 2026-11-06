import type { ReviewRow } from '@/lib/consult/review-pack'

/**
 * Rows for every word in a copy file: each string as it is, and each wording
 * that takes values with an example of them (`examples`, by key). A key with
 * no example is skipped loudly rather than guessed, so a new wording can't
 * slip out of the pack unseen.
 */
export function copyRows(
  section: string,
  where: string,
  copy: Record<string, unknown>,
  examples: Record<string, readonly unknown[]>,
  context: Record<string, string> = {},
  skip: readonly string[] = [],
): ReviewRow[] {
  const rows: ReviewRow[] = []
  for (const [key, value] of Object.entries(copy)) {
    if (skip.includes(key)) continue
    const note = context[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
    if (typeof value === 'string') rows.push([section, where, value, note])
    else if (typeof value === 'function') {
      const args = examples[key]
      if (!args) throw new Error(`copyRows: no example for ${section} › ${key}`)
      rows.push([section, where, (value as (...a: unknown[]) => string)(...args), `${note}. Example`])
    } else if (Array.isArray(value)) {
      for (const v of value) if (typeof v === 'string') rows.push([section, where, v, note])
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) if (typeof v === 'string') rows.push([section, where, v, `${note}: ${k}`])
    }
  }
  return rows
}
