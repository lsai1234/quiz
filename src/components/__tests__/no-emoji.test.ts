import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * No emoji, and no characters typed where a glyph belongs.
 *
 * The hub shipped `😞 😕 😐 🙂 😄` as a rating control, `🌱` and `⚡` as status
 * badges, `💪` inside two sentences, and `✕ ▲ ▼ ★ ✓` as interface icons. Emoji
 * render as somebody else's artwork — a different drawing on every platform,
 * unstyleable, and cartoonish next to the rest of the design — and a typed `✕`
 * is a character pretending to be a button.
 *
 * Every one of those now has a drawn equivalent in `@/components/ui/Icon`, so
 * this test exists to stop them coming back one convenient paste at a time.
 *
 * Scope is the member-facing app. The founders' portal is deliberately excluded:
 * it is an internal tool, and holding it to the customer-facing bar is a cost
 * with no reader to benefit from it.
 */

const ROOTS = [
  'src/components/hub',
  'src/components/order',
  'src/components/stack-review',
  'src/components/shop',
  'src/components/quiz',
  'src/components/receipt',
  'src/components/bundles',
  'src/components/scroll',
  'src/components/auth',
  'src/components/subscription',
  'src/components/legal',
  'src/components/brand',
  'src/components/stack',
  'src/components/ui',
]
const FILES = ['src/lib/feedback.ts']

/**
 * Pictographic emoji, plus the symbol blocks whose characters were being used as
 * interface icons: geometric shapes (▲ ▼ ◔ ▾), miscellaneous symbols (★ ⚠ ⚡)
 * and dingbats (✓ ✕ ✨).
 *
 * Arrows (← →) and the minus sign (−) are absent on purpose. Those are
 * typography, not iconography: `Checkout →` is a house tic used by the screens
 * this whole effort is trying to match, and `−£4.20` is how a negative amount is
 * correctly set.
 */
const BANNED = /[■-◿☀-⛿✀-➿⬀-⯿️\u{1F000}-\u{1FAFF}]/u

/** Deliberate exceptions, each earning its place. */
const ALLOWED = new Set([
  '✦', // ✦ — the brand's four-point spark, used on stat bars and the hero
  '✱', // ✱ — the heavy asterisk that rules off a printed receipt
])

/**
 * Comments are exempt. Several of them quote the very characters this test
 * bans, to record what was removed and why — which is worth keeping, and is not
 * something a member ever sees.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === '__tests__') continue
      out.push(...walk(path))
    } else if (/\.tsx?$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

describe('the member-facing app', () => {
  const sources = [...ROOTS.flatMap(walk), ...FILES]

  it('covers a meaningful amount of ground', () => {
    // A guard on the guard: a broken glob would make every assertion below pass
    // by scanning nothing at all.
    expect(sources.length).toBeGreaterThan(60)
  })

  it('contains no emoji, and no characters standing in for icons', () => {
    const offences: string[] = []

    for (const path of sources) {
      const lines = stripComments(readFileSync(path, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        for (const char of line) {
          if (BANNED.test(char) && !ALLOWED.has(char)) {
            offences.push(`${path}:${i + 1}  ${char}  ${line.trim().slice(0, 80)}`)
          }
        }
      })
    }

    expect(offences).toEqual([])
  })
})
